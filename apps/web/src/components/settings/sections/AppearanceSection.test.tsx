import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { AppearanceSection } from './AppearanceSection';

/**
 * Appearance pulls from the settings + plugin stores. Both are selector-based,
 * so the mocks apply the selector to a static snapshot.
 */
const settingsState = {
  theme: 'forge',
  setTheme: vi.fn(),
  chrome: { showStatusBar: true },
  setChromeToggle: vi.fn(),
};

const pluginState = {
  // No plugin themes — exercises the built-in ThemeGrid path.
  themes: new Map<string, never>(),
};

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: (selector: (s: typeof settingsState) => unknown) => selector(settingsState),
}));

vi.mock('@/stores/usePluginStore', () => ({
  usePluginStore: (selector: (s: typeof pluginState) => unknown) => selector(pluginState),
}));

// The appearance preview + heavier appearance cards reach into IndexedDB /
// native effect IPC; stub them so this test owns only the responsive shell.
vi.mock('@/components/settings/previews/AppearancePreview', () => ({
  AppearancePreview: () => null,
}));
vi.mock('@/components/settings/sections/appearance/BackgroundCard', () => ({
  BackgroundCard: () => null,
}));
vi.mock('@/components/settings/sections/appearance/WindowEffectCard', () => ({
  WindowEffectCard: () => null,
}));
vi.mock('@/components/settings/sections/appearance/CustomThemesCard', () => ({
  CustomThemesCard: () => null,
}));

afterEach(cleanup);

describe('AppearanceSection responsive layout', () => {
  it('declares the settings container context on its root', () => {
    const { container } = render(<AppearanceSection />);
    const root = container.firstElementChild as HTMLElement;
    // Every `@*/settings:` swatch-grid variant resolves against this context;
    // without it the grid would silently fall back to two columns everywhere.
    expect(root.className).toContain('@container/settings');
  });

  it('renders the built-in theme swatch grid with container-query columns', () => {
    const { container } = render(<AppearanceSection />);
    // The swatch grid is the multi-column grid (the only `grid-cols-2` node);
    // `.grid` alone also matches SettingsCard header icon tiles.
    const grid = container.querySelector('[class*="grid-cols-2"]');
    expect(grid).not.toBeNull();
    const cls = grid!.className;
    expect(cls).toContain('grid-cols-2');
    expect(cls).toContain('@md/settings:grid-cols-3');
    expect(cls).toContain('@2xl/settings:grid-cols-4');
    expect(cls).not.toContain('md:grid-cols-4');
  });
});
