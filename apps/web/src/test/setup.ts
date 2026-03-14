import { vi } from 'vitest';

// Polyfill scrollIntoView for jsdom (used by cmdk Command component)
if (typeof Element.prototype.scrollIntoView === 'undefined') {
  Element.prototype.scrollIntoView = function () {};
}

// Polyfill hasPointerCapture for jsdom (used by Radix UI primitives)
if (typeof Element.prototype.hasPointerCapture === 'undefined') {
  Element.prototype.hasPointerCapture = function () {
    return false;
  };
}

// Polyfill ResizeObserver for jsdom (used by Radix UI dialogs, popovers, etc.)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

// Mock sonner toast globally
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  }),
}));

// Silence the logger from @omniscribe/shared to keep test output clean
vi.mock('@omniscribe/shared', async importOriginal => {
  const actual = await importOriginal<typeof import('@omniscribe/shared')>();
  const silentLogger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
  };
  return {
    ...actual,
    createLogger: () => silentLogger,
  };
});
