export {};

declare global {
  interface Window {
    __testStores?: Record<string, unknown>;
    __testSocket?: unknown;
  }
}
