import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getPersistedTheme,
  isPersistedThemeDark,
  THEME_STORAGE_KEY,
} from '@/lib/theme-persistence';
import { useCustomThemesStore, CUSTOM_THEME_STYLE_ELEMENT_ID } from '../store';
import { customThemeId, type CustomTheme } from '../schema';

function makeTheme(id: string, isDark = true): CustomTheme {
  return {
    id,
    label: id,
    isDark,
    colors: { '--background': '#0e0e0e', '--foreground': '#f0f0f0', '--primary': '#e89143' },
  };
}

function resetCustomThemes(): void {
  localStorage.clear();
  const store = useCustomThemesStore.getState();
  for (const t of [...store.themes]) {
    store.removeTheme(t.id);
  }
  document.getElementById(CUSTOM_THEME_STYLE_ELEMENT_ID)?.remove();
  localStorage.clear();
}

describe('getPersistedTheme — custom theme round-trip', () => {
  beforeEach(resetCustomThemes);
  afterEach(resetCustomThemes);

  it('passes through a custom id when the theme still exists', () => {
    useCustomThemesStore.getState().addFromObject(makeTheme('keeper'));
    localStorage.setItem(THEME_STORAGE_KEY, customThemeId('keeper'));

    expect(getPersistedTheme()).toBe('custom:keeper');
  });

  it('falls back to the default theme when the custom theme was deleted', () => {
    // Persist a custom id, but DO NOT register the theme (simulates a deleted
    // theme whose selection id is still in localStorage).
    localStorage.setItem(THEME_STORAGE_KEY, 'custom:ghost');

    expect(getPersistedTheme()).toBe('forge');
  });

  it('falls back after the active custom theme is removed', () => {
    const store = useCustomThemesStore.getState();
    store.addFromObject(makeTheme('temp'));
    localStorage.setItem(THEME_STORAGE_KEY, customThemeId('temp'));
    expect(getPersistedTheme()).toBe('custom:temp');

    // Delete it — next load must not strand on the missing theme.
    store.removeTheme('temp');
    expect(getPersistedTheme()).toBe('forge');
  });

  it('still resolves built-in themes normally', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'nord');
    expect(getPersistedTheme()).toBe('nord');
  });
});

describe('isPersistedThemeDark — custom themes', () => {
  beforeEach(resetCustomThemes);
  afterEach(resetCustomThemes);

  it('reports the custom theme isDark flag', () => {
    const store = useCustomThemesStore.getState();
    store.addFromObject(makeTheme('darkish', true));
    store.addFromObject(makeTheme('lightish', false));

    expect(isPersistedThemeDark(customThemeId('darkish'))).toBe(true);
    expect(isPersistedThemeDark(customThemeId('lightish'))).toBe(false);
  });

  it('defaults a deleted custom theme to dark', () => {
    expect(isPersistedThemeDark('custom:gone')).toBe(true);
  });
});
