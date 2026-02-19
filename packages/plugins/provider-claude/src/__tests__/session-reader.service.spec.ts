// ---- Module-level mocks ----

const mockFsPromises = {
  readFile: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
};

const mockCreateReadStream = jest.fn();
const mockExistsSync = jest.fn().mockReturnValue(true);

const mockWatcherClose = jest.fn();
const watchCallbacks: Map<string, (eventType: string, filename: string | null) => void> = new Map();

jest.mock('fs', () => ({
  promises: mockFsPromises,
  createReadStream: (...args: unknown[]) => mockCreateReadStream(...args),
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  watch: jest.fn((_dir: string, cb: (eventType: string, filename: string | null) => void) => {
    watchCallbacks.set(_dir, cb);
    const watcher = {
      close: mockWatcherClose,
      on: jest.fn().mockReturnThis(),
    };
    return watcher;
  }),
}));

// Mock readline for async iteration
const mockLines: string[] = [];
const mockRlClose = jest.fn();

jest.mock('readline', () => ({
  createInterface: jest.fn(() => {
    const lines = [...mockLines];
    let index = 0;
    return {
      close: mockRlClose,
      [Symbol.asyncIterator]: () => ({
        next: () => {
          if (index < lines.length) {
            return Promise.resolve({ value: lines[index++], done: false });
          }
          return Promise.resolve({ value: undefined, done: true });
        },
      }),
    };
  }),
}));

const mockGetClaudeSessionsDir = jest.fn().mockReturnValue('/home/user/.claude/projects/encoded');
const mockGetSessionsIndexPath = jest
  .fn()
  .mockReturnValue('/home/user/.claude/projects/encoded/sessions-index.json');

jest.mock('@omniscribe/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  extractErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
  getClaudeSessionsDir: (...args: unknown[]) => mockGetClaudeSessionsDir(...args),
  getSessionsIndexPath: (...args: unknown[]) => mockGetSessionsIndexPath(...args),
}));

// Import AFTER mocks are set up
import { ClaudeSessionReaderService } from '../services/session-reader.service';

// ---- Helpers ----

const EMPTY_INDEX = JSON.stringify({ version: 1, entries: [] });

function makeIndexEntry(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'session-default',
    fullPath: '/path/default.jsonl',
    fileMtime: 1000,
    firstPrompt: 'Default prompt',
    summary: '',
    messageCount: 1,
    created: '2025-01-01T00:00:00Z',
    modified: '2025-01-01T00:00:00Z',
    gitBranch: '',
    projectPath: '/project',
    isSidechain: false,
    ...overrides,
  };
}

// ---- Tests ----

describe('ClaudeSessionReaderService', () => {
  let service: ClaudeSessionReaderService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLines.length = 0;
    watchCallbacks.clear();
    service = new ClaudeSessionReaderService();
  });

  // ==================================================================
  // readSessionsIndex
  // ==================================================================
  describe('readSessionsIndex', () => {
    it('should read and return entries from sessions-index.json', async () => {
      const entry = makeIndexEntry({
        sessionId: 'session-a',
        modified: '2025-01-02T00:00:00Z',
      });
      mockFsPromises.readFile.mockResolvedValueOnce(
        JSON.stringify({ version: 1, entries: [entry] })
      );
      mockFsPromises.readdir.mockResolvedValueOnce([]);

      const entries = await service.readSessionsIndex('/project');

      expect(entries).toHaveLength(1);
      expect(entries[0].sessionId).toBe('session-a');
    });

    it('should return empty array when sessions-index.json does not exist', async () => {
      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      mockFsPromises.readFile.mockRejectedValueOnce(enoentError);
      mockFsPromises.readdir.mockResolvedValueOnce([]);

      const entries = await service.readSessionsIndex('/project');

      expect(entries).toEqual([]);
    });

    it('should return empty array when sessions-index.json has invalid JSON', async () => {
      mockFsPromises.readFile.mockResolvedValueOnce('not valid json{{{');
      mockFsPromises.readdir.mockResolvedValueOnce([]);

      const entries = await service.readSessionsIndex('/project');

      expect(entries).toEqual([]);
    });

    it('should return empty array when sessions-index has no entries array', async () => {
      mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify({ version: 1 }));
      mockFsPromises.readdir.mockResolvedValueOnce([]);

      const entries = await service.readSessionsIndex('/project');

      expect(entries).toEqual([]);
    });

    it('should filter out sidechain sessions', async () => {
      const normalEntry = makeIndexEntry({ sessionId: 'normal', isSidechain: false });
      const sidechainEntry = makeIndexEntry({ sessionId: 'sidechain', isSidechain: true });
      mockFsPromises.readFile.mockResolvedValueOnce(
        JSON.stringify({ version: 1, entries: [normalEntry, sidechainEntry] })
      );
      mockFsPromises.readdir.mockResolvedValueOnce([]);

      const entries = await service.readSessionsIndex('/project');

      expect(entries).toHaveLength(1);
      expect(entries[0].sessionId).toBe('normal');
    });

    it('should sort entries by modified date descending (newest first)', async () => {
      const oldEntry = makeIndexEntry({
        sessionId: 'old-session',
        modified: '2025-01-01T00:00:00Z',
      });
      const newEntry = makeIndexEntry({
        sessionId: 'new-session',
        modified: '2025-01-05T00:00:00Z',
      });
      mockFsPromises.readFile.mockResolvedValueOnce(
        JSON.stringify({ version: 1, entries: [oldEntry, newEntry] })
      );
      mockFsPromises.readdir.mockResolvedValueOnce([]);

      const entries = await service.readSessionsIndex('/project');

      expect(entries[0].sessionId).toBe('new-session');
      expect(entries[1].sessionId).toBe('old-session');
    });

    it('should merge scanned .jsonl entries not in the index', async () => {
      const indexedEntry = makeIndexEntry({
        sessionId: 'indexed-session',
        modified: '2025-01-01T00:00:00Z',
      });
      mockFsPromises.readFile.mockResolvedValueOnce(
        JSON.stringify({ version: 1, entries: [indexedEntry] })
      );

      mockFsPromises.readdir.mockResolvedValueOnce([
        { name: 'indexed-session.jsonl', isFile: () => true },
        { name: 'new-session.jsonl', isFile: () => true },
      ]);

      mockFsPromises.stat.mockResolvedValueOnce({ mtimeMs: 3000 });

      mockLines.push(
        JSON.stringify({
          sessionId: 'new-session',
          timestamp: '2025-01-10T00:00:00Z',
          gitBranch: 'feature/test',
        })
      );

      const entries = await service.readSessionsIndex('/project');

      expect(entries).toHaveLength(2);
      const scannedEntry = entries.find(e => e.sessionId === 'new-session');
      expect(scannedEntry).toBeDefined();
      expect(scannedEntry!.gitBranch).toBe('feature/test');
    });

    it('should handle readdir ENOENT gracefully (no sessions directory)', async () => {
      mockFsPromises.readFile.mockResolvedValueOnce(EMPTY_INDEX);
      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      mockFsPromises.readdir.mockRejectedValueOnce(enoentError);

      const entries = await service.readSessionsIndex('/project');

      expect(entries).toEqual([]);
    });
  });

  // ==================================================================
  // readFileWithRetry (tested indirectly)
  // ==================================================================
  describe('readFileWithRetry (via readSessionsIndex)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return null for ENOENT (file not found)', async () => {
      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      mockFsPromises.readFile.mockRejectedValueOnce(enoentError);
      mockFsPromises.readdir.mockResolvedValueOnce([]);

      const entries = await service.readSessionsIndex('/project');

      expect(entries).toEqual([]);
    });

    it('should retry once on EBUSY then succeed', async () => {
      const ebusyError = new Error('EBUSY') as NodeJS.ErrnoException;
      ebusyError.code = 'EBUSY';

      mockFsPromises.readFile.mockRejectedValueOnce(ebusyError).mockResolvedValueOnce(EMPTY_INDEX);
      mockFsPromises.readdir.mockResolvedValueOnce([]);

      const promise = service.readSessionsIndex('/project');

      await jest.advanceTimersByTimeAsync(600);

      const entries = await promise;

      expect(entries).toEqual([]);
      expect(mockFsPromises.readFile).toHaveBeenCalledTimes(2);
    });

    it('should retry once on EPERM then succeed', async () => {
      const epermError = new Error('EPERM') as NodeJS.ErrnoException;
      epermError.code = 'EPERM';

      mockFsPromises.readFile.mockRejectedValueOnce(epermError).mockResolvedValueOnce(EMPTY_INDEX);
      mockFsPromises.readdir.mockResolvedValueOnce([]);

      const promise = service.readSessionsIndex('/project');

      await jest.advanceTimersByTimeAsync(600);

      const entries = await promise;

      expect(entries).toEqual([]);
      expect(mockFsPromises.readFile).toHaveBeenCalledTimes(2);
    });

    it('should return null if retry also gets ENOENT', async () => {
      const ebusyError = new Error('EBUSY') as NodeJS.ErrnoException;
      ebusyError.code = 'EBUSY';
      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      mockFsPromises.readFile.mockRejectedValueOnce(ebusyError).mockRejectedValueOnce(enoentError);
      mockFsPromises.readdir.mockResolvedValueOnce([]);

      const promise = service.readSessionsIndex('/project');

      await jest.advanceTimersByTimeAsync(600);

      const entries = await promise;

      expect(entries).toEqual([]);
    });
  });

  // ==================================================================
  // scanJsonlFiles (tested indirectly)
  // ==================================================================
  describe('scanJsonlFiles (via readSessionsIndex)', () => {
    it('should skip .jsonl files already in the index', async () => {
      const entry = makeIndexEntry({ sessionId: 'existing-session' });
      mockFsPromises.readFile.mockResolvedValueOnce(
        JSON.stringify({ version: 1, entries: [entry] })
      );
      mockFsPromises.readdir.mockResolvedValueOnce([
        { name: 'existing-session.jsonl', isFile: () => true },
      ]);

      const entries = await service.readSessionsIndex('/project');

      expect(mockFsPromises.stat).not.toHaveBeenCalled();
      expect(entries).toHaveLength(1);
    });

    it('should handle empty directory', async () => {
      mockFsPromises.readFile.mockResolvedValueOnce(EMPTY_INDEX);
      mockFsPromises.readdir.mockResolvedValueOnce([]);

      const entries = await service.readSessionsIndex('/project');

      expect(entries).toEqual([]);
    });

    it('should skip non-jsonl files and sessions-index.json', async () => {
      mockFsPromises.readFile.mockResolvedValueOnce(EMPTY_INDEX);
      mockFsPromises.readdir.mockResolvedValueOnce([
        { name: 'sessions-index.json', isFile: () => true },
        { name: 'readme.txt', isFile: () => true },
        { name: 'some-dir', isFile: () => false },
      ]);

      const entries = await service.readSessionsIndex('/project');

      expect(mockFsPromises.stat).not.toHaveBeenCalled();
      expect(entries).toEqual([]);
    });

    it('should handle stat failure for individual files', async () => {
      mockFsPromises.readFile.mockResolvedValueOnce(EMPTY_INDEX);
      mockFsPromises.readdir.mockResolvedValueOnce([
        { name: 'broken-session.jsonl', isFile: () => true },
      ]);
      mockFsPromises.stat.mockRejectedValueOnce(new Error('stat failed'));

      const entries = await service.readSessionsIndex('/project');

      expect(entries).toEqual([]);
    });
  });

  // ==================================================================
  // extractEntryFromJsonl (tested indirectly)
  // ==================================================================
  describe('extractEntryFromJsonl (via readSessionsIndex)', () => {
    function setupSingleJsonlScan() {
      mockFsPromises.readFile.mockResolvedValueOnce(EMPTY_INDEX);
      mockFsPromises.readdir.mockResolvedValueOnce([
        { name: 'test-session.jsonl', isFile: () => true },
      ]);
      mockFsPromises.stat.mockResolvedValueOnce({ mtimeMs: 5000 });
    }

    it('should extract sessionId, gitBranch, and timestamp from jsonl lines', async () => {
      mockLines.push(
        JSON.stringify({
          sessionId: 'extracted-id',
          gitBranch: 'feature/branch',
          timestamp: '2025-06-01T12:00:00Z',
        })
      );
      setupSingleJsonlScan();

      const entries = await service.readSessionsIndex('/project');

      expect(entries).toHaveLength(1);
      expect(entries[0].sessionId).toBe('extracted-id');
      expect(entries[0].gitBranch).toBe('feature/branch');
      expect(entries[0].created).toBe('2025-06-01T12:00:00Z');
    });

    it('should extract first user prompt from string content', async () => {
      mockLines.push(
        JSON.stringify({ sessionId: 'sess-1', timestamp: '2025-01-01T00:00:00Z' }),
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'Fix the login bug' },
        })
      );
      setupSingleJsonlScan();

      const entries = await service.readSessionsIndex('/project');

      expect(entries).toHaveLength(1);
      expect(entries[0].firstPrompt).toBe('Fix the login bug');
    });

    it('should extract first user prompt from array content', async () => {
      mockLines.push(
        JSON.stringify({ sessionId: 'sess-1', timestamp: '2025-01-01T00:00:00Z' }),
        JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Help me refactor' }],
          },
        })
      );
      setupSingleJsonlScan();

      const entries = await service.readSessionsIndex('/project');

      expect(entries).toHaveLength(1);
      expect(entries[0].firstPrompt).toBe('Help me refactor');
    });

    it('should detect sidechain sessions and filter them out', async () => {
      mockLines.push(
        JSON.stringify({
          sessionId: 'sidechain-sess',
          timestamp: '2025-01-01T00:00:00Z',
          isSidechain: true,
        })
      );
      setupSingleJsonlScan();

      const entries = await service.readSessionsIndex('/project');

      expect(entries).toHaveLength(0);
    });

    it('should use filename as sessionId when content has no sessionId', async () => {
      mockLines.push(JSON.stringify({ timestamp: '2025-01-01T00:00:00Z' }));
      setupSingleJsonlScan();

      const entries = await service.readSessionsIndex('/project');

      expect(entries).toHaveLength(1);
      expect(entries[0].sessionId).toBe('test-session');
    });

    it('should use file mtime as created date when no timestamp in content', async () => {
      mockLines.push(JSON.stringify({ sessionId: 'no-ts-session' }));
      setupSingleJsonlScan();

      const entries = await service.readSessionsIndex('/project');

      expect(entries).toHaveLength(1);
      expect(entries[0].created).toBe(new Date(5000).toISOString());
    });

    it('should default firstPrompt to "No prompt" when none found', async () => {
      mockLines.push(JSON.stringify({ sessionId: 'no-prompt' }));
      setupSingleJsonlScan();

      const entries = await service.readSessionsIndex('/project');

      expect(entries).toHaveLength(1);
      expect(entries[0].firstPrompt).toBe('No prompt');
    });

    it('should skip unparseable lines without failing', async () => {
      mockLines.push(
        'not json at all',
        JSON.stringify({ sessionId: 'good-session', timestamp: '2025-01-01T00:00:00Z' })
      );
      setupSingleJsonlScan();

      const entries = await service.readSessionsIndex('/project');

      expect(entries).toHaveLength(1);
      expect(entries[0].sessionId).toBe('good-session');
    });

    it('should only read first 20 lines', async () => {
      for (let i = 0; i < 25; i++) {
        mockLines.push(JSON.stringify({ line: i }));
      }
      setupSingleJsonlScan();

      const entries = await service.readSessionsIndex('/project');

      expect(entries).toHaveLength(1);
      expect(entries[0].sessionId).toBe('test-session');
    });

    it('should truncate firstPrompt to 200 characters', async () => {
      const longPrompt = 'A'.repeat(300);
      mockLines.push(
        JSON.stringify({ sessionId: 'sess-1', timestamp: '2025-01-01T00:00:00Z' }),
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: longPrompt },
        })
      );
      setupSingleJsonlScan();

      const entries = await service.readSessionsIndex('/project');

      expect(entries[0].firstPrompt).toHaveLength(200);
    });
  });

  // ==================================================================
  // findNewSession
  // ==================================================================
  describe('findNewSession', () => {
    it('should return the newest session not in the previous set', async () => {
      const oldEntry = makeIndexEntry({
        sessionId: 'old-session',
        modified: '2025-01-01T00:00:00Z',
      });
      const newEntry = makeIndexEntry({
        sessionId: 'new-session',
        modified: '2025-01-10T00:00:00Z',
      });
      mockFsPromises.readFile.mockResolvedValueOnce(
        JSON.stringify({ version: 1, entries: [oldEntry, newEntry] })
      );
      mockFsPromises.readdir.mockResolvedValueOnce([]);

      const previousIds = new Set(['old-session']);
      const result = await service.findNewSession('/project', previousIds);

      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe('new-session');
    });

    it('should return null when no new sessions are found', async () => {
      const entry = makeIndexEntry({ sessionId: 'existing-session' });
      mockFsPromises.readFile.mockResolvedValueOnce(
        JSON.stringify({ version: 1, entries: [entry] })
      );
      mockFsPromises.readdir.mockResolvedValueOnce([]);

      const previousIds = new Set(['existing-session']);
      const result = await service.findNewSession('/project', previousIds);

      expect(result).toBeNull();
    });

    it('should return the newest when multiple new sessions exist', async () => {
      const entryA = makeIndexEntry({
        sessionId: 'new-a',
        modified: '2025-01-05T00:00:00Z',
      });
      const entryB = makeIndexEntry({
        sessionId: 'new-b',
        modified: '2025-01-10T00:00:00Z',
      });
      mockFsPromises.readFile.mockResolvedValueOnce(
        JSON.stringify({ version: 1, entries: [entryA, entryB] })
      );
      mockFsPromises.readdir.mockResolvedValueOnce([]);

      const previousIds = new Set<string>();
      const result = await service.findNewSession('/project', previousIds);

      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe('new-b');
    });

    it('should return null when index is empty', async () => {
      mockFsPromises.readFile.mockResolvedValueOnce(EMPTY_INDEX);
      mockFsPromises.readdir.mockResolvedValueOnce([]);

      const result = await service.findNewSession('/project', new Set());

      expect(result).toBeNull();
    });
  });

  // ==================================================================
  // readSessionHistory
  // ==================================================================
  describe('readSessionHistory', () => {
    it('should map ClaudeSessionEntry to ProviderSessionEntry', async () => {
      const entry = makeIndexEntry({
        sessionId: 'session-hist',
        firstPrompt: 'Write unit tests',
        messageCount: 5,
        created: '2025-01-01T00:00:00Z',
        modified: '2025-01-02T00:00:00Z',
        gitBranch: 'feature/tests',
        projectPath: '/my/project',
        fullPath: '/path/to/session.jsonl',
        isSidechain: false,
      });
      mockFsPromises.readFile.mockResolvedValueOnce(
        JSON.stringify({ version: 1, entries: [entry] })
      );
      mockFsPromises.readdir.mockResolvedValueOnce([]);

      const providerEntries = await service.readSessionHistory('/my/project');

      expect(providerEntries).toHaveLength(1);
      expect(providerEntries[0].sessionId).toBe('session-hist');
      expect(providerEntries[0].summary).toBe('Write unit tests');
      expect(providerEntries[0].messageCount).toBe(5);
      expect(providerEntries[0].created).toBe('2025-01-01T00:00:00Z');
      expect(providerEntries[0].modified).toBe('2025-01-02T00:00:00Z');
      expect(providerEntries[0].metadata?.gitBranch).toBe('feature/tests');
      expect(providerEntries[0].metadata?.fullPath).toBe('/path/to/session.jsonl');
    });

    it('should use summary if firstPrompt is empty', async () => {
      const entry = makeIndexEntry({
        sessionId: 'sum-session',
        firstPrompt: '',
        summary: 'Refactoring auth module',
      });
      mockFsPromises.readFile.mockResolvedValueOnce(
        JSON.stringify({ version: 1, entries: [entry] })
      );
      mockFsPromises.readdir.mockResolvedValueOnce([]);

      const providerEntries = await service.readSessionHistory('/project');

      expect(providerEntries[0].summary).toBe('Refactoring auth module');
    });

    it('should return empty array when no sessions exist', async () => {
      mockFsPromises.readFile.mockResolvedValueOnce(EMPTY_INDEX);
      mockFsPromises.readdir.mockResolvedValueOnce([]);

      const providerEntries = await service.readSessionHistory('/project');

      expect(providerEntries).toEqual([]);
    });
  });

  // ==================================================================
  // watchSessionsIndex
  // ==================================================================
  describe('watchSessionsIndex', () => {
    it('should return a cleanup function', () => {
      const cleanup = service.watchSessionsIndex('/project', jest.fn());

      expect(typeof cleanup).toBe('function');
      cleanup();
    });

    it('should return no-op when directory does not exist', () => {
      mockExistsSync.mockReturnValueOnce(false);

      const callback = jest.fn();
      const cleanup = service.watchSessionsIndex('/project', callback);

      expect(typeof cleanup).toBe('function');
      cleanup();
      expect(mockWatcherClose).not.toHaveBeenCalled();
    });

    it('should replace existing watcher for same project', () => {
      service.watchSessionsIndex('/project', jest.fn());
      service.watchSessionsIndex('/project', jest.fn());

      expect(mockWatcherClose).toHaveBeenCalledTimes(1);
    });

    it('should call callback on file change with debounce', async () => {
      jest.useFakeTimers();

      const callback = jest.fn();
      mockFsPromises.readFile.mockResolvedValue(EMPTY_INDEX);
      mockFsPromises.readdir.mockResolvedValue([]);

      service.watchSessionsIndex('/project', callback);

      const dirPath = Array.from(watchCallbacks.keys())[0];
      const watchCb = watchCallbacks.get(dirPath);
      expect(watchCb).toBeDefined();

      watchCb!('change', 'sessions-index.json');

      await jest.advanceTimersByTimeAsync(500);

      expect(callback).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should not trigger callback for unrelated files', async () => {
      jest.useFakeTimers();

      const callback = jest.fn();
      service.watchSessionsIndex('/project', callback);

      const dirPath = Array.from(watchCallbacks.keys())[0];
      const watchCb = watchCallbacks.get(dirPath);

      watchCb!('change', 'other-file.json');

      await jest.advanceTimersByTimeAsync(500);

      expect(callback).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  // ==================================================================
  // destroy
  // ==================================================================
  describe('destroy', () => {
    it('should close all active watchers', () => {
      service.watchSessionsIndex('/project1', jest.fn());
      service.watchSessionsIndex('/project2', jest.fn());

      service.destroy();

      expect(mockWatcherClose).toHaveBeenCalledTimes(2);
    });

    it('should be safe to call when no watchers exist', () => {
      expect(() => service.destroy()).not.toThrow();
    });
  });
});
