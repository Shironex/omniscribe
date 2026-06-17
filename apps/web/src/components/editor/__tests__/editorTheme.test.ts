import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { probeEditorTokens, buildEditorTheme, observeEditorTheme } from '../editorTheme';

describe('editorTheme', () => {
  beforeEach(() => {
    // Clean slate for the documentElement style + class between tests.
    document.documentElement.removeAttribute('style');
    document.documentElement.className = '';
  });

  afterEach(() => {
    document.documentElement.removeAttribute('style');
    document.documentElement.className = '';
  });

  describe('probeEditorTokens', () => {
    it('reads CSS custom properties off documentElement', () => {
      const root = document.documentElement;
      root.style.setProperty('--background', '#101010');
      root.style.setProperty('--foreground', '#fafafa');
      root.style.setProperty('--primary', '#ff8c42');
      root.style.setProperty('--accent', '#5b8def');

      const tokens = probeEditorTokens();

      expect(tokens.background).toBe('#101010');
      expect(tokens.foreground).toBe('#fafafa');
      expect(tokens.primary).toBe('#ff8c42');
      expect(tokens.accent).toBe('#5b8def');
    });

    it('falls back to a neutral palette when a token is absent', () => {
      // No properties set → every token resolves to its fallback (non-empty).
      const tokens = probeEditorTokens();
      expect(tokens.background).toBeTruthy();
      expect(tokens.foreground).toBeTruthy();
      expect(tokens.primary).toBeTruthy();
    });

    it('re-probes after the active tokens change', () => {
      document.documentElement.style.setProperty('--background', '#111111');
      expect(probeEditorTokens().background).toBe('#111111');

      document.documentElement.style.setProperty('--background', '#222222');
      expect(probeEditorTokens().background).toBe('#222222');
    });
  });

  describe('buildEditorTheme', () => {
    it('returns a non-empty extension array', () => {
      const ext = buildEditorTheme();
      expect(Array.isArray(ext)).toBe(true);
      expect((ext as unknown[]).length).toBeGreaterThan(0);
    });
  });

  describe('observeEditorTheme', () => {
    it('invokes the callback when the documentElement class changes', async () => {
      let calls = 0;
      const dispose = observeEditorTheme(() => {
        calls += 1;
      });

      document.documentElement.className = 'paper';
      // MutationObserver callbacks are microtask-scheduled.
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(calls).toBeGreaterThan(0);
      dispose();
    });

    it('stops firing after dispose', async () => {
      let calls = 0;
      const dispose = observeEditorTheme(() => {
        calls += 1;
      });
      dispose();

      document.documentElement.className = 'nord';
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(calls).toBe(0);
    });
  });
});
