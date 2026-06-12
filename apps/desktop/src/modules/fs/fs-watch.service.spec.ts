import * as fs from 'fs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FsWatchService } from './fs-watch.service';
import { InternalFsEvents } from '../shared/events';
import { WATCH_DEBOUNCE_QUIET_MS, WATCH_DEBOUNCE_MAX_MS } from './fs.constants';
import type { FsChangedEvent } from '@omniscribe/shared';

// fs.watch is a getter-only namespace export, so we mock the module to make it
// a jest.fn we can reconfigure. Everything else delegates to the real fs.
jest.mock('fs', () => {
  const actual = jest.requireActual('fs') as typeof import('fs');
  return { ...actual, watch: jest.fn() };
});

// resolveWithinRoot canonicalizes via fs.realpath; for an absolute path that
// exists this is a no-op, but in tests we use a fabricated root. Stub the path
// guard so we can drive the watcher with a synthetic root without touching disk.
jest.mock('./fs-paths', () => ({
  ...jest.requireActual('./fs-paths'),
  resolveWithinRoot: (root: string) => root,
}));

type RawHandler = (eventType: string, filename: string | Buffer | null) => void;

describe('FsWatchService', () => {
  let service: FsWatchService;
  let emitter: EventEmitter2;
  let emitted: FsChangedEvent[];
  let watchHandlers: Map<string, RawHandler>;
  let closeSpies: jest.Mock[];

  const ROOT = '/project/root';

  beforeEach(() => {
    jest.useFakeTimers();
    emitter = new EventEmitter2();
    emitted = [];
    emitter.on(InternalFsEvents.CHANGED, (p: FsChangedEvent) => emitted.push(p));

    watchHandlers = new Map();
    closeSpies = [];

    // Capture the raw-event handler per directory so the test can drive events
    // deterministically through the mocked fs.watch.
    (fs.watch as jest.Mock).mockImplementation(
      (dir: string, _opts: unknown, handler: RawHandler): fs.FSWatcher => {
        watchHandlers.set(dir, handler);
        const close = jest.fn();
        closeSpies.push(close);
        return { close, on: jest.fn() } as unknown as fs.FSWatcher;
      }
    );

    service = new FsWatchService(emitter);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function fire(file: string): void {
    const handler = watchHandlers.get(ROOT);
    handler?.('change', file);
  }

  // -------------------------------------------------------------------------
  // Refcounting
  // -------------------------------------------------------------------------
  describe('refcounting', () => {
    it('creates exactly one native watcher for multiple subscribers of a root', () => {
      service.watch('clientA', ROOT, 'w1');
      service.watch('clientB', ROOT, 'w2');
      expect(fs.watch as jest.Mock).toHaveBeenCalledTimes(1);
    });

    it('keeps the watcher alive until the last subscriber unwatches', () => {
      service.watch('clientA', ROOT, 'w1');
      service.watch('clientB', ROOT, 'w2');

      service.unwatch('clientA', ROOT, 'w1');
      expect(closeSpies[0]).not.toHaveBeenCalled();

      service.unwatch('clientB', ROOT, 'w2');
      expect(closeSpies[0]).toHaveBeenCalledTimes(1);
    });

    it('tears down a client’s watchers on disconnect', () => {
      service.watch('clientA', ROOT, 'w1');
      service.removeClient('clientA');
      expect(closeSpies[0]).toHaveBeenCalledTimes(1);
    });

    it('is idempotent for the same (client, watchId)', () => {
      service.watch('clientA', ROOT, 'w1');
      service.watch('clientA', ROOT, 'w1');
      // One unwatch removes it (it was only counted once).
      service.unwatch('clientA', ROOT, 'w1');
      expect(closeSpies[0]).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Debounce batching
  // -------------------------------------------------------------------------
  describe('debounce batching', () => {
    it('collapses a burst into one event after the quiet window', () => {
      service.watch('clientA', ROOT, 'w1');
      fire('a.txt');
      fire('b.txt');
      fire('a.txt'); // duplicate — deduplicated

      expect(emitted).toHaveLength(0);
      jest.advanceTimersByTime(WATCH_DEBOUNCE_QUIET_MS);

      expect(emitted).toHaveLength(1);
      expect(emitted[0].projectPath).toBe(ROOT);
      expect(emitted[0].paths.sort()).toEqual(['/project/root/a.txt', '/project/root/b.txt']);
    });

    it('emits at the max window under sustained churn', () => {
      service.watch('clientA', ROOT, 'w1');
      // Fire just under the quiet threshold repeatedly so the quiet timer keeps
      // resetting; the max-window ceiling must still force an emit.
      const step = WATCH_DEBOUNCE_QUIET_MS - 10;
      let elapsed = 0;
      fire('x.txt');
      while (elapsed < WATCH_DEBOUNCE_MAX_MS) {
        jest.advanceTimersByTime(step);
        elapsed += step;
        fire('x.txt');
      }
      expect(emitted.length).toBeGreaterThanOrEqual(1);
    });

    it('does not emit when there are no subscribers left at flush time', () => {
      service.watch('clientA', ROOT, 'w1');
      fire('a.txt');
      service.unwatch('clientA', ROOT, 'w1'); // tears down watcher + clears pending
      jest.advanceTimersByTime(WATCH_DEBOUNCE_MAX_MS);
      expect(emitted).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // SKIP_DIRS filter
  // -------------------------------------------------------------------------
  describe('SKIP_DIRS filter', () => {
    it('ignores events under skipped directories', () => {
      service.watch('clientA', ROOT, 'w1');
      fire('node_modules/pkg/index.js');
      fire('.git/objects/ab/cdef');
      fire('dist/bundle.js');
      jest.advanceTimersByTime(WATCH_DEBOUNCE_MAX_MS);
      expect(emitted).toHaveLength(0);
    });

    it('passes through events outside skipped directories', () => {
      service.watch('clientA', ROOT, 'w1');
      fire('src/index.ts');
      jest.advanceTimersByTime(WATCH_DEBOUNCE_QUIET_MS);
      expect(emitted).toHaveLength(1);
      expect(emitted[0].paths).toEqual(['/project/root/src/index.ts']);
    });
  });
});
