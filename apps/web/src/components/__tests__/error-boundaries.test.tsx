import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createLogger } from '@omniscribe/shared';

import { ErrorBoundary } from '../shared/ErrorBoundary';
import { TerminalErrorBoundary } from '../terminal/TerminalErrorBoundary';

// Get the mocked logger to verify calls
const mockLogger = createLogger('test');

// ─── ErrorBoundary ──────────────────────────────────────────────────────────

describe('ErrorBoundary', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('calls logger.error via componentDidCatch when a child throws', () => {
    vi.mocked(mockLogger.error).mockClear();

    const ThrowingComponent = () => {
      throw new Error('Catch me');
    };

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    // The globally mocked createLogger returns a shared silentLogger,
    // so every logger instance shares the same mock functions.
    expect(mockLogger.error).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('calls window.location.reload when the Reload button is clicked', () => {
    const originalLocation = window.location;
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, reload: reloadMock },
      writable: true,
      configurable: true,
    });

    const ThrowingComponent = () => {
      throw new Error('Reload test');
    };

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByText('Reload'));
    expect(reloadMock).toHaveBeenCalledOnce();

    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    consoleSpy.mockRestore();
  });

  it('renders the fallback UI with expected structure', () => {
    const ThrowingComponent = () => {
      throw new Error('Structure test');
    };

    const { container } = render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    // Title
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    // Description
    expect(
      screen.getByText('An unexpected error occurred. Try reloading the application.')
    ).toBeTruthy();
    // Error message in pre tag
    const pre = container.querySelector('pre');
    expect(pre).toBeTruthy();
    expect(pre!.textContent).toBe('Structure test');
    // Reload button
    expect(screen.getByText('Reload')).toBeTruthy();

    consoleSpy.mockRestore();
  });
});

// ─── TerminalErrorBoundary ──────────────────────────────────────────────────

describe('TerminalErrorBoundary', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when no error occurs', () => {
    render(
      <TerminalErrorBoundary sessionId={1}>
        <div>Terminal Content</div>
      </TerminalErrorBoundary>
    );
    expect(screen.getByText('Terminal Content')).toBeTruthy();
    consoleSpy.mockRestore();
  });

  it('shows "Terminal Crashed" fallback when a child throws', () => {
    const ThrowingComponent = () => {
      throw new Error('Terminal exploded');
    };

    render(
      <TerminalErrorBoundary sessionId={1}>
        <ThrowingComponent />
      </TerminalErrorBoundary>
    );

    expect(screen.getByText('Terminal Crashed')).toBeTruthy();
    consoleSpy.mockRestore();
  });

  it('shows "Restart Terminal" button in fallback', () => {
    const ThrowingComponent = () => {
      throw new Error('restart test');
    };

    render(
      <TerminalErrorBoundary sessionId={1}>
        <ThrowingComponent />
      </TerminalErrorBoundary>
    );

    expect(screen.getByText('Restart Terminal')).toBeTruthy();
    consoleSpy.mockRestore();
  });

  it('calls onRestart and resets error state when Restart Terminal is clicked', () => {
    const onRestart = vi.fn();
    let shouldThrow = true;

    const ConditionalThrower = () => {
      if (shouldThrow) throw new Error('restart me');
      return <div>Recovered</div>;
    };

    render(
      <TerminalErrorBoundary sessionId={1} onRestart={onRestart}>
        <ConditionalThrower />
      </TerminalErrorBoundary>
    );

    expect(screen.getByText('Terminal Crashed')).toBeTruthy();

    // Stop throwing before clicking restart
    shouldThrow = false;
    fireEvent.click(screen.getByText('Restart Terminal'));

    expect(onRestart).toHaveBeenCalledOnce();
    // After restart, children should render again
    expect(screen.getByText('Recovered')).toBeTruthy();

    consoleSpy.mockRestore();
  });

  it('toggles Technical Details visibility', () => {
    const ThrowingComponent = () => {
      throw new Error('detail error message');
    };

    render(
      <TerminalErrorBoundary sessionId={1}>
        <ThrowingComponent />
      </TerminalErrorBoundary>
    );

    // Details should be hidden initially
    expect(screen.queryByText('detail error message')).toBeNull();

    // Click to show details
    fireEvent.click(screen.getByText('Technical Details'));
    expect(screen.getByText(/detail error message/)).toBeTruthy();

    // Click again to hide details
    fireEvent.click(screen.getByText('Technical Details'));
    // The pre tag with error details should be gone
    expect(screen.queryByText('detail error message')).toBeNull();

    consoleSpy.mockRestore();
  });

  it('works without onRestart prop (optional callback)', () => {
    let shouldThrow = true;

    const ConditionalThrower = () => {
      if (shouldThrow) throw new Error('no restart prop');
      return <div>Back</div>;
    };

    render(
      <TerminalErrorBoundary sessionId={1}>
        <ConditionalThrower />
      </TerminalErrorBoundary>
    );

    expect(screen.getByText('Terminal Crashed')).toBeTruthy();

    shouldThrow = false;
    // Should not throw when clicking restart without onRestart prop
    fireEvent.click(screen.getByText('Restart Terminal'));
    expect(screen.getByText('Back')).toBeTruthy();

    consoleSpy.mockRestore();
  });
});
