export const PRELAUNCH_SHORTCUT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

export function getPrelaunchShortcutForIndex(index: number): string | null {
  if (index < 0 || index >= PRELAUNCH_SHORTCUT_KEYS.length) {
    return null;
  }
  return PRELAUNCH_SHORTCUT_KEYS[index];
}

export function getNextAvailablePrelaunchShortcut(usedShortcuts: Iterable<string>): string | null {
  const used = new Set(usedShortcuts);
  for (const key of PRELAUNCH_SHORTCUT_KEYS) {
    if (!used.has(key)) {
      return key;
    }
  }
  return null;
}
