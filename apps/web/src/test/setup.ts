import { vi } from 'vitest';

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
