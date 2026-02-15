import { describe, it, expect } from 'vitest';
import {
  PRELAUNCH_SHORTCUT_KEYS,
  getPrelaunchShortcutForIndex,
  getNextAvailablePrelaunchShortcut,
} from '../prelaunch-shortcuts';

describe('PRELAUNCH_SHORTCUT_KEYS', () => {
  it('contains exactly 12 keys', () => {
    expect(PRELAUNCH_SHORTCUT_KEYS).toHaveLength(12);
  });

  it('contains keys 1-9, 0, -, =', () => {
    expect(PRELAUNCH_SHORTCUT_KEYS).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '0',
      '-',
      '=',
    ]);
  });
});

describe('getPrelaunchShortcutForIndex', () => {
  it('returns "1" for index 0', () => {
    expect(getPrelaunchShortcutForIndex(0)).toBe('1');
  });

  it('returns "9" for index 8', () => {
    expect(getPrelaunchShortcutForIndex(8)).toBe('9');
  });

  it('returns "0" for index 9', () => {
    expect(getPrelaunchShortcutForIndex(9)).toBe('0');
  });

  it('returns "-" for index 10', () => {
    expect(getPrelaunchShortcutForIndex(10)).toBe('-');
  });

  it('returns "=" for index 11', () => {
    expect(getPrelaunchShortcutForIndex(11)).toBe('=');
  });

  it('returns null for index 12 (out of bounds)', () => {
    expect(getPrelaunchShortcutForIndex(12)).toBeNull();
  });

  it('returns null for negative index', () => {
    expect(getPrelaunchShortcutForIndex(-1)).toBeNull();
  });

  it('returns null for large index', () => {
    expect(getPrelaunchShortcutForIndex(100)).toBeNull();
  });
});

describe('getNextAvailablePrelaunchShortcut', () => {
  it('returns "1" when no shortcuts are used', () => {
    expect(getNextAvailablePrelaunchShortcut([])).toBe('1');
  });

  it('returns "2" when "1" is already used', () => {
    expect(getNextAvailablePrelaunchShortcut(['1'])).toBe('2');
  });

  it('skips used keys and returns first available', () => {
    expect(getNextAvailablePrelaunchShortcut(['1', '2', '3'])).toBe('4');
  });

  it('returns null when all shortcuts are used', () => {
    expect(getNextAvailablePrelaunchShortcut(PRELAUNCH_SHORTCUT_KEYS)).toBeNull();
  });

  it('works with a Set iterable', () => {
    const used = new Set(['1', '3', '5']);
    expect(getNextAvailablePrelaunchShortcut(used)).toBe('2');
  });

  it('handles non-sequential usage', () => {
    expect(getNextAvailablePrelaunchShortcut(['2', '4', '6'])).toBe('1');
  });
});
