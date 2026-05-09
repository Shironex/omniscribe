import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import type { SplashScreenState } from '@/hooks/useSplashScreen';

const mockHook = vi.fn<() => SplashScreenState>();

vi.mock('@/hooks/useSplashScreen', () => ({
  useSplashScreen: () => mockHook(),
}));

vi.mock('@/lib/platform', () => ({
  IS_ELECTRON: true,
  IS_MAC: true,
  IS_WINDOWS: false,
  IS_LINUX: false,
}));

import { SplashScreen } from '../SplashScreen';

function makeState(over: Partial<SplashScreenState> = {}): SplashScreenState {
  return {
    isVisible: true,
    isDismissing: false,
    showSpinner: true,
    statusText: 'Connecting...',
    version: '0.4.2',
    variant: 'loading',
    steps: [
      { id: 'backend', label: 'spinning up backend', status: 'running' },
      { id: 'socket', label: 'connecting to socket', status: 'wait' },
      { id: 'workspace', label: 'restoring workspace', status: 'wait' },
    ],
    error: null,
    ...over,
  };
}

describe('SplashScreen', () => {
  beforeEach(() => {
    mockHook.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when not visible', () => {
    mockHook.mockReturnValue(makeState({ isVisible: false }));
    const { container } = render(<SplashScreen />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the wordmark in the loading variant', () => {
    mockHook.mockReturnValue(makeState());
    render(<SplashScreen />);
    expect(screen.getByText('omniscribe')).toBeTruthy();
  });

  it('exposes role=status with aria-busy=true while loading', () => {
    mockHook.mockReturnValue(makeState());
    render(<SplashScreen />);
    const root = screen.getByRole('status');
    expect(root.getAttribute('aria-busy')).toBe('true');
    expect(root.getAttribute('aria-live')).toBe('polite');
  });

  it('renders all three boot-trace rows with correct status labels', () => {
    mockHook.mockReturnValue(
      makeState({
        steps: [
          { id: 'backend', label: 'spinning up backend', status: 'done' },
          { id: 'socket', label: 'connecting to socket', status: 'running' },
          { id: 'workspace', label: 'restoring workspace', status: 'wait' },
        ],
      })
    );
    render(<SplashScreen />);
    expect(screen.getByText('spinning up backend')).toBeTruthy();
    expect(screen.getByText('connecting to socket')).toBeTruthy();
    expect(screen.getByText('restoring workspace')).toBeTruthy();
    expect(screen.getByText('done')).toBeTruthy();
    expect(screen.getByText('running')).toBeTruthy();
    expect(screen.getByText('wait')).toBeTruthy();
  });

  it('marks the running row with aria-current="step"', () => {
    mockHook.mockReturnValue(
      makeState({
        steps: [
          { id: 'backend', label: 'spinning up backend', status: 'done' },
          { id: 'socket', label: 'connecting to socket', status: 'running' },
          { id: 'workspace', label: 'restoring workspace', status: 'wait' },
        ],
      })
    );
    render(<SplashScreen />);
    const items = screen.getAllByRole('listitem');
    const current = items.find(li => li.getAttribute('aria-current') === 'step');
    expect(current).toBeTruthy();
    expect(current?.textContent).toContain('connecting to socket');
  });

  it('renders Retry + Close buttons in the error variant', () => {
    mockHook.mockReturnValue(
      makeState({
        variant: 'error',
        error: 'Backend connection failed.',
        steps: [
          { id: 'backend', label: 'spinning up backend', status: 'error' },
          { id: 'socket', label: 'connecting to socket', status: 'error' },
          { id: 'workspace', label: 'restoring workspace', status: 'wait' },
        ],
      })
    );
    render(<SplashScreen />);
    const retry = screen.getByRole('button', { name: /retry/i });
    const close = screen.getByRole('button', { name: /close/i });
    expect(retry).toBeTruthy();
    expect(close).toBeTruthy();
  });

  it('autofocuses the Retry button in the error variant', () => {
    mockHook.mockReturnValue(
      makeState({
        variant: 'error',
        error: 'Backend connection failed.',
      })
    );
    render(<SplashScreen />);
    const retry = screen.getByRole('button', { name: /retry/i });
    // React's autoFocus prop calls focus() on mount. We assert via the
    // active element rather than the autofocus attribute (JSDOM does not
    // reflect autofocus on the element after it has been consumed).
    expect(document.activeElement).toBe(retry);
  });

  it('flips aria-busy to false in the error variant', () => {
    mockHook.mockReturnValue(makeState({ variant: 'error', error: 'Backend connection failed.' }));
    render(<SplashScreen />);
    const root = screen.getByRole('status');
    expect(root.getAttribute('aria-busy')).toBe('false');
  });

  it('shows "applying update" copy in the updating variant', () => {
    mockHook.mockReturnValue(makeState({ variant: 'updating' }));
    render(<SplashScreen />);
    // Two strings — one in panel, one in footer.
    const matches = screen.getAllByText(/applying update/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the wordmark INSTALLING tag in the updating variant', () => {
    mockHook.mockReturnValue(makeState({ variant: 'updating' }));
    render(<SplashScreen />);
    expect(screen.getByText(/installing/i)).toBeTruthy();
  });

  it('renders ORCHESTRATOR tag with version + platform in the loading variant', () => {
    mockHook.mockReturnValue(makeState());
    render(<SplashScreen />);
    expect(screen.getByText(/orchestrator/i)).toBeTruthy();
    // The version string is rendered in two places (wordmark + footer);
    // either is fine — we just want to confirm the value reaches the UI.
    expect(screen.getAllByText(/v0\.4\.2/).length).toBeGreaterThan(0);
  });

  it('renders the watermark glyph as decorative', () => {
    mockHook.mockReturnValue(makeState());
    const { container } = render(<SplashScreen />);
    // Watermark is aria-hidden — should not be in accessibility tree but
    // should be in the DOM as a span with the glyph text.
    const glyph = container.querySelector('span[aria-hidden="true"]');
    expect(glyph).toBeTruthy();
  });
});
