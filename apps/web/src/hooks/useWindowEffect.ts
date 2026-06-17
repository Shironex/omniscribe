import { useEffect } from 'react';
import type { WindowEffect } from '@omniscribe/shared';
import { createLogger } from '@omniscribe/shared';
import { useAppearanceStore } from '@/stores/useAppearanceStore';
import { IS_ELECTRON } from '@/lib/platform';

const logger = createLogger('WindowEffect');

/**
 * Reflect the active window effect onto the document so CSS can react to it.
 * Translucent base-layer rules hook off `html[data-window-effect]`.
 */
function syncDocumentAttribute(effect: WindowEffect): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (effect === 'none') {
    delete root.dataset.windowEffect;
  } else {
    root.dataset.windowEffect = effect;
  }
}

/**
 * Tell the Electron main process to apply (or clear) the native window effect
 * and mirror the result onto the document. When the requested effect is not
 * supported on this platform the store is reset to `'none'` so the UI and the
 * persisted value stay consistent with reality.
 */
async function applyWindowEffect(effect: WindowEffect): Promise<void> {
  // Outside Electron there is no native window to blur — keep the document
  // attribute in sync (so the web preview stays opaque) and bail.
  if (!IS_ELECTRON || !window.electronAPI?.window?.setBackgroundEffect) {
    syncDocumentAttribute('none');
    return;
  }

  try {
    const support = await window.electronAPI.window.getBackgroundEffectSupport();
    const isSupported =
      effect === 'none' ||
      (effect === 'vibrancy' && support.vibrancy) ||
      (effect === 'acrylic' && support.acrylic);

    if (!isSupported) {
      logger.info(`Window effect "${effect}" unsupported on this platform — resetting to none`);
      syncDocumentAttribute('none');
      // Reset the persisted store; the subscription re-runs and applies 'none'.
      useAppearanceStore.getState().setWindowEffect('none');
      return;
    }

    const result = await window.electronAPI.window.setBackgroundEffect(effect);
    if (result.ok) {
      syncDocumentAttribute(effect);
    } else {
      logger.warn(`Failed to apply window effect "${effect}": ${result.reason ?? 'unknown'}`);
      syncDocumentAttribute('none');
    }
  } catch (error) {
    logger.warn('Failed to apply window effect:', error);
    syncDocumentAttribute('none');
  }
}

/**
 * Apply the persisted native window effect on boot and keep it in sync as the
 * user toggles it. Reads {@link useAppearanceStore}'s `windowEffect`, validates
 * platform support via IPC, drives `win.setVibrancy` / `setBackgroundMaterial`
 * in the main process, and toggles `document.documentElement.dataset.windowEffect`
 * so translucent CSS can let the native blur show through.
 */
export function useWindowEffect(): void {
  useEffect(() => {
    // Apply the persisted effect on mount.
    void applyWindowEffect(useAppearanceStore.getState().windowEffect);

    // Re-apply whenever the effect changes (live toggling from Settings).
    let previous = useAppearanceStore.getState().windowEffect;
    const unsubscribe = useAppearanceStore.subscribe(state => {
      if (state.windowEffect === previous) return;
      previous = state.windowEffect;
      void applyWindowEffect(state.windowEffect);
    });

    return unsubscribe;
  }, []);
}
