import {
  createLogger,
  parseLogEntries,
  getLogLevel,
  setLogLevel,
  setColorsEnabled,
  setTimestampsEnabled,
  LogLevel,
} from './logger';
import type { LogEntry } from './logger';

// Reset module-level state before each test.
// jest.config.js has clearMocks + restoreMocks, which auto-clears spy call
// history and restores original implementations between tests.
// Module-level state (currentLogLevel, colorsEnabled, timestampsEnabled)
// must be reset manually.
beforeEach(() => {
  setLogLevel(LogLevel.DEBUG);
  setColorsEnabled(false);
  setTimestampsEnabled(false);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getLogLevel / setLogLevel', () => {
  it.each([[LogLevel.ERROR], [LogLevel.WARN], [LogLevel.INFO], [LogLevel.DEBUG]])(
    'round-trips LogLevel %i',
    level => {
      setLogLevel(level);
      expect(getLogLevel()).toBe(level);
    }
  );
});

describe('parseLogEntries', () => {
  it('returns empty array for empty string', () => {
    expect(parseLogEntries('')).toEqual([]);
  });

  it('parses a single valid entry', () => {
    const entry: LogEntry = {
      timestamp: '2026-01-01T00:00:00.000Z',
      level: 'info',
      context: 'Test',
      message: 'hello',
    };
    const result = parseLogEntries(JSON.stringify(entry));
    expect(result).toEqual([entry]);
  });

  it('parses multiple valid entries', () => {
    const entries: LogEntry[] = [
      { timestamp: '2026-01-01T00:00:00.000Z', level: 'info', context: 'A', message: 'first' },
      { timestamp: '2026-01-01T00:00:01.000Z', level: 'error', context: 'B', message: 'second' },
    ];
    const raw = entries.map(e => JSON.stringify(e)).join('\n');
    expect(parseLogEntries(raw)).toEqual(entries);
  });

  it('skips malformed JSON lines', () => {
    const valid: LogEntry = {
      timestamp: '2026-01-01T00:00:00.000Z',
      level: 'info',
      context: 'Test',
      message: 'ok',
    };
    const raw = `not json\n${JSON.stringify(valid)}\n{broken`;
    expect(parseLogEntries(raw)).toEqual([valid]);
  });

  it('skips valid JSON missing required fields', () => {
    const incomplete = JSON.stringify({ timestamp: '2026-01-01T00:00:00.000Z', level: 'info' });
    const valid: LogEntry = {
      timestamp: '2026-01-01T00:00:00.000Z',
      level: 'info',
      context: 'Test',
      message: 'ok',
    };
    const raw = `${incomplete}\n${JSON.stringify(valid)}`;
    expect(parseLogEntries(raw)).toEqual([valid]);
  });

  it('preserves extra fields like data', () => {
    const entry = {
      timestamp: '2026-01-01T00:00:00.000Z',
      level: 'debug',
      context: 'Test',
      message: 'with data',
      data: { key: 'value' },
    };
    const result = parseLogEntries(JSON.stringify(entry));
    expect(result[0].data).toEqual({ key: 'value' });
  });

  it('handles trailing newline', () => {
    const entry: LogEntry = {
      timestamp: '2026-01-01T00:00:00.000Z',
      level: 'info',
      context: 'Test',
      message: 'trailing',
    };
    const raw = JSON.stringify(entry) + '\n';
    expect(parseLogEntries(raw)).toEqual([entry]);
  });
});

describe('createLogger — log level filtering', () => {
  it('only calls console.error when level is ERROR', () => {
    setLogLevel(LogLevel.ERROR);
    const logger = createLogger('Test');

    logger.error('err');
    logger.warn('wrn');
    logger.info('inf');
    logger.debug('dbg');
    logger.log('lg');

    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.log).not.toHaveBeenCalled();
  });

  it('allows error and warn when level is WARN', () => {
    setLogLevel(LogLevel.WARN);
    const logger = createLogger('Test');

    logger.error('err');
    logger.warn('wrn');
    logger.info('inf');
    logger.debug('dbg');

    expect(console.error).toHaveBeenCalledTimes(1); // error()
    expect(console.log).toHaveBeenCalledTimes(1); // warn()
  });

  it('allows error, warn, info, and log when level is INFO', () => {
    setLogLevel(LogLevel.INFO);
    const logger = createLogger('Test');

    logger.error('err');
    logger.warn('wrn');
    logger.info('inf');
    logger.debug('dbg');
    logger.log('lg');

    expect(console.error).toHaveBeenCalledTimes(1); // error()
    expect(console.log).toHaveBeenCalledTimes(3); // warn, info, log
  });

  it('allows all methods when level is DEBUG', () => {
    setLogLevel(LogLevel.DEBUG);
    const logger = createLogger('Test');

    logger.error('err');
    logger.warn('wrn');
    logger.info('inf');
    logger.debug('dbg');
    logger.log('lg');

    expect(console.error).toHaveBeenCalledTimes(1); // error()
    expect(console.log).toHaveBeenCalledTimes(4); // warn, info, debug, log
  });
});

describe('createLogger — output routing', () => {
  it('routes error to console.error by default', () => {
    const logger = createLogger('Test');
    logger.error('err');
    expect(console.error).toHaveBeenCalled();
  });

  it('routes warn/info/debug/log to console.log by default', () => {
    const logger = createLogger('Test');
    logger.warn('w');
    logger.info('i');
    logger.debug('d');
    logger.log('l');
    expect(console.log).toHaveBeenCalledTimes(4);
  });

  it('routes non-error output to console.error when useStderr is true', () => {
    const logger = createLogger('Test', { useStderr: true });
    logger.warn('w');
    logger.info('i');
    logger.debug('d');
    logger.log('l');
    // All 4 should go to console.error since useStderr captures console.error reference
    expect(console.error).toHaveBeenCalledTimes(4);
    expect(console.log).not.toHaveBeenCalled();
  });

  it('still routes error() to console.error with useStderr', () => {
    const logger = createLogger('Test', { useStderr: true });
    logger.error('e');
    expect(console.error).toHaveBeenCalled();
  });
});

describe('createLogger — context in output', () => {
  it('includes the context name in formatted output', () => {
    const logger = createLogger('MyService');
    logger.info('hello');

    const call = (console.log as jest.Mock).mock.calls[0];
    const prefix = call[0] as string;
    expect(prefix).toContain('[MyService]');
  });

  it('includes the context for error output', () => {
    const logger = createLogger('ErrorCtx');
    logger.error('fail');

    const call = (console.error as jest.Mock).mock.calls[0];
    const prefix = call[0] as string;
    expect(prefix).toContain('[ErrorCtx]');
  });
});

describe('createLogger — log() is alias for info()', () => {
  it('produces identical output format for log() and info()', () => {
    const logger = createLogger('Alias');
    logger.info('message');
    logger.log('message');

    const infoCall = (console.log as jest.Mock).mock.calls[0];
    const logCall = (console.log as jest.Mock).mock.calls[1];

    // Both should have the same prefix format (both use 'INFO' level)
    expect(infoCall[0] as string).toContain('INFO');
    expect(logCall[0] as string).toContain('INFO');
  });

  it('log() is suppressed at WARN level just like info()', () => {
    setLogLevel(LogLevel.WARN);
    const logger = createLogger('Alias');
    logger.log('should be suppressed');
    logger.info('also suppressed');
    expect(console.log).not.toHaveBeenCalled();
  });
});

describe('createLogger — fileTransport', () => {
  it('calls fileTransport with JSONL for each log method', () => {
    const transport = jest.fn();
    const logger = createLogger('FT', { fileTransport: transport });

    logger.error('err msg');
    logger.warn('warn msg');
    logger.info('info msg');
    logger.debug('debug msg');

    expect(transport).toHaveBeenCalledTimes(4);

    const levels = transport.mock.calls.map(call => {
      const parsed = JSON.parse(call[0] as string) as LogEntry;
      return parsed.level;
    });
    expect(levels).toEqual(['error', 'warn', 'info', 'debug']);
  });

  it('produces valid JSONL with correct fields', () => {
    const transport = jest.fn();
    const logger = createLogger('CTX', { fileTransport: transport });

    logger.info('test message');

    const raw = transport.mock.calls[0][0] as string;
    expect(raw.endsWith('\n')).toBe(true);

    const entry = JSON.parse(raw) as LogEntry;
    expect(entry.level).toBe('info');
    expect(entry.context).toBe('CTX');
    expect(entry.message).toBe('test message');
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('includes single extra arg as data', () => {
    const transport = jest.fn();
    const logger = createLogger('CTX', { fileTransport: transport });

    logger.info('msg', { extra: true });

    const entry = JSON.parse(transport.mock.calls[0][0]) as LogEntry;
    expect(entry.data).toEqual({ extra: true });
  });

  it('includes multiple extra args as data array', () => {
    const transport = jest.fn();
    const logger = createLogger('CTX', { fileTransport: transport });

    logger.info('msg', 'a', 'b');

    const entry = JSON.parse(transport.mock.calls[0][0]) as LogEntry;
    expect(entry.data).toEqual(['a', 'b']);
  });

  it('does not include data when only one arg', () => {
    const transport = jest.fn();
    const logger = createLogger('CTX', { fileTransport: transport });

    logger.info('only message');

    const entry = JSON.parse(transport.mock.calls[0][0]) as LogEntry;
    expect(entry.data).toBeUndefined();
  });

  it('does not call fileTransport when log level is too low', () => {
    const transport = jest.fn();
    setLogLevel(LogLevel.ERROR);
    const logger = createLogger('CTX', { fileTransport: transport });

    logger.info('suppressed');
    logger.debug('suppressed');
    logger.warn('suppressed');

    expect(transport).not.toHaveBeenCalled();
  });

  it('stringifies non-string first arg in message field', () => {
    const transport = jest.fn();
    const logger = createLogger('CTX', { fileTransport: transport });

    logger.info({ key: 'value' });

    const entry = JSON.parse(transport.mock.calls[0][0]) as LogEntry;
    expect(entry.message).toBe('{"key":"value"}');
  });
});

describe('createLogger — timestamps', () => {
  it('includes timestamp in prefix when enabled', () => {
    setTimestampsEnabled(true);
    const logger = createLogger('TS');
    logger.info('hello');

    const prefix = (console.log as jest.Mock).mock.calls[0][0] as string;
    // ISO timestamp pattern
    expect(prefix).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('does not include timestamp in prefix when disabled', () => {
    setTimestampsEnabled(false);
    const logger = createLogger('TS');
    logger.info('hello');

    const prefix = (console.log as jest.Mock).mock.calls[0][0] as string;
    expect(prefix).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe('createLogger — colors', () => {
  it('includes ANSI codes when colors are enabled', () => {
    setColorsEnabled(true);
    const logger = createLogger('Color');
    logger.info('hello');

    const prefix = (console.log as jest.Mock).mock.calls[0][0] as string;
    expect(prefix).toContain('\x1b[');
  });

  it('does not include ANSI codes when colors are disabled', () => {
    setColorsEnabled(false);
    const logger = createLogger('NoColor');
    logger.info('hello');

    const prefix = (console.log as jest.Mock).mock.calls[0][0] as string;
    expect(prefix).not.toContain('\x1b[');
  });
});

describe('createLogger — multiple instances', () => {
  it('multiple loggers do not interfere with each other', () => {
    const logger1 = createLogger('ServiceA');
    const logger2 = createLogger('ServiceB');

    logger1.info('from A');
    logger2.info('from B');

    const calls = (console.log as jest.Mock).mock.calls;
    expect(calls[0][0]).toContain('[ServiceA]');
    expect(calls[1][0]).toContain('[ServiceB]');
  });
});

describe('createLogger — browser path', () => {
  it('uses browser formatting when globalThis.window is defined', () => {
    // Use jest.isolateModules to get a fresh module import with isBrowser = true
    jest.isolateModules(() => {
      (globalThis as any).window = {};

      const {
        createLogger: createBrowserLogger,
        setLogLevel: setBrowserLevel,
        LogLevel: BrowserLogLevel,
      } = require('./logger');
      setBrowserLevel(BrowserLogLevel.DEBUG);

      const mockLog = jest.spyOn(console, 'log').mockImplementation(() => {});
      const mockError = jest.spyOn(console, 'error').mockImplementation(() => {});
      const mockWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const logger = createBrowserLogger('BrowserCtx');

        logger.info('browser info');
        expect(mockLog).toHaveBeenCalled();
        const infoArgs = mockLog.mock.calls[0];
        expect(infoArgs[0]).toContain('%cINFO%c');
        expect(infoArgs[0]).toContain('[BrowserCtx]');

        logger.error('browser error');
        expect(mockError).toHaveBeenCalled();
        const errorArgs = mockError.mock.calls[0];
        expect(errorArgs[0]).toContain('%cERROR%c');

        logger.warn('browser warn');
        expect(mockWarn).toHaveBeenCalled();
        const warnArgs = mockWarn.mock.calls[0];
        expect(warnArgs[0]).toContain('%cWARN%c');

        logger.debug('browser debug');
        // debug uses console.log in browser
        const debugArgs = mockLog.mock.calls[1];
        expect(debugArgs[0]).toContain('%cDEBUG%c');

        // log() is alias for info() in browser too
        logger.log('browser log');
        const logArgs = mockLog.mock.calls[2];
        expect(logArgs[0]).toContain('%cINFO%c');
      } finally {
        mockLog.mockRestore();
        mockError.mockRestore();
        mockWarn.mockRestore();
        delete (globalThis as any).window;
      }
    });
  });
});
