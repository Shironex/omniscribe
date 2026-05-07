import { describe, it, expect, beforeEach } from 'vitest';
import { cn } from '../utils';
import { themeOptions, darkThemes, lightThemes, getThemeOption } from '../theme';
import {
  THEME_STORAGE_KEY,
  persistTheme,
  getPersistedTheme,
  isPersistedThemeDark,
} from '../theme-persistence';
import {
  PASTE_CHUNK_SIZE,
  PASTE_CHUNK_DELAY_MS,
  LARGE_PASTE_WARNING_THRESHOLD,
} from '../terminal-constants';

// ---------------------------------------------------------------------------
// utils.ts — cn()
// ---------------------------------------------------------------------------
describe('cn (class name utility)', () => {
  it('merges multiple class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes via clsx', () => {
    const showHidden = false;
    const showActive = true;
    expect(cn('base', showHidden && 'hidden', 'visible')).toBe('base visible');
    expect(cn('base', showActive && 'active')).toBe('base active');
  });

  it('deduplicates conflicting Tailwind utilities', () => {
    // tailwind-merge should keep only the last conflicting utility
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('returns empty string when called with no arguments', () => {
    expect(cn()).toBe('');
  });

  it('handles undefined, null, and empty string inputs', () => {
    expect(cn(undefined, null, '', 'valid')).toBe('valid');
  });

  it('handles array inputs', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });

  it('handles object inputs', () => {
    expect(cn({ hidden: true, visible: false })).toBe('hidden');
  });
});

// ---------------------------------------------------------------------------
// platform.ts — IS_MAC, IS_WINDOWS, IS_LINUX
// ---------------------------------------------------------------------------
describe('platform constants', () => {
  // In jsdom there is no window.electronAPI, so platform is undefined
  // and all three flags should be false.
  it('exports IS_MAC, IS_WINDOWS, IS_LINUX as booleans', async () => {
    // Re-import to get fresh module evaluation in jsdom context
    const { IS_MAC, IS_WINDOWS, IS_LINUX } = await import('../platform');
    expect(typeof IS_MAC).toBe('boolean');
    expect(typeof IS_WINDOWS).toBe('boolean');
    expect(typeof IS_LINUX).toBe('boolean');
  });

  it('all platform flags are false when electronAPI is absent', async () => {
    const { IS_MAC, IS_WINDOWS, IS_LINUX } = await import('../platform');
    expect(IS_MAC).toBe(false);
    expect(IS_WINDOWS).toBe(false);
    expect(IS_LINUX).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// theme.ts — themeOptions, darkThemes, lightThemes, getThemeOption
// ---------------------------------------------------------------------------
describe('theme options', () => {
  it('themeOptions is a non-empty readonly array', () => {
    expect(Array.isArray(themeOptions)).toBe(true);
    expect(themeOptions.length).toBeGreaterThan(0);
  });

  it('contains exactly 8 curated themes (7 dark + 1 light)', () => {
    expect(themeOptions.length).toBe(8);
  });

  it('every theme option has required properties', () => {
    for (const opt of themeOptions) {
      expect(typeof opt.value).toBe('string');
      expect(typeof opt.label).toBe('string');
      expect(opt.Icon).toBeDefined(); // React component (forwardRef object)
      expect(typeof opt.testId).toBe('string');
      expect(typeof opt.isDark).toBe('boolean');
      expect(typeof opt.color).toBe('string');
      // color should look like a hex color
      expect(opt.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('every theme has a unique value', () => {
    const values = themeOptions.map(t => t.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('every theme has a unique testId', () => {
    const testIds = themeOptions.map(t => t.testId);
    expect(new Set(testIds).size).toBe(testIds.length);
  });

  it('includes the curated "forge" and "paper" themes', () => {
    const values = themeOptions.map(t => t.value);
    expect(values).toContain('forge');
    expect(values).toContain('paper');
  });
});

describe('darkThemes', () => {
  it('contains only themes where isDark is true', () => {
    expect(darkThemes.length).toBeGreaterThan(0);
    for (const t of darkThemes) {
      expect(t.isDark).toBe(true);
    }
  });

  it('has exactly 7 dark themes', () => {
    expect(darkThemes.length).toBe(7);
  });

  it('starts with the default Forge theme', () => {
    expect(darkThemes[0].value).toBe('forge');
  });
});

describe('lightThemes', () => {
  it('contains only themes where isDark is false', () => {
    expect(lightThemes.length).toBeGreaterThan(0);
    for (const t of lightThemes) {
      expect(t.isDark).toBe(false);
    }
  });

  it('has exactly 1 light theme (Paper)', () => {
    expect(lightThemes.length).toBe(1);
  });

  it('starts with the curated "paper" theme', () => {
    expect(lightThemes[0].value).toBe('paper');
  });
});

describe('darkThemes + lightThemes = themeOptions', () => {
  it('combined dark and light themes equal total themeOptions', () => {
    expect(darkThemes.length + lightThemes.length).toBe(themeOptions.length);
  });
});

describe('getThemeOption', () => {
  it('returns the correct option for a known dark theme', () => {
    const opt = getThemeOption('dracula');
    expect(opt).toBeDefined();
    expect(opt!.label).toBe('Dracula');
    expect(opt!.isDark).toBe(true);
  });

  it('returns the correct option for a known light theme', () => {
    const opt = getThemeOption('paper');
    expect(opt).toBeDefined();
    expect(opt!.label).toBe('Paper');
    expect(opt!.isDark).toBe(false);
  });

  it('returns undefined for an unknown theme', () => {
    // Cast to bypass type checking — runtime should still return undefined
    const opt = getThemeOption('nonexistent' as never);
    expect(opt).toBeUndefined();
  });

  it('returns the default dark theme (Forge)', () => {
    const opt = getThemeOption('forge');
    expect(opt).toBeDefined();
    expect(opt!.value).toBe('forge');
    expect(opt!.isDark).toBe(true);
  });

  it('returns the curated light theme (Paper)', () => {
    const opt = getThemeOption('paper');
    expect(opt).toBeDefined();
    expect(opt!.value).toBe('paper');
    expect(opt!.isDark).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// theme-persistence.ts
// ---------------------------------------------------------------------------
describe('theme-persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('THEME_STORAGE_KEY', () => {
    it('is "omniscribe-theme"', () => {
      expect(THEME_STORAGE_KEY).toBe('omniscribe-theme');
    });
  });

  describe('persistTheme', () => {
    it('stores the theme in localStorage under the correct key', () => {
      persistTheme('dracula');
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dracula');
    });

    it('overwrites the previous value', () => {
      persistTheme('dark');
      persistTheme('nord');
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('nord');
    });

    it('does not throw when localStorage is unavailable', () => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = () => {
        throw new Error('QuotaExceededError');
      };
      expect(() => persistTheme('dark')).not.toThrow();
      Storage.prototype.setItem = original;
    });
  });

  describe('getPersistedTheme', () => {
    it('returns the default ("forge") when nothing is stored', () => {
      expect(getPersistedTheme()).toBe('forge');
    });

    it('returns the stored theme when it is a valid built-in', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'nord');
      expect(getPersistedTheme()).toBe('nord');
    });

    it('returns stored value for valid plugin theme IDs', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'my-plugin-theme');
      expect(getPersistedTheme()).toBe('my-plugin-theme');
    });

    it('returns the default when stored value is not a valid CSS class name', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'has spaces');
      expect(getPersistedTheme()).toBe('forge');
    });

    it('returns the default when localStorage throws', () => {
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = () => {
        throw new Error('SecurityError');
      };
      expect(getPersistedTheme()).toBe('forge');
      Storage.prototype.getItem = original;
    });

    it('migrates retired theme IDs to their nearest curated match', () => {
      // monokai is retired → maps to dracula
      localStorage.setItem(THEME_STORAGE_KEY, 'monokai');
      expect(getPersistedTheme()).toBe('dracula');
      // and the migration is persisted so subsequent reads are stable
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dracula');
    });

    it('migrates retired light theme IDs to Paper', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'gruvboxlight');
      expect(getPersistedTheme()).toBe('paper');
    });

    it('migrates the legacy default "dark" to "forge"', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      expect(getPersistedTheme()).toBe('forge');
    });
  });

  describe('isPersistedThemeDark', () => {
    it('returns true for known dark themes', () => {
      expect(isPersistedThemeDark('forge')).toBe(true);
      expect(isPersistedThemeDark('dracula')).toBe(true);
      expect(isPersistedThemeDark('nord')).toBe(true);
      expect(isPersistedThemeDark('iceberg')).toBe(true);
      expect(isPersistedThemeDark('carbon')).toBe(true);
    });

    it('returns false for the curated light theme', () => {
      expect(isPersistedThemeDark('paper')).toBe(false);
    });

    it('returns false for unknown theme names', () => {
      expect(isPersistedThemeDark('nonexistent')).toBe(false);
      expect(isPersistedThemeDark('')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// terminal-constants.ts
// ---------------------------------------------------------------------------
describe('terminal constants', () => {
  it('PASTE_CHUNK_SIZE is 8KB (8192 bytes)', () => {
    expect(PASTE_CHUNK_SIZE).toBe(8 * 1024);
    expect(PASTE_CHUNK_SIZE).toBe(8192);
  });

  it('PASTE_CHUNK_DELAY_MS is 10', () => {
    expect(PASTE_CHUNK_DELAY_MS).toBe(10);
  });

  it('LARGE_PASTE_WARNING_THRESHOLD is 1MB (1048576 bytes)', () => {
    expect(LARGE_PASTE_WARNING_THRESHOLD).toBe(1_048_576);
    expect(LARGE_PASTE_WARNING_THRESHOLD).toBe(1024 * 1024);
  });
});
