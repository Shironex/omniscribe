import type { Terminal } from '@xterm/xterm';
import type { WebglAddon } from '@xterm/addon-webgl';
import { createLogger } from '@omniscribe/shared';

const logger = createLogger('WebglPool');

/**
 * WebGL renderer pooling for terminals.
 *
 * Browsers cap the number of simultaneously-live WebGL contexts (~8–16 in
 * Chromium); past that, the oldest context is silently lost, leaving blank or
 * sluggish terminals. Omniscribe keeps every xterm instance alive across tab
 * switches (PersistentProjectGrid stacks projects with `absolute inset-0` +
 * hidden), so a large multi-project / many-session layout can blow the cap.
 *
 * Unlike terax's renderer pool (terax report §3) we do NOT serialize buffers or
 * park sessions — every xterm stays live and keeps receiving output. We pool
 * ONLY the WebGL addon: at most {@link MAX_WEBGL_CONTEXTS} terminals hold an
 * attached `WebglAddon` at any time. Terminals without a slot fall back to
 * xterm's default DOM/canvas renderer (transparently — disposing the addon
 * detaches it cleanly in @xterm/addon-webgl v0.19).
 *
 * Steal policy:
 * - A free slot is filled immediately.
 * - When no slot is free, steal from the least-recently-VISIBLE *hidden* holder.
 * - NEVER steal from a currently-visible terminal. If every slot is held by a
 *   visible terminal, the requester just runs on the default renderer.
 *
 * This module owns a process-wide singleton registry, mirroring the
 * module-scope pattern in `lib/background/terminalContrast.ts`.
 */

/** Maximum number of attached WebGL addons across all live terminals. */
export const MAX_WEBGL_CONTEXTS = 6;

/** localStorage key; set to 'off' to disable pooling (always-attach fallback). */
const POOL_DISABLE_KEY = 'omniscribe-webgl-pool';

interface PoolEntry {
  /** The xterm instance this entry tracks. */
  term: Terminal;
  /**
   * True from the moment a slot is reserved for this terminal until the slot is
   * released. Reserved synchronously (before the async addon import resolves) so
   * concurrent requests can't over-subscribe the pool past MAX_WEBGL_CONTEXTS.
   * `claimed` is the source of truth for slot accounting; `addon` is non-null
   * only once the (async) attach actually completes.
   */
  claimed: boolean;
  /**
   * Bumped on every new reservation. The async `doAttach` captures the token at
   * claim time and aborts if it changed (the slot was released and re-claimed
   * while the import was in flight), preventing a stale attach from leaking a
   * second addon.
   */
  attachToken: number;
  /** The attached addon, or null when this terminal is running on the default renderer. */
  addon: WebglAddon | null;
  /** Disposer for the addon's `onContextLoss` subscription. */
  contextLossDisposable: { dispose: () => void } | null;
  /** Whether this terminal's project tab is currently visible. */
  visible: boolean;
  /**
   * Monotonic timestamp of the last moment this terminal was visible. Used to
   * pick the least-recently-visible hidden holder when stealing. Visible
   * terminals carry the current time so they always sort last (never stolen).
   */
  lastVisibleAt: number;
  /** Whether this terminal has already consumed its one context-loss recovery. */
  recoveredFromLoss: boolean;
}

/** Lazily-imported WebglAddon constructor (the module is code-split). */
type WebglAddonCtor = new (preserveDrawingBuffer?: boolean) => WebglAddon;

/** Every terminal that has requested WebGL, keyed by terminal id. */
const entries = new Map<string, PoolEntry>();

/** Cached dynamic import of the addon module (shared across all terminals). */
let addonModulePromise: Promise<WebglAddonCtor> | null = null;

/** Monotonic clock so equal-millisecond timestamps still order deterministically. */
let clock = 0;
function tick(): number {
  return ++clock;
}

/** Read the dev escape hatch once at module init. */
const POOLING_DISABLED: boolean = (() => {
  try {
    return localStorage.getItem(POOL_DISABLE_KEY) === 'off';
  } catch {
    // localStorage may be unavailable (SSR, sandboxed) — pooling stays on.
    return false;
  }
})();

function loadAddonCtor(): Promise<WebglAddonCtor> {
  if (!addonModulePromise) {
    addonModulePromise = import('@xterm/addon-webgl').then(mod => mod.WebglAddon);
  }
  return addonModulePromise;
}

/**
 * Number of slots currently in use. Counts CLAIMED entries (reservations),
 * which includes attaches still in flight — this is what prevents concurrent
 * requests from over-subscribing the pool before their async attaches land.
 */
function slotsInUse(): number {
  let n = 0;
  for (const entry of entries.values()) {
    if (entry.claimed) n += 1;
  }
  return n;
}

/**
 * Reserve a slot for an entry and kick off the async attach. The reservation is
 * synchronous so slot accounting is correct the instant we decide to attach,
 * even though the addon import resolves later. No-op if already claimed.
 */
function attach(id: string, entry: PoolEntry): void {
  if (entry.claimed) return;
  entry.claimed = true;
  const token = ++entry.attachToken;
  void doAttach(id, entry, token);
}

/**
 * Construct and load the addon once the (cached) module import resolves. Bound
 * to a reservation made by {@link attach}. On any failure the reservation is
 * released so the slot returns to the pool. `token` guards against a stale run
 * whose reservation was released and re-claimed during the import.
 */
async function doAttach(id: string, entry: PoolEntry, token: number): Promise<void> {
  let Ctor: WebglAddonCtor;
  try {
    Ctor = await loadAddonCtor();
  } catch {
    // Module-load failure (offline cache miss, etc.) — default renderer continues.
    logger.debug('WebGL addon dynamic import failed, using default renderer');
    if (entries.get(id) === entry && entry.attachToken === token) entry.claimed = false;
    return;
  }

  // The terminal may have been released/disposed (or its slot stolen and
  // re-claimed) while the import was in flight.
  if (entries.get(id) !== entry || !entry.claimed || entry.attachToken !== token) return;

  try {
    const addon = new Ctor();
    const contextLossDisposable = addon.onContextLoss(() => handleContextLoss(id));
    entry.term.loadAddon(addon);
    entry.addon = addon;
    entry.contextLossDisposable = contextLossDisposable;
    logger.debug('WebGL attached for terminal', id, `(${slotsInUse()}/${MAX_WEBGL_CONTEXTS})`);
  } catch {
    // Construction or activation failed (no GL, blocked context) — canvas fallback.
    logger.debug('WebGL addon attach failed for terminal', id, '— using default renderer');
    entry.claimed = false;
  }
}

/**
 * Dispose an entry's addon (if any) and release its slot reservation. xterm
 * transparently falls back to its default renderer once the addon detaches.
 */
function detach(entry: PoolEntry): void {
  entry.claimed = false;
  if (entry.contextLossDisposable) {
    try {
      entry.contextLossDisposable.dispose();
    } catch {
      // ignore — addon may already be gone
    }
    entry.contextLossDisposable = null;
  }
  if (entry.addon) {
    try {
      entry.addon.dispose();
    } catch {
      // ignore — already disposed
    }
    entry.addon = null;
  }
}

/**
 * Find the least-recently-visible HIDDEN holder of a slot, excluding the given
 * id. Visible holders are never returned — we never steal from a visible
 * terminal. Returns null when no hidden holder exists.
 */
function leastRecentlyVisibleHiddenHolder(excludeId: string): [string, PoolEntry] | null {
  let best: [string, PoolEntry] | null = null;
  for (const [id, entry] of entries) {
    if (id === excludeId) continue;
    if (!entry.claimed) continue; // not a slot holder
    if (entry.visible) continue; // never steal from visible
    if (!best || entry.lastVisibleAt < best[1].lastVisibleAt) {
      best = [id, entry];
    }
  }
  return best;
}

/**
 * The hidden waiter that should receive a freed slot next: the one that became
 * hidden most recently (most likely to be revisited soon). Returns null when no
 * hidden terminal is waiting without a slot. (Hand-off targets are hidden by
 * definition — a visible waiter would have stolen a slot already.)
 */
function nextWaiter(excludeId: string): [string, PoolEntry] | null {
  let best: [string, PoolEntry] | null = null;
  for (const [id, entry] of entries) {
    if (id === excludeId) continue;
    if (entry.claimed) continue; // already holds (or has reserved) a slot
    if (!best || entry.lastVisibleAt > best[1].lastVisibleAt) {
      best = [id, entry];
    }
  }
  return best;
}

/**
 * Ensure the given entry holds a slot, stealing from the least-recently-visible
 * hidden holder when the pool is full. No-op if it already holds one. When all
 * slots are held by visible terminals, leaves the entry on the default renderer.
 */
function ensureSlot(id: string, entry: PoolEntry): void {
  if (entry.claimed) return;

  if (slotsInUse() < MAX_WEBGL_CONTEXTS) {
    attach(id, entry);
    return;
  }

  const victim = leastRecentlyVisibleHiddenHolder(id);
  if (!victim) {
    // Every slot is held by a visible terminal — run on the default renderer.
    logger.debug('WebGL pool full (all visible); terminal', id, 'uses default renderer');
    return;
  }

  detach(victim[1]);
  logger.debug('WebGL slot stolen from', victim[0], 'for', id);
  attach(id, entry);
}

/**
 * Re-request a slot after a context loss. The addon disposes itself on loss; we
 * give the terminal exactly one automatic recovery to avoid loss/re-attach
 * thrash on a wedged GPU.
 */
function handleContextLoss(id: string): void {
  const entry = entries.get(id);
  if (!entry) return;

  logger.debug('WebGL context lost for terminal', id);
  detach(entry);

  if (entry.recoveredFromLoss) {
    logger.debug('WebGL already recovered once for', id, '— staying on default renderer');
    return;
  }
  entry.recoveredFromLoss = true;

  // Only re-request if this terminal still warrants a slot (visible terminals
  // always do; hidden ones only if a slot is free).
  if (entry.visible) {
    ensureSlot(id, entry);
  } else if (slotsInUse() < MAX_WEBGL_CONTEXTS) {
    attach(id, entry);
  }
}

/**
 * Request WebGL acceleration for a terminal. Attaches an addon if a slot is
 * free or can be stolen from a hidden holder; otherwise the terminal runs on
 * xterm's default renderer. Idempotent per terminal id.
 *
 * `isVisible` reflects whether the terminal's project tab is currently active.
 * A terminal can initialize while hidden (inactive project grids stay mounted),
 * so callers must pass the real visibility rather than assuming visible.
 */
export function requestWebgl(terminalId: string, term: Terminal, isVisible = true): void {
  if (POOLING_DISABLED) {
    attachUnpooled(terminalId, term);
    return;
  }

  let entry = entries.get(terminalId);
  if (entry) {
    entry.term = term;
    entry.visible = isVisible;
    if (isVisible) entry.lastVisibleAt = tick();
    ensureSlot(terminalId, entry);
    return;
  }

  entry = {
    term,
    claimed: false,
    attachToken: 0,
    addon: null,
    contextLossDisposable: null,
    visible: isVisible,
    lastVisibleAt: tick(),
    recoveredFromLoss: false,
  };
  entries.set(terminalId, entry);

  // A hidden terminal only takes a slot if one is genuinely free — it must not
  // steal from anyone (visible or hidden) just by opening off-screen.
  if (isVisible) {
    ensureSlot(terminalId, entry);
  } else if (slotsInUse() < MAX_WEBGL_CONTEXTS) {
    attach(terminalId, entry);
  } else {
    logger.debug('WebGL pool full; hidden terminal', terminalId, 'opens on default renderer');
  }
}

/**
 * Release a terminal from the pool: dispose its addon (freeing a slot) and drop
 * its registration. Hands the freed slot to a waiting hidden terminal. Call on
 * terminal disposal.
 */
export function releaseWebgl(terminalId: string): void {
  const entry = entries.get(terminalId);
  if (!entry) return;

  const hadSlot = entry.claimed;
  detach(entry);
  entries.delete(terminalId);

  if (hadSlot && !POOLING_DISABLED) {
    handOffFreedSlot(terminalId);
  }
}

/**
 * Mark a terminal visible. If it lacks a slot, steal one from the
 * least-recently-visible hidden holder (never from a visible one).
 */
export function notifyVisible(terminalId: string): void {
  if (POOLING_DISABLED) return;
  const entry = entries.get(terminalId);
  if (!entry) return;

  entry.visible = true;
  entry.lastVisibleAt = tick();
  ensureSlot(terminalId, entry);
}

/**
 * Mark a terminal hidden. Its slot is retained (so it stays accelerated while
 * off-screen if uncontended), but it now becomes a candidate for stealing. If a
 * hidden terminal is waiting without a slot, proactively hand this slot off.
 */
export function notifyHidden(terminalId: string): void {
  if (POOLING_DISABLED) return;
  const entry = entries.get(terminalId);
  if (!entry) return;

  // Stamp the moment it went hidden so LRU steal favors the oldest hidden tab.
  entry.visible = false;
  entry.lastVisibleAt = tick();

  // Proactive handoff: if this terminal holds a slot and another terminal is
  // waiting without one, give it up now rather than waiting to be stolen from.
  if (entry.claimed && slotsInUse() >= MAX_WEBGL_CONTEXTS) {
    const waiter = nextWaiter(terminalId);
    if (waiter) {
      detach(entry);
      logger.debug('WebGL slot handed off from', terminalId, 'to', waiter[0]);
      attach(waiter[0], waiter[1]);
    }
  }
}

/** Dispose every addon and clear the registry. Call on full teardown. */
export function disposeAll(): void {
  for (const entry of entries.values()) {
    detach(entry);
  }
  entries.clear();
}

/**
 * Give a just-freed slot to the best waiting hidden terminal, if any. Used when
 * a holder is released so the slot doesn't sit idle while others fall back.
 */
function handOffFreedSlot(excludeId: string): void {
  if (slotsInUse() >= MAX_WEBGL_CONTEXTS) return;
  // Prefer a visible waiter first (they need acceleration now), then the
  // most-recently-hidden one.
  let visibleWaiter: [string, PoolEntry] | null = null;
  for (const [id, entry] of entries) {
    if (id === excludeId || entry.claimed) continue;
    if (entry.visible) {
      if (!visibleWaiter || entry.lastVisibleAt > visibleWaiter[1].lastVisibleAt) {
        visibleWaiter = [id, entry];
      }
    }
  }
  const target = visibleWaiter ?? nextWaiter(excludeId);
  if (target) {
    attach(target[0], target[1]);
  }
}

/**
 * Escape-hatch path: attach an addon unconditionally (no slot accounting),
 * matching the pre-pool always-attach behavior. Used when pooling is disabled
 * via localStorage. Still handles context loss (dispose only — no re-request,
 * matching the prior behavior).
 */
function attachUnpooled(terminalId: string, term: Terminal): void {
  if (entries.has(terminalId)) return;
  const entry: PoolEntry = {
    term,
    claimed: true,
    attachToken: 0,
    addon: null,
    contextLossDisposable: null,
    visible: true,
    lastVisibleAt: tick(),
    recoveredFromLoss: false,
  };
  entries.set(terminalId, entry);

  void loadAddonCtor()
    .then(Ctor => {
      if (entries.get(terminalId) !== entry) return;
      try {
        const addon = new Ctor();
        entry.contextLossDisposable = addon.onContextLoss(() => {
          detach(entry);
        });
        entry.term.loadAddon(addon);
        entry.addon = addon;
      } catch {
        logger.debug('WebGL addon failed (unpooled), using default renderer');
      }
    })
    .catch(() => {
      logger.debug('WebGL addon dynamic import failed (unpooled), using default renderer');
    });
}

/** Whether pooling is active (false when disabled via the localStorage hatch). */
export function isPoolingEnabled(): boolean {
  return !POOLING_DISABLED;
}

/** Test-only: snapshot of internal state for assertions. */
export function __getPoolState(): {
  size: number;
  attached: number;
  entries: Array<{ id: string; hasAddon: boolean; claimed: boolean; visible: boolean }>;
} {
  return {
    size: entries.size,
    // `attached` reflects slot reservations (claimed), the pool's accounting
    // unit. After microtasks settle this equals the count of live addons.
    attached: slotsInUse(),
    entries: Array.from(entries, ([id, e]) => ({
      id,
      hasAddon: e.addon !== null,
      claimed: e.claimed,
      visible: e.visible,
    })),
  };
}
