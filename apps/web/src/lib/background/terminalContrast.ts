import type { Terminal } from '@xterm/xterm';
import { useAppearanceStore, selectSurfaceActive } from '@/stores/useAppearanceStore';

/**
 * Terminal readability guard for the background-blend layer.
 *
 * When a translucent surface (background image or native window effect) is
 * active, the themed terminal colors can wash out against the overlay. We bump
 * xterm's `minimumContrastRatio` to WCAG AA (4.5) so foreground glyphs stay
 * legible; otherwise we leave it at the renderer default (1 = no enforcement).
 *
 * This mirrors terax's `rendererPool` contrast bump (terax report §4.5).
 */

/** WCAG AA contrast ratio enforced while a translucent surface is active. */
const CONTRAST_ACTIVE = 4.5;
/** Default — no contrast enforcement. */
const CONTRAST_INACTIVE = 1;

/** Live xterm instances that should track the surface-active contrast bump. */
const liveTerminals = new Set<Terminal>();

/** Lazily-created store subscription that updates every live terminal. */
let unsubscribe: (() => void) | null = null;

/** The contrast ratio appropriate for the current appearance state. */
export function currentContrastRatio(): number {
  return selectSurfaceActive(useAppearanceStore.getState()) ? CONTRAST_ACTIVE : CONTRAST_INACTIVE;
}

function applyToAll(ratio: number): void {
  for (const term of liveTerminals) {
    try {
      term.options.minimumContrastRatio = ratio;
    } catch {
      // Terminal may have been disposed between iterations — ignore.
    }
  }
}

/**
 * Begin reacting to appearance-store changes (idempotent). The subscription
 * stays alive for the app lifetime once the first terminal registers.
 */
function ensureSubscription(): void {
  if (unsubscribe) return;
  let prevActive = selectSurfaceActive(useAppearanceStore.getState());
  unsubscribe = useAppearanceStore.subscribe(state => {
    const active = selectSurfaceActive(state);
    if (active === prevActive) return;
    prevActive = active;
    applyToAll(active ? CONTRAST_ACTIVE : CONTRAST_INACTIVE);
  });
}

/**
 * Register a freshly-created terminal so it tracks the surface-active contrast
 * bump, and apply the current ratio immediately. Returns an unregister fn to
 * call on terminal disposal.
 */
export function registerTerminalForContrast(term: Terminal): () => void {
  ensureSubscription();
  liveTerminals.add(term);
  try {
    term.options.minimumContrastRatio = currentContrastRatio();
  } catch {
    // ignore
  }
  return () => {
    liveTerminals.delete(term);
  };
}
