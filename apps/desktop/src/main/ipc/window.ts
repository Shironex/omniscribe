import { BrowserWindow, ipcMain } from 'electron';
import { WINDOW_BACKGROUND_COLOR } from '../window';

/**
 * Native window background effect values supported by the renderer.
 * Mirrors the `WindowEffect` type in `@omniscribe/shared`.
 */
type BackgroundEffect = 'none' | 'vibrancy' | 'acrylic';

/** Result of applying a background effect via {@link applyBackgroundEffect}. */
interface SetBackgroundEffectResult {
  ok: boolean;
  reason?: string;
}

/** Per-platform native effect support flags. */
interface BackgroundEffectSupport {
  vibrancy: boolean;
  acrylic: boolean;
}

/**
 * Compute which native window effects the current platform supports.
 * - macOS (`darwin`): NSVisualEffectView vibrancy.
 * - Windows (`win32`): Windows 11 acrylic material.
 * - Linux / everything else: none.
 */
function getBackgroundEffectSupport(): BackgroundEffectSupport {
  return {
    vibrancy: process.platform === 'darwin',
    acrylic: process.platform === 'win32',
  };
}

/**
 * Apply (or clear) a native window background effect.
 *
 * Native effect APIs (`setVibrancy`, `setBackgroundMaterial`) can throw on
 * older OS versions, so every native call is wrapped in try/catch and an
 * unsupported platform/effect combination resolves to
 * `{ ok: false, reason: 'unsupported' }` rather than throwing.
 */
function applyBackgroundEffect(
  win: BrowserWindow,
  effect: BackgroundEffect
): SetBackgroundEffectResult {
  try {
    if (process.platform === 'darwin') {
      if (effect === 'vibrancy') {
        win.setVibrancy('under-window');
        // A fully-transparent background lets the desktop blur show through.
        win.setBackgroundColor('#00000000');
        return { ok: true };
      }
      if (effect === 'none') {
        win.setVibrancy(null);
        win.setBackgroundColor(WINDOW_BACKGROUND_COLOR);
        return { ok: true };
      }
      // 'acrylic' is not a macOS effect.
      return { ok: false, reason: 'unsupported' };
    }

    if (process.platform === 'win32') {
      if (effect === 'acrylic') {
        win.setBackgroundMaterial('acrylic');
        return { ok: true };
      }
      if (effect === 'none') {
        win.setBackgroundMaterial('none');
        return { ok: true };
      }
      // 'vibrancy' is not a Windows effect.
      return { ok: false, reason: 'unsupported' };
    }

    // Linux and any other platform have no native effect. 'none' is a no-op
    // success; anything else is unsupported.
    if (effect === 'none') {
      return { ok: true };
    }
    return { ok: false, reason: 'unsupported' };
  } catch {
    return { ok: false, reason: 'unsupported' };
  }
}

/** Narrow an unknown IPC payload to a valid {@link BackgroundEffect}. */
function isBackgroundEffect(value: unknown): value is BackgroundEffect {
  return value === 'none' || value === 'vibrancy' || value === 'acrylic';
}

/**
 * Register window control IPC handlers
 */
export function registerWindowHandlers(mainWindow: BrowserWindow): void {
  ipcMain.on('window:minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    mainWindow.close();
  });

  ipcMain.handle('window:is-maximized', () => {
    return mainWindow.isMaximized();
  });

  // Native background effect (vibrancy on macOS, acrylic on Windows 11).
  ipcMain.handle(
    'window:set-background-effect',
    (_event, effect: unknown): SetBackgroundEffectResult => {
      if (!isBackgroundEffect(effect)) {
        return { ok: false, reason: 'unsupported' };
      }
      return applyBackgroundEffect(mainWindow, effect);
    }
  );

  ipcMain.handle('window:get-background-effect-support', (): BackgroundEffectSupport => {
    return getBackgroundEffectSupport();
  });

  // Forward window state changes to renderer
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized-change', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximized-change', false);
  });
}

/**
 * Clean up window control IPC handlers
 */
export function cleanupWindowHandlers(): void {
  ipcMain.removeAllListeners('window:minimize');
  ipcMain.removeAllListeners('window:maximize');
  ipcMain.removeAllListeners('window:close');
  ipcMain.removeHandler('window:is-maximized');
  ipcMain.removeHandler('window:set-background-effect');
  ipcMain.removeHandler('window:get-background-effect-support');

  // Note: Window event listeners are cleaned up when window is destroyed
}
