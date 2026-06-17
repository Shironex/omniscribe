import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  useCustomThemesStore,
  getCustomTheme,
  customThemeDomClass,
  serializeCustomTheme,
  CUSTOM_THEMES_STORAGE_KEY,
  CUSTOM_THEME_STYLE_ELEMENT_ID,
  MAX_CUSTOM_THEMES,
} from '../store';
import { customThemeId, type CustomTheme } from '../schema';

function makeTheme(id: string, label = id): CustomTheme {
  return {
    id,
    label,
    isDark: true,
    colors: { '--background': '#0e0e0e', '--foreground': '#f0f0f0', '--primary': '#e89143' },
  };
}

/** Reset the singleton store + DOM + storage between tests. */
function reset(): void {
  localStorage.clear();
  // Empty the store and re-sync (clears the shared style element + registry).
  const store = useCustomThemesStore.getState();
  for (const t of [...store.themes]) {
    store.removeTheme(t.id);
  }
  document.getElementById(CUSTOM_THEME_STYLE_ELEMENT_ID)?.remove();
  localStorage.clear();
}

describe('customThemeDomClass', () => {
  it('maps the runtime id to a DOM-safe selector class', () => {
    expect(customThemeDomClass('custom:midnight')).toBe('custom-midnight');
    expect(customThemeDomClass('custom:my_theme-2')).toBe('custom-my_theme-2');
  });
});

describe('useCustomThemesStore — add', () => {
  beforeEach(reset);
  afterEach(reset);

  it('adds a valid theme and persists it', () => {
    const result = useCustomThemesStore.getState().addFromObject(makeTheme('midnight'));
    expect(result.ok).toBe(true);
    expect(result.runtimeId).toBe('custom:midnight');

    expect(useCustomThemesStore.getState().themes).toHaveLength(1);

    const persisted = JSON.parse(localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY)!);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].id).toBe('midnight');
  });

  it('rejects an invalid theme with errors and no mutation', () => {
    const result = useCustomThemesStore
      .getState()
      .addFromObject({ id: '1bad', label: '', isDark: 1 });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(useCustomThemesStore.getState().themes).toHaveLength(0);
  });

  it('replaces a theme with the same slug instead of duplicating', () => {
    const store = useCustomThemesStore.getState();
    store.addFromObject(makeTheme('dup', 'First'));
    const result = store.addFromObject(makeTheme('dup', 'Second'));
    expect(result.ok).toBe(true);
    const themes = useCustomThemesStore.getState().themes;
    expect(themes).toHaveLength(1);
    expect(themes[0].label).toBe('Second');
  });

  it('registers the theme so getCustomTheme resolves it (mirrors getPluginTheme)', () => {
    useCustomThemesStore.getState().addFromObject(makeTheme('reg'));
    const resolved = getCustomTheme(customThemeId('reg'));
    expect(resolved).toBeDefined();
    expect(resolved!.id).toBe('reg');
    expect(getCustomTheme('custom:does-not-exist')).toBeUndefined();
  });
});

describe('useCustomThemesStore — DOM injection', () => {
  beforeEach(reset);
  afterEach(reset);

  it('injects a shared style element with a :root.custom-{slug} rule', () => {
    useCustomThemesStore.getState().addFromObject(makeTheme('inject'));
    const el = document.getElementById(CUSTOM_THEME_STYLE_ELEMENT_ID);
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain(':root.custom-inject');
    expect(el!.textContent).toContain('--primary: #e89143;');
  });

  it('removes the style element when the last theme is deleted', () => {
    const store = useCustomThemesStore.getState();
    store.addFromObject(makeTheme('only'));
    expect(document.getElementById(CUSTOM_THEME_STYLE_ELEMENT_ID)).not.toBeNull();
    store.removeTheme('only');
    expect(document.getElementById(CUSTOM_THEME_STYLE_ELEMENT_ID)).toBeNull();
  });

  it('does not leak CSS-injection characters into the stylesheet', () => {
    // Dangerous color values are rejected at validation, so they never reach the
    // DOM. A single safe theme produces exactly one rule block — so exactly one
    // opening and one closing brace, with no injected extras.
    useCustomThemesStore.getState().addFromObject(makeTheme('safe'));
    const el = document.getElementById(CUSTOM_THEME_STYLE_ELEMENT_ID);
    expect((el!.textContent!.match(/{/g) ?? []).length).toBe(1);
    expect((el!.textContent!.match(/}/g) ?? []).length).toBe(1);
    // No declaration-injection semicolons beyond the per-property terminators.
    expect((el!.textContent!.match(/;/g) ?? []).length).toBe(3); // 3 color props
  });
});

describe('useCustomThemesStore — caps', () => {
  beforeEach(reset);
  afterEach(reset);

  it('enforces the count cap', () => {
    const store = useCustomThemesStore.getState();
    for (let i = 0; i < MAX_CUSTOM_THEMES; i++) {
      expect(store.addFromObject(makeTheme(`t${i}`)).ok).toBe(true);
    }
    expect(useCustomThemesStore.getState().themes).toHaveLength(MAX_CUSTOM_THEMES);

    const overflow = store.addFromObject(makeTheme('overflow'));
    expect(overflow.ok).toBe(false);
    expect(overflow.errors.join(' ')).toMatch(/at most/);
    expect(useCustomThemesStore.getState().themes).toHaveLength(MAX_CUSTOM_THEMES);
  });

  it('updating an existing slug at cap is still allowed', () => {
    const store = useCustomThemesStore.getState();
    for (let i = 0; i < MAX_CUSTOM_THEMES; i++) {
      store.addFromObject(makeTheme(`t${i}`));
    }
    // Re-adding an existing slug replaces, doesn't exceed the cap.
    const result = store.addFromObject(makeTheme('t0', 'Renamed'));
    expect(result.ok).toBe(true);
    expect(useCustomThemesStore.getState().themes).toHaveLength(MAX_CUSTOM_THEMES);
  });
});

describe('useCustomThemesStore — remove', () => {
  beforeEach(reset);
  afterEach(reset);

  it('removes by slug and updates persistence + registry', () => {
    const store = useCustomThemesStore.getState();
    store.addFromObject(makeTheme('a'));
    store.addFromObject(makeTheme('b'));
    store.removeTheme('a');

    expect(useCustomThemesStore.getState().themes.map(t => t.id)).toEqual(['b']);
    expect(getCustomTheme(customThemeId('a'))).toBeUndefined();
    const persisted = JSON.parse(localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY)!);
    expect(persisted.map((t: CustomTheme) => t.id)).toEqual(['b']);
  });

  it('is a no-op when the slug does not exist', () => {
    const store = useCustomThemesStore.getState();
    store.addFromObject(makeTheme('keep'));
    store.removeTheme('ghost');
    expect(useCustomThemesStore.getState().themes).toHaveLength(1);
  });
});

describe('serializeCustomTheme', () => {
  it('round-trips through JSON', () => {
    const theme = makeTheme('round');
    const json = serializeCustomTheme(theme);
    expect(JSON.parse(json)).toEqual(theme);
  });
});
