import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isValidThemeId,
  isValidCssPropertyKey,
  isSafeCssValue,
  injectThemeStyles,
  removeThemeStyles,
} from '../plugin-theme-injector';

const THEME_ATTR = 'data-plugin-theme';

describe('isValidThemeId', () => {
  it('accepts valid theme IDs', () => {
    expect(isValidThemeId('dark')).toBe(true);
    expect(isValidThemeId('plugin-codex-dark')).toBe(true);
    expect(isValidThemeId('myTheme123')).toBe(true);
    expect(isValidThemeId('a')).toBe(true);
    expect(isValidThemeId('theme_with_underscores')).toBe(true);
  });

  it('rejects IDs starting with a number', () => {
    expect(isValidThemeId('1theme')).toBe(false);
  });

  it('rejects IDs starting with a hyphen', () => {
    expect(isValidThemeId('-theme')).toBe(false);
  });

  it('rejects empty strings', () => {
    expect(isValidThemeId('')).toBe(false);
  });

  it('rejects IDs with spaces', () => {
    expect(isValidThemeId('theme name')).toBe(false);
  });

  it('rejects CSS injection attempts via theme ID', () => {
    expect(isValidThemeId('a { } * { display:none } .x')).toBe(false);
    expect(isValidThemeId('x{color:red}')).toBe(false);
    expect(isValidThemeId('a";alert(1)//')).toBe(false);
  });

  it('rejects IDs longer than 101 characters', () => {
    expect(isValidThemeId('a' + 'b'.repeat(101))).toBe(false);
  });
});

describe('isValidCssPropertyKey', () => {
  it('accepts valid CSS custom property names', () => {
    expect(isValidCssPropertyKey('--background')).toBe(true);
    expect(isValidCssPropertyKey('--primary-foreground')).toBe(true);
    expect(isValidCssPropertyKey('--chart-1')).toBe(true);
  });

  it('rejects keys without -- prefix', () => {
    expect(isValidCssPropertyKey('background')).toBe(false);
    expect(isValidCssPropertyKey('-background')).toBe(false);
  });

  it('rejects keys with injection characters', () => {
    expect(isValidCssPropertyKey('--x: red; } * { display: none } .y {')).toBe(false);
    expect(isValidCssPropertyKey('--a;}')).toBe(false);
  });

  it('rejects keys with only --', () => {
    expect(isValidCssPropertyKey('--')).toBe(false);
  });
});

describe('isSafeCssValue', () => {
  it('accepts legitimate CSS values', () => {
    expect(isSafeCssValue('240 10% 3.9%')).toBe(true);
    expect(isSafeCssValue('oklch(0.63 0.15 165)')).toBe(true);
    expect(isSafeCssValue('0 0% 100%')).toBe(true);
    expect(isSafeCssValue('#ff0000')).toBe(true);
    expect(isSafeCssValue('rgb(255, 0, 0)')).toBe(true);
    expect(isSafeCssValue('0.5rem')).toBe(true);
    expect(isSafeCssValue('1px solid red')).toBe(true);
  });

  it('rejects values containing curly braces', () => {
    expect(isSafeCssValue('red; } * { display: none')).toBe(false);
    expect(isSafeCssValue('red}')).toBe(false);
    expect(isSafeCssValue('{color: red}')).toBe(false);
  });

  it('rejects values containing semicolons (declaration injection)', () => {
    expect(isSafeCssValue('red; position: fixed')).toBe(false);
    expect(isSafeCssValue('0 0% 0%; z-index: 9999')).toBe(false);
  });

  it('rejects values containing url() (external resource loading)', () => {
    expect(isSafeCssValue('url(https://attacker.com/log)')).toBe(false);
    expect(isSafeCssValue('url(data:image/png;base64,abc)')).toBe(false);
    expect(isSafeCssValue('URL( https://evil.com )')).toBe(false);
  });

  it('rejects values containing </style tag', () => {
    expect(isSafeCssValue('red</style><script>alert(1)</script>')).toBe(false);
    expect(isSafeCssValue('</STYLE>')).toBe(false);
  });
});

describe('injectThemeStyles', () => {
  beforeEach(() => {
    // Clean up any injected styles
    document.head.querySelectorAll(`style[${THEME_ATTR}]`).forEach(el => el.remove());
  });

  afterEach(() => {
    document.head.querySelectorAll(`style[${THEME_ATTR}]`).forEach(el => el.remove());
  });

  it('injects a valid theme and returns true', () => {
    const result = injectThemeStyles('plugin-codex-dark', {
      '--background': '240 10% 3.9%',
      '--foreground': '0 0% 98%',
    });

    expect(result).toBe(true);

    const style = document.head.querySelector(`style[${THEME_ATTR}="plugin-codex-dark"]`);
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain(':root.plugin-codex-dark');
    expect(style!.textContent).toContain('--background: 240 10% 3.9%;');
    expect(style!.textContent).toContain('--foreground: 0 0% 98%;');
  });

  it('returns false for invalid theme IDs', () => {
    const result = injectThemeStyles('a { } * { display:none } .x', {
      '--background': '0 0% 0%',
    });

    expect(result).toBe(false);
    expect(document.head.querySelectorAll(`style[${THEME_ATTR}]`).length).toBe(0);
  });

  it('filters out invalid CSS property keys', () => {
    const result = injectThemeStyles('validTheme', {
      '--valid-key': '0 0% 100%',
      background: '0 0% 0%', // invalid: no -- prefix
    });

    expect(result).toBe(true);
    const style = document.head.querySelector(`style[${THEME_ATTR}="validTheme"]`);
    expect(style!.textContent).toContain('--valid-key');
    expect(style!.textContent).not.toContain('background: 0 0% 0%');
  });

  it('filters out dangerous CSS property values', () => {
    const result = injectThemeStyles('validTheme', {
      '--safe': '0 0% 100%',
      '--dangerous': 'red; } * { display: none',
    });

    expect(result).toBe(true);
    const style = document.head.querySelector(`style[${THEME_ATTR}="validTheme"]`);
    expect(style!.textContent).toContain('--safe');
    expect(style!.textContent).not.toContain('--dangerous');
  });

  it('returns false when all properties are invalid', () => {
    const result = injectThemeStyles('validTheme', {
      'no-prefix': 'red',
      '--bad-value': 'red}',
    });

    expect(result).toBe(false);
  });

  it('replaces existing styles for the same theme ID', () => {
    injectThemeStyles('myTheme', { '--color': 'red' });
    injectThemeStyles('myTheme', { '--color': 'blue' });

    const styles = document.head.querySelectorAll(`style[${THEME_ATTR}="myTheme"]`);
    expect(styles.length).toBe(1);
    expect(styles[0].textContent).toContain('blue');
  });

  it('accepts oklch() values used by real plugins', () => {
    const result = injectThemeStyles('codexDark', {
      '--primary': 'oklch(0.63 0.15 165)',
      '--chart-1': 'oklch(0.70 0.18 145)',
    });

    expect(result).toBe(true);
    const style = document.head.querySelector(`style[${THEME_ATTR}="codexDark"]`);
    expect(style!.textContent).toContain('oklch(0.63 0.15 165)');
  });
});

describe('removeThemeStyles', () => {
  beforeEach(() => {
    document.head.querySelectorAll(`style[${THEME_ATTR}]`).forEach(el => el.remove());
  });

  afterEach(() => {
    document.head.querySelectorAll(`style[${THEME_ATTR}]`).forEach(el => el.remove());
  });

  it('removes an injected theme', () => {
    injectThemeStyles('testTheme', { '--bg': '0 0% 0%' });
    expect(document.head.querySelector(`style[${THEME_ATTR}="testTheme"]`)).not.toBeNull();

    removeThemeStyles('testTheme');
    expect(document.head.querySelector(`style[${THEME_ATTR}="testTheme"]`)).toBeNull();
  });

  it('does nothing if the theme does not exist', () => {
    expect(() => removeThemeStyles('nonexistent')).not.toThrow();
  });
});
