import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Terminal } from '@xterm/xterm';

// --- Mocked WebGL addon ----------------------------------------------------
//
// Each WebglAddon instance records its loss callback so a test can fire a
// context-loss event, and tracks whether it has been disposed. The pool loads
// this module via a dynamic `import('@xterm/addon-webgl')`, so all attaches are
// asynchronous — tests flush microtasks with `tick()` after pool operations.

interface MockAddon {
  disposed: boolean;
  lossCb: (() => void) | null;
  onContextLoss: (cb: () => void) => { dispose: () => void };
  dispose: () => void;
}

const createdAddons: MockAddon[] = [];

vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: vi.fn(function () {
    const addon: MockAddon = {
      disposed: false,
      lossCb: null,
      onContextLoss(cb: () => void) {
        addon.lossCb = cb;
        return { dispose: vi.fn() };
      },
      dispose() {
        addon.disposed = true;
      },
    };
    createdAddons.push(addon);
    return addon;
  }),
}));

import {
  MAX_WEBGL_CONTEXTS,
  requestWebgl,
  releaseWebgl,
  notifyVisible,
  notifyHidden,
  disposeAll,
  __getPoolState,
} from '@/lib/webglPool';

// --- Helpers ---------------------------------------------------------------

/** A fake xterm terminal that records the addon loaded into it. */
function fakeTerminal(): Terminal & { loadedAddon: MockAddon | null } {
  const term = {
    loadedAddon: null as MockAddon | null,
    loadAddon(addon: unknown) {
      (term as { loadedAddon: MockAddon | null }).loadedAddon = addon as MockAddon;
    },
  };
  return term as unknown as Terminal & { loadedAddon: MockAddon | null };
}

/**
 * Settle the pool's async attaches. The pool loads the addon via a dynamic
 * `import()` whose promise resolves on a macrotask the first time, so we drain a
 * macrotask boundary and then a few microtask turns (import → entry recheck →
 * loadAddon).
 */
async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function state() {
  return __getPoolState();
}

function holders(): string[] {
  return state()
    .entries.filter(e => e.hasAddon)
    .map(e => e.id)
    .sort();
}

// --- Tests -----------------------------------------------------------------

describe('webglPool', () => {
  beforeEach(() => {
    disposeAll();
    createdAddons.length = 0;
  });

  afterEach(() => {
    disposeAll();
  });

  describe('slot accounting', () => {
    it('attaches an addon when a slot is free', async () => {
      const term = fakeTerminal();
      requestWebgl('a', term, true);
      await flush();

      expect(holders()).toEqual(['a']);
      expect(term.loadedAddon).not.toBeNull();
      expect(state().attached).toBe(1);
    });

    it('fills up to MAX_WEBGL_CONTEXTS visible terminals, each with a slot', async () => {
      for (let i = 0; i < MAX_WEBGL_CONTEXTS; i++) {
        requestWebgl(`v${i}`, fakeTerminal(), true);
      }
      await flush();

      expect(state().attached).toBe(MAX_WEBGL_CONTEXTS);
    });

    it('is idempotent — re-requesting the same id does not double-attach', async () => {
      const term = fakeTerminal();
      requestWebgl('a', term, true);
      await flush();
      requestWebgl('a', term, true);
      await flush();

      expect(state().attached).toBe(1);
      expect(createdAddons.filter(a => !a.disposed)).toHaveLength(1);
    });
  });

  describe('LRU steal preference (hidden over visible)', () => {
    it('does not steal from visible terminals — extra visible terminal uses default renderer', async () => {
      // Fill all slots with visible terminals.
      for (let i = 0; i < MAX_WEBGL_CONTEXTS; i++) {
        requestWebgl(`v${i}`, fakeTerminal(), true);
      }
      await flush();
      expect(state().attached).toBe(MAX_WEBGL_CONTEXTS);

      // One more visible terminal requests — no slot can be stolen.
      const extra = fakeTerminal();
      requestWebgl('extra', extra, true);
      await flush();

      expect(state().attached).toBe(MAX_WEBGL_CONTEXTS);
      expect(holders()).not.toContain('extra');
      expect(extra.loadedAddon).toBeNull();
    });

    it('steals from the least-recently-visible HIDDEN holder, never a visible one', async () => {
      // Fill all slots. h0 and h1 are hidden (h0 went hidden first → LRU);
      // the rest stay visible.
      requestWebgl('h0', fakeTerminal(), true);
      requestWebgl('h1', fakeTerminal(), true);
      for (let i = 2; i < MAX_WEBGL_CONTEXTS; i++) {
        requestWebgl(`v${i}`, fakeTerminal(), true);
      }
      await flush();
      expect(state().attached).toBe(MAX_WEBGL_CONTEXTS);

      // h0 hidden first, then h1 → h0 is least-recently-visible.
      notifyHidden('h0');
      notifyHidden('h1');

      // A new visible terminal requests a slot → must steal h0 (LRU hidden),
      // not h1 and not any visible vN.
      const newcomer = fakeTerminal();
      requestWebgl('new', newcomer, true);
      await flush();

      const live = holders();
      expect(live).toContain('new');
      expect(live).not.toContain('h0'); // stolen (oldest hidden)
      expect(live).toContain('h1'); // newer hidden — preserved
      expect(state().attached).toBe(MAX_WEBGL_CONTEXTS);
      expect(newcomer.loadedAddon).not.toBeNull();
    });

    it('notifyVisible steals a slot for a previously-slotless terminal', async () => {
      // Fill all slots with visible holders, then hide one.
      for (let i = 0; i < MAX_WEBGL_CONTEXTS; i++) {
        requestWebgl(`v${i}`, fakeTerminal(), true);
      }
      await flush();
      notifyHidden('v0');

      // A terminal that opened hidden (no slot, pool full) ...
      const late = fakeTerminal();
      requestWebgl('late', late, false);
      await flush();
      expect(holders()).not.toContain('late');

      // ... becomes visible and steals the lone hidden holder v0's slot.
      notifyVisible('late');
      await flush();

      const live = holders();
      expect(live).toContain('late');
      expect(live).not.toContain('v0');
      expect(state().attached).toBe(MAX_WEBGL_CONTEXTS);
    });
  });

  describe('hidden terminals do not steal on open', () => {
    it('a hidden terminal opening into a full pool gets the default renderer', async () => {
      for (let i = 0; i < MAX_WEBGL_CONTEXTS; i++) {
        requestWebgl(`v${i}`, fakeTerminal(), true);
      }
      await flush();

      const hidden = fakeTerminal();
      requestWebgl('hidden', hidden, false);
      await flush();

      expect(holders()).not.toContain('hidden');
      expect(hidden.loadedAddon).toBeNull();
      expect(state().attached).toBe(MAX_WEBGL_CONTEXTS);
    });

    it('a hidden terminal opening into a pool with a free slot takes it', async () => {
      const hidden = fakeTerminal();
      requestWebgl('hidden', hidden, false);
      await flush();

      expect(holders()).toContain('hidden');
      expect(state().attached).toBe(1);
    });
  });

  describe('context-loss re-request', () => {
    it('disposes the lost addon and re-attaches a fresh one once', async () => {
      const term = fakeTerminal();
      requestWebgl('a', term, true);
      await flush();

      const first = term.loadedAddon!;
      expect(first.lossCb).toBeTypeOf('function');

      // Fire context loss.
      first.lossCb!();
      await flush();

      // First addon disposed; a fresh addon attached.
      expect(first.disposed).toBe(true);
      expect(term.loadedAddon).not.toBe(first);
      expect(state().attached).toBe(1);
    });

    it('does not re-attach after a second context loss (one recovery only)', async () => {
      const term = fakeTerminal();
      requestWebgl('a', term, true);
      await flush();

      term.loadedAddon!.lossCb!(); // first loss → recover
      await flush();
      expect(state().attached).toBe(1);

      term.loadedAddon!.lossCb!(); // second loss → stay on default renderer
      await flush();
      expect(state().attached).toBe(0);
      expect(holders()).toEqual([]);
    });
  });

  describe('dispose cleanup', () => {
    it('releaseWebgl disposes the addon and frees the slot', async () => {
      const term = fakeTerminal();
      requestWebgl('a', term, true);
      await flush();
      const addon = term.loadedAddon!;

      releaseWebgl('a');

      expect(addon.disposed).toBe(true);
      expect(state().size).toBe(0);
      expect(state().attached).toBe(0);
    });

    it('releasing a holder hands its freed slot to a waiting terminal', async () => {
      // Fill all slots; one extra visible terminal waits without a slot.
      for (let i = 0; i < MAX_WEBGL_CONTEXTS; i++) {
        requestWebgl(`v${i}`, fakeTerminal(), true);
      }
      const waiter = fakeTerminal();
      requestWebgl('waiter', waiter, true);
      await flush();
      expect(holders()).not.toContain('waiter');

      // Release one holder → the waiter should pick up the freed slot.
      releaseWebgl('v0');
      await flush();

      expect(holders()).toContain('waiter');
      expect(state().attached).toBe(MAX_WEBGL_CONTEXTS);
    });

    it('disposeAll disposes every addon and clears the registry', async () => {
      requestWebgl('a', fakeTerminal(), true);
      requestWebgl('b', fakeTerminal(), true);
      await flush();
      const live = createdAddons.filter(a => !a.disposed);
      expect(live.length).toBe(2);

      disposeAll();

      expect(createdAddons.every(a => a.disposed)).toBe(true);
      expect(state().size).toBe(0);
      expect(state().attached).toBe(0);
    });
  });

  describe('shellView occlusion (an active grid hidden behind editor/settings)', () => {
    // TerminalView gates the pool signal on (grid active AND shellView ===
    // 'terminal'). When the editor/settings tab takes over, every terminal in
    // the active grid is occluded and reports notifyHidden even though its grid
    // is still "active". These tests assert the pool can then reclaim those
    // slots — the bug the gating fixes (an occluded terminal that still reports
    // visible would wedge a slot nothing could steal).
    it('reclaims an occluded full grid for a newly-visible terminal', async () => {
      // A full grid of terminals, all visible on the terminal surface.
      for (let i = 0; i < MAX_WEBGL_CONTEXTS; i++) {
        requestWebgl(`grid${i}`, fakeTerminal(), true);
      }
      await flush();
      expect(state().attached).toBe(MAX_WEBGL_CONTEXTS);

      // Editor tab takes over → TerminalView marks every grid terminal hidden.
      for (let i = 0; i < MAX_WEBGL_CONTEXTS; i++) {
        notifyHidden(`grid${i}`);
      }

      // A different surface's terminal (or a freshly-visible one) now needs a
      // slot — it must be able to steal from the occluded grid (all hidden).
      const newcomer = fakeTerminal();
      requestWebgl('newcomer', newcomer, true);
      await flush();

      expect(holders()).toContain('newcomer');
      expect(newcomer.loadedAddon).not.toBeNull();
      expect(state().attached).toBe(MAX_WEBGL_CONTEXTS);
    });

    it('a terminal that initializes while occluded does not steal a slot', async () => {
      // Pool full of genuinely-visible terminals.
      for (let i = 0; i < MAX_WEBGL_CONTEXTS; i++) {
        requestWebgl(`v${i}`, fakeTerminal(), true);
      }
      await flush();

      // A session launched while the editor tab is foreground seeds isVisible:
      // false (effective visibility) — it must open on the default renderer,
      // never stealing from a visible terminal.
      const occluded = fakeTerminal();
      requestWebgl('occluded', occluded, false);
      await flush();

      expect(holders()).not.toContain('occluded');
      expect(occluded.loadedAddon).toBeNull();
      expect(state().attached).toBe(MAX_WEBGL_CONTEXTS);

      // Returning to the terminal surface marks it visible → it now steals one
      // of the (now-hidden, since they'd also be occluded) holders. Here we hide
      // one to model the LRU victim and confirm reclaim works.
      notifyHidden('v0');
      notifyVisible('occluded');
      await flush();

      expect(holders()).toContain('occluded');
      expect(holders()).not.toContain('v0');
      expect(state().attached).toBe(MAX_WEBGL_CONTEXTS);
    });
  });

  describe('proactive hand-off on hide', () => {
    it('hands a slot off to a waiting terminal when a holder is hidden', async () => {
      for (let i = 0; i < MAX_WEBGL_CONTEXTS; i++) {
        requestWebgl(`v${i}`, fakeTerminal(), true);
      }
      // A hidden waiter that opened into the full pool (no slot).
      const waiter = fakeTerminal();
      requestWebgl('waiter', waiter, false);
      await flush();
      expect(holders()).not.toContain('waiter');

      // Hiding a holder while a waiter is starved hands the slot over.
      notifyHidden('v0');
      await flush();

      expect(holders()).toContain('waiter');
      expect(holders()).not.toContain('v0');
      expect(state().attached).toBe(MAX_WEBGL_CONTEXTS);
    });
  });
});
