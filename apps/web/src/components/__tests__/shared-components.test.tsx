import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StatusLegend, StatusDot } from '../shared/StatusLegend';
import { ProgressBar } from '../shared/ProgressBar';
import { UsageCard } from '../shared/UsageCard';
import { TaskBadge } from '../terminal/TaskBadge';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import { IdleLandingView } from '../shared/IdleLandingView';

// ─── StatusLegend ────────────────────────────────────────────────────────────

describe('StatusLegend', () => {
  it('renders without crashing with no props', () => {
    const { container } = render(<StatusLegend />);
    expect(container).toBeTruthy();
  });

  it('renders without crashing when showCounts is false (shows all labels)', () => {
    const { container } = render(<StatusLegend showCounts={false} />);
    expect(container.textContent).toContain('Working');
    expect(container.textContent).toContain('Idle');
    expect(container.textContent).toContain('Error');
  });

  it('renders status labels with counts when counts are provided', () => {
    const { container } = render(
      <StatusLegend counts={{ working: 3, idle: 1 }} showCounts={true} />
    );
    expect(container.textContent).toContain('Working');
    expect(container.textContent).toContain('(3)');
    expect(container.textContent).toContain('Idle');
    expect(container.textContent).toContain('(1)');
  });

  it('hides statuses with zero count when showCounts is true', () => {
    const { container } = render(<StatusLegend counts={{ working: 2 }} showCounts={true} />);
    expect(container.textContent).toContain('Working');
    expect(container.textContent).not.toContain('Error');
  });
});

// ─── StatusDot ───────────────────────────────────────────────────────────────

describe('StatusDot', () => {
  it('renders without crashing with required props', () => {
    const { container } = render(<StatusDot status="working" />);
    expect(container.querySelector('span')).toBeTruthy();
  });

  it('uses default title from status config', () => {
    render(<StatusDot status="idle" />);
    const dot = screen.getByTitle('Idle');
    expect(dot).toBeTruthy();
  });

  it('accepts a custom title', () => {
    render(<StatusDot status="error" title="Custom Title" />);
    const dot = screen.getByTitle('Custom Title');
    expect(dot).toBeTruthy();
  });
});

// ─── ProgressBar ─────────────────────────────────────────────────────────────

describe('ProgressBar', () => {
  it('renders without crashing with required props', () => {
    const { container } = render(<ProgressBar percentage={50} colorClass="bg-blue-500" />);
    expect(container).toBeTruthy();
  });

  it('sets width style based on percentage', () => {
    const { container } = render(<ProgressBar percentage={75} colorClass="bg-green-500" />);
    const inner = container.querySelector('[style]') as HTMLElement;
    expect(inner).toBeTruthy();
    expect(inner.style.width).toBe('75%');
  });

  it('clamps percentage to 0-100 range', () => {
    const { container: c1 } = render(<ProgressBar percentage={-10} colorClass="bg-red-500" />);
    const inner1 = c1.querySelector('[style]') as HTMLElement;
    expect(inner1).toBeTruthy();
    expect(inner1.style.width).toBe('0%');

    const { container: c2 } = render(<ProgressBar percentage={150} colorClass="bg-red-500" />);
    const inner2 = c2.querySelector('[style]') as HTMLElement;
    expect(inner2).toBeTruthy();
    expect(inner2.style.width).toBe('100%');
  });
});

// ─── UsageCard ───────────────────────────────────────────────────────────────

describe('UsageCard', () => {
  it('renders without crashing with required props', () => {
    const { container } = render(
      <UsageCard title="API Usage" subtitle="Monthly limit" percentage={40} />
    );
    expect(container).toBeTruthy();
  });

  it('displays title, subtitle, and percentage', () => {
    const { container } = render(
      <UsageCard title="API Usage" subtitle="Monthly limit" percentage={40} />
    );
    expect(container.textContent).toContain('API Usage');
    expect(container.textContent).toContain('Monthly limit');
    expect(container.textContent).toContain('40%');
  });

  it('shows reset text when provided', () => {
    const { container } = render(
      <UsageCard
        title="API Usage"
        subtitle="Monthly"
        percentage={50}
        resetText="Resets in 3 days"
      />
    );
    expect(container.textContent).toContain('Resets in 3 days');
  });

  it('shows N/A for invalid percentage (NaN)', () => {
    const { container } = render(
      <UsageCard title="API Usage" subtitle="Monthly" percentage={NaN} />
    );
    expect(container.textContent).toContain('N/A');
  });
});

// ─── TaskBadge ───────────────────────────────────────────────────────────────

describe('TaskBadge', () => {
  it('renders without crashing with required props', () => {
    const { container } = render(<TaskBadge taskCount={0} hasInProgress={false} />);
    expect(container).toBeTruthy();
  });

  it('does not show count badge when taskCount is 0', () => {
    const { container } = render(<TaskBadge taskCount={0} hasInProgress={false} />);
    // Only the icon span should be present, no badge with count text
    const spans = container.querySelectorAll('span');
    // The outer span is the wrapper; with 0 tasks there's no inner count span
    expect(spans.length).toBe(1);
  });

  it('shows count when taskCount is greater than 0', () => {
    const { container } = render(<TaskBadge taskCount={5} hasInProgress={false} />);
    expect(container.textContent).toContain('5');
  });

  it('shows 99+ when taskCount exceeds 99', () => {
    const { container } = render(<TaskBadge taskCount={150} hasInProgress={true} />);
    expect(container.textContent).toContain('99+');
  });
});

// ─── ErrorBoundary ───────────────────────────────────────────────────────────

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Child Content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Child Content')).toBeTruthy();
  });

  it('renders fallback UI when a child throws', () => {
    // Suppress console.error from React error boundary logging
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ThrowingComponent = () => {
      throw new Error('Test explosion');
    };

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Test explosion')).toBeTruthy();
    expect(screen.getByText('Reload')).toBeTruthy();

    consoleSpy.mockRestore();
  });

  it('displays the error message in the fallback', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ThrowingComponent = () => {
      throw new Error('Specific error message');
    };

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Specific error message')).toBeTruthy();

    consoleSpy.mockRestore();
  });
});

// ─── IdleLandingView ─────────────────────────────────────────────────────────

describe('IdleLandingView', () => {
  it('renders without crashing with required props', () => {
    const { container } = render(<IdleLandingView onAddSession={vi.fn()} />);
    expect(container).toBeTruthy();
  });

  it('displays heading and description text', () => {
    render(<IdleLandingView onAddSession={vi.fn()} />);
    expect(screen.getByText('No Active Sessions')).toBeTruthy();
    expect(
      screen.getByText('Add sessions to start orchestrating your AI coding assistants')
    ).toBeTruthy();
  });

  it('displays keyboard shortcut hints', () => {
    const { container } = render(<IdleLandingView onAddSession={vi.fn()} />);
    expect(container.textContent).toContain('Shift+N');
    expect(container.textContent).toContain('to add one');
  });

  it('renders the add session button with correct aria-label', () => {
    render(<IdleLandingView onAddSession={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Set up sessions' });
    expect(button).toBeTruthy();
  });
});
