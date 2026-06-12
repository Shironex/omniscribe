import { create } from 'zustand';
import { devtools } from './utils/devtools';
import type { AppearanceBackgroundSettings, WindowEffect } from '@omniscribe/shared';
import {
  createLogger,
  DEFAULT_APPEARANCE_BACKGROUND,
  DEFAULT_WINDOW_EFFECT,
} from '@omniscribe/shared';

const logger = createLogger('Appearance');

const BACKGROUND_STORAGE_KEY = 'omniscribe-appearance-bg';
const WINDOW_EFFECT_STORAGE_KEY = 'omniscribe-window-effect';

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function readBackground(): AppearanceBackgroundSettings {
  try {
    const raw = localStorage.getItem(BACKGROUND_STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE_BACKGROUND;
    const parsed = JSON.parse(raw) as Partial<AppearanceBackgroundSettings>;
    return {
      kind: parsed.kind === 'image' ? 'image' : 'none',
      imageId: typeof parsed.imageId === 'string' ? parsed.imageId : null,
      opacity: clamp01(parsed.opacity ?? DEFAULT_APPEARANCE_BACKGROUND.opacity),
      blur: Math.min(40, Math.max(0, Number(parsed.blur) || 0)),
    };
  } catch {
    return DEFAULT_APPEARANCE_BACKGROUND;
  }
}

function readWindowEffect(): WindowEffect {
  try {
    const raw = localStorage.getItem(WINDOW_EFFECT_STORAGE_KEY);
    if (raw === 'vibrancy' || raw === 'acrylic') return raw;
    return DEFAULT_WINDOW_EFFECT;
  } catch {
    return DEFAULT_WINDOW_EFFECT;
  }
}

interface AppearanceState {
  /** Background blend-layer settings (image lives in IndexedDB). */
  background: AppearanceBackgroundSettings;
  /** Native window background effect (vibrancy/acrylic), 'none' when off/unsupported. */
  windowEffect: WindowEffect;
}

interface AppearanceActions {
  /** Merge a partial background settings update and persist. */
  setBackground: (patch: Partial<AppearanceBackgroundSettings>) => void;
  /** Set the native window effect and persist. Application to the
   * BrowserWindow happens in the consumer (IPC), not here. */
  setWindowEffect: (effect: WindowEffect) => void;
}

export type AppearanceStore = AppearanceState & AppearanceActions;

export const useAppearanceStore = create<AppearanceStore>()(
  devtools(
    (set, get) => ({
      background:
        typeof document !== 'undefined' ? readBackground() : DEFAULT_APPEARANCE_BACKGROUND,
      windowEffect: typeof document !== 'undefined' ? readWindowEffect() : DEFAULT_WINDOW_EFFECT,

      setBackground: patch => {
        const next: AppearanceBackgroundSettings = {
          ...get().background,
          ...patch,
          ...(patch.opacity !== undefined ? { opacity: clamp01(patch.opacity) } : {}),
        };
        try {
          localStorage.setItem(BACKGROUND_STORAGE_KEY, JSON.stringify(next));
        } catch {
          logger.warn('setBackground: failed to persist background settings');
        }
        set({ background: next }, undefined, 'appearance/setBackground');
      },

      setWindowEffect: effect => {
        try {
          localStorage.setItem(WINDOW_EFFECT_STORAGE_KEY, effect);
        } catch {
          logger.warn('setWindowEffect: failed to persist window effect');
        }
        set({ windowEffect: effect }, undefined, 'appearance/setWindowEffect');
      },
    }),
    { name: 'appearance' }
  )
);

/** Select whether any translucent surface (image overlay or native effect) is active. */
export const selectSurfaceActive = (state: AppearanceStore) =>
  (state.background.kind === 'image' && state.background.imageId !== null) ||
  state.windowEffect !== 'none';
