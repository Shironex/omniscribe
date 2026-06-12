import { describe, it, expect } from 'vitest';
import {
  validateCustomTheme,
  isValidCssColor,
  customThemeId,
  isCustomThemeId,
  customThemeSlug,
  deriveSwatch,
  deriveAnsiFallback,
  CORE_THEME_TOKENS,
  ANSI_THEME_TOKENS,
  ALL_THEME_TOKENS,
  MAX_LABEL_LENGTH,
  type CustomTheme,
} from '../schema';

/** A minimal valid theme used as a base for mutation in tests. Accepts
 *  intentionally-malformed overrides so rejection paths can be exercised. */
function baseTheme(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'my-theme',
    label: 'My Theme',
    isDark: true,
    colors: {
      '--background': '#0e0e0e',
      '--foreground': '#f0f0f0',
      '--primary': '#e89143',
    },
    ...overrides,
  };
}

describe('token lists', () => {
  it('core tokens include the documented core set', () => {
    expect(CORE_THEME_TOKENS).toContain('--background');
    expect(CORE_THEME_TOKENS).toContain('--primary');
    expect(CORE_THEME_TOKENS).toContain('--status-error');
    // No box-shadow / swatch tokens in the editable surface.
    expect(CORE_THEME_TOKENS).not.toContain('--shadow-md');
    expect(CORE_THEME_TOKENS).not.toContain('--swatch-1');
  });

  it('exposes exactly 16 ANSI tokens', () => {
    expect(ANSI_THEME_TOKENS).toHaveLength(16);
    expect(ANSI_THEME_TOKENS).toContain('--terminal-ansi-black');
    expect(ANSI_THEME_TOKENS).toContain('--terminal-ansi-bright-white');
  });

  it('ALL = core + ansi with no duplicates', () => {
    expect(ALL_THEME_TOKENS).toHaveLength(CORE_THEME_TOKENS.length + ANSI_THEME_TOKENS.length);
    expect(new Set(ALL_THEME_TOKENS).size).toBe(ALL_THEME_TOKENS.length);
  });
});

describe('id namespacing', () => {
  it('prefixes / strips the custom namespace', () => {
    expect(customThemeId('foo')).toBe('custom:foo');
    expect(isCustomThemeId('custom:foo')).toBe(true);
    expect(isCustomThemeId('forge')).toBe(false);
    expect(customThemeSlug('custom:foo')).toBe('foo');
    expect(customThemeSlug('forge')).toBe('forge'); // verbatim when unprefixed
  });
});

describe('isValidCssColor', () => {
  it('accepts hex, rgb, hsl, oklch, and named colors', () => {
    expect(isValidCssColor('#fff')).toBe(true);
    expect(isValidCssColor('#0e0e0e')).toBe(true);
    expect(isValidCssColor('#0e0e0eaa')).toBe(true);
    expect(isValidCssColor('rgb(255, 0, 0)')).toBe(true);
    expect(isValidCssColor('rgba(255,0,0,0.5)')).toBe(true);
    expect(isValidCssColor('hsl(210 50% 40%)')).toBe(true);
    expect(isValidCssColor('oklch(0.74 0.16 55)')).toBe(true);
    expect(isValidCssColor('red')).toBe(true);
  });

  it('rejects non-strings and empties', () => {
    expect(isValidCssColor(123)).toBe(false);
    expect(isValidCssColor(null)).toBe(false);
    expect(isValidCssColor(undefined)).toBe(false);
    expect(isValidCssColor('')).toBe(false);
    expect(isValidCssColor('   ')).toBe(false);
  });

  it('rejects CSS-injection / dangerous values', () => {
    expect(isValidCssColor('red; } * { display: none')).toBe(false);
    expect(isValidCssColor('red}')).toBe(false);
    expect(isValidCssColor('url(https://evil.com)')).toBe(false);
    expect(isValidCssColor('expression(alert(1))')).toBe(false);
    expect(isValidCssColor('red</style>')).toBe(false);
  });

  it('rejects garbage that is not a color', () => {
    expect(isValidCssColor('not a color !!')).toBe(false);
    expect(isValidCssColor('12345')).toBe(false);
  });
});

describe('validateCustomTheme — happy path', () => {
  it('accepts a minimal valid theme and normalizes it', () => {
    const result = validateCustomTheme(baseTheme());
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.theme).toMatchObject({
      id: 'my-theme',
      label: 'My Theme',
      isDark: true,
    });
    expect(result.theme!.colors['--primary']).toBe('#e89143');
  });

  it('trims the label and color values', () => {
    const result = validateCustomTheme(
      baseTheme({
        label: '  Spaced  ',
        colors: { '--background': '  #000  ', '--foreground': '#fff', '--primary': '#f00' },
      })
    );
    expect(result.ok).toBe(true);
    expect(result.theme!.label).toBe('Spaced');
    expect(result.theme!.colors['--background']).toBe('#000');
  });

  it('accepts optional ANSI tokens', () => {
    const result = validateCustomTheme(
      baseTheme({
        colors: {
          '--background': '#000',
          '--foreground': '#fff',
          '--primary': '#f00',
          '--terminal-ansi-red': '#ff0000',
          '--terminal-ansi-bright-blue': 'rgb(0,0,255)',
        },
      })
    );
    expect(result.ok).toBe(true);
    expect(result.theme!.colors['--terminal-ansi-red']).toBe('#ff0000');
  });
});

describe('validateCustomTheme — rejections', () => {
  it('rejects non-objects', () => {
    expect(validateCustomTheme(null).ok).toBe(false);
    expect(validateCustomTheme('str').ok).toBe(false);
    expect(validateCustomTheme([]).ok).toBe(false);
  });

  it('rejects unknown top-level keys', () => {
    const result = validateCustomTheme(baseTheme({ extra: 'nope' } as Record<string, unknown>));
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Unknown field "extra"/);
  });

  it('rejects bad slug ids', () => {
    expect(validateCustomTheme(baseTheme({ id: '1bad' })).ok).toBe(false);
    expect(validateCustomTheme(baseTheme({ id: 'has space' })).ok).toBe(false);
    expect(validateCustomTheme(baseTheme({ id: 'UPPER' })).ok).toBe(false);
    expect(validateCustomTheme(baseTheme({ id: 'a:b' })).ok).toBe(false);
    expect(validateCustomTheme(baseTheme({ id: 'a'.repeat(60) })).ok).toBe(false);
  });

  it('rejects empty / over-length labels', () => {
    expect(validateCustomTheme(baseTheme({ label: '' })).ok).toBe(false);
    expect(validateCustomTheme(baseTheme({ label: '   ' })).ok).toBe(false);
    expect(validateCustomTheme(baseTheme({ label: 'x'.repeat(MAX_LABEL_LENGTH + 1) })).ok).toBe(
      false
    );
  });

  it('rejects non-boolean isDark', () => {
    expect(validateCustomTheme(baseTheme({ isDark: 'true' as unknown as boolean })).ok).toBe(false);
  });

  it('rejects unknown color tokens', () => {
    const result = validateCustomTheme(
      baseTheme({
        colors: {
          '--background': '#000',
          '--foreground': '#fff',
          '--primary': '#f00',
          '--bogus': '#abc',
        } as Record<string, string>,
      })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Unknown color token "--bogus"/);
  });

  it('rejects invalid color values', () => {
    const result = validateCustomTheme(
      baseTheme({
        colors: { '--background': '#000', '--foreground': '#fff', '--primary': 'red; }' },
      })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/not a valid CSS color/);
  });

  it('rejects when required core tokens are missing', () => {
    const result = validateCustomTheme(
      baseTheme({ colors: { '--background': '#000' } }) // missing --foreground, --primary
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Missing required color/);
  });
});

describe('deriveSwatch', () => {
  it('uses the theme tokens when present', () => {
    const theme: CustomTheme = {
      id: 't',
      label: 'T',
      isDark: true,
      colors: {
        '--background': '#111',
        '--card': '#222',
        '--primary': '#f80',
        '--accent': '#08f',
      },
    };
    expect(deriveSwatch(theme)).toEqual({
      bg: '#111',
      surface: '#222',
      primary: '#f80',
      accent: '#08f',
    });
  });

  it('falls back per-tile for sparse themes', () => {
    const theme: CustomTheme = {
      id: 't',
      label: 'T',
      isDark: true,
      colors: { '--primary': '#f80' },
    };
    const swatch = deriveSwatch(theme);
    expect(swatch.primary).toBe('#f80');
    // accent falls back to primary when no accent token
    expect(swatch.accent).toBe('#f80');
    // bg/surface fall back to dark defaults
    expect(swatch.bg).toBe('#0e0e0e');
    expect(swatch.surface).toBe('#1a1a1a');
  });
});

describe('deriveAnsiFallback', () => {
  it('produces all 16 ANSI tokens', () => {
    const theme: CustomTheme = {
      id: 't',
      label: 'T',
      isDark: true,
      colors: { '--background': '#000', '--foreground': '#fff', '--primary': '#f00' },
    };
    const ansi = deriveAnsiFallback(theme);
    for (const token of ANSI_THEME_TOKENS) {
      expect(ansi[token]).toBeTruthy();
    }
  });

  it('author-provided ANSI tokens win over derivation', () => {
    const theme: CustomTheme = {
      id: 't',
      label: 'T',
      isDark: true,
      colors: {
        '--background': '#000',
        '--foreground': '#fff',
        '--primary': '#f00',
        '--terminal-ansi-red': '#abcabc',
      },
    };
    expect(deriveAnsiFallback(theme)['--terminal-ansi-red']).toBe('#abcabc');
  });
});
