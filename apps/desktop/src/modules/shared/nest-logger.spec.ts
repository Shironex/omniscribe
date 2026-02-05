import { createLogger } from '@omniscribe/shared';
import { NestLoggerAdapter } from './nest-logger';

// Mock createLogger from @omniscribe/shared
jest.mock('@omniscribe/shared', () => {
  const actual = jest.requireActual('@omniscribe/shared');
  return {
    ...actual,
    createLogger: jest.fn(),
  };
});

const mockedCreateLogger = createLogger as jest.MockedFunction<typeof createLogger>;

function makeMockLogger() {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  };
}

describe('NestLoggerAdapter', () => {
  let adapter: NestLoggerAdapter;
  let defaultLogger: ReturnType<typeof makeMockLogger>;

  beforeEach(() => {
    mockedCreateLogger.mockReset();

    // Each call to createLogger returns a fresh mock logger.
    // We capture the first one (for default 'Nest' context) for easy assertions.
    defaultLogger = makeMockLogger();
    mockedCreateLogger.mockReturnValue(defaultLogger);

    adapter = new NestLoggerAdapter();
  });

  describe('log()', () => {
    it('should delegate to logger.info with extracted context', () => {
      const contextLogger = makeMockLogger();
      mockedCreateLogger.mockReturnValue(contextLogger);

      adapter.log('hello world', 'MyContext');

      expect(mockedCreateLogger).toHaveBeenCalledWith('MyContext');
      expect(contextLogger.info).toHaveBeenCalledWith('hello world');
    });

    it('should use default "Nest" context when no context string is provided', () => {
      adapter.log('no context message');

      expect(mockedCreateLogger).toHaveBeenCalledWith('Nest');
      expect(defaultLogger.info).toHaveBeenCalledWith('no context message');
    });

    it('should pass extra params before the context', () => {
      const contextLogger = makeMockLogger();
      mockedCreateLogger.mockReturnValue(contextLogger);

      adapter.log('msg', { extra: true }, 'SomeContext');

      expect(mockedCreateLogger).toHaveBeenCalledWith('SomeContext');
      expect(contextLogger.info).toHaveBeenCalledWith('msg', { extra: true });
    });
  });

  describe('error()', () => {
    it('should delegate to logger.error', () => {
      const contextLogger = makeMockLogger();
      mockedCreateLogger.mockReturnValue(contextLogger);

      adapter.error('bad thing happened', 'ErrorContext');

      expect(mockedCreateLogger).toHaveBeenCalledWith('ErrorContext');
      expect(contextLogger.error).toHaveBeenCalledWith('bad thing happened');
    });

    it('should pass stack trace and context correctly', () => {
      const contextLogger = makeMockLogger();
      mockedCreateLogger.mockReturnValue(contextLogger);

      adapter.error('error msg', 'stack trace here', 'AppContext');

      expect(contextLogger.error).toHaveBeenCalledWith('error msg', 'stack trace here');
    });
  });

  describe('warn()', () => {
    it('should delegate to logger.warn', () => {
      const contextLogger = makeMockLogger();
      mockedCreateLogger.mockReturnValue(contextLogger);

      adapter.warn('warning message', 'WarnContext');

      expect(mockedCreateLogger).toHaveBeenCalledWith('WarnContext');
      expect(contextLogger.warn).toHaveBeenCalledWith('warning message');
    });
  });

  describe('debug()', () => {
    it('should delegate to logger.debug', () => {
      const contextLogger = makeMockLogger();
      mockedCreateLogger.mockReturnValue(contextLogger);

      adapter.debug('debug info', 'DebugContext');

      expect(mockedCreateLogger).toHaveBeenCalledWith('DebugContext');
      expect(contextLogger.debug).toHaveBeenCalledWith('debug info');
    });
  });

  describe('verbose()', () => {
    it('should map to logger.debug', () => {
      const contextLogger = makeMockLogger();
      mockedCreateLogger.mockReturnValue(contextLogger);

      adapter.verbose('verbose detail', 'VerboseContext');

      expect(mockedCreateLogger).toHaveBeenCalledWith('VerboseContext');
      expect(contextLogger.debug).toHaveBeenCalledWith('verbose detail');
    });
  });

  describe('fatal()', () => {
    it('should map to logger.error', () => {
      const contextLogger = makeMockLogger();
      mockedCreateLogger.mockReturnValue(contextLogger);

      adapter.fatal('fatal crash', 'FatalContext');

      expect(mockedCreateLogger).toHaveBeenCalledWith('FatalContext');
      expect(contextLogger.error).toHaveBeenCalledWith('fatal crash');
    });
  });

  describe('context extraction', () => {
    it('should treat the last string argument as the context', () => {
      const ctxLogger = makeMockLogger();
      mockedCreateLogger.mockReturnValue(ctxLogger);

      adapter.log('message', 42, { key: 'val' }, 'ExtractedContext');

      expect(mockedCreateLogger).toHaveBeenCalledWith('ExtractedContext');
      expect(ctxLogger.info).toHaveBeenCalledWith('message', 42, { key: 'val' });
    });

    it('should not extract context when the last arg is not a string', () => {
      adapter.log('message', 123);

      // No string as last param, so context defaults to 'Nest'
      expect(mockedCreateLogger).toHaveBeenCalledWith('Nest');
      expect(defaultLogger.info).toHaveBeenCalledWith('message', 123);
    });

    it('should handle no optional params', () => {
      adapter.error('standalone error');

      expect(mockedCreateLogger).toHaveBeenCalledWith('Nest');
      expect(defaultLogger.error).toHaveBeenCalledWith('standalone error');
    });
  });

  describe('logger caching', () => {
    it('should reuse the same logger instance for the same context', () => {
      const cachedLogger = makeMockLogger();
      mockedCreateLogger.mockReturnValue(cachedLogger);

      adapter.log('first call', 'CachedCtx');

      // Reset the mock to return a different logger
      const differentLogger = makeMockLogger();
      mockedCreateLogger.mockReturnValue(differentLogger);

      adapter.log('second call', 'CachedCtx');

      // createLogger should have been called only once for 'CachedCtx'
      const cachedCtxCalls = mockedCreateLogger.mock.calls.filter(call => call[0] === 'CachedCtx');
      expect(cachedCtxCalls).toHaveLength(1);

      // Both calls should have used the same (first) logger
      expect(cachedLogger.info).toHaveBeenCalledTimes(2);
      expect(differentLogger.info).not.toHaveBeenCalled();
    });

    it('should create separate loggers for different contexts', () => {
      const loggerA = makeMockLogger();
      const loggerB = makeMockLogger();

      mockedCreateLogger.mockReturnValueOnce(loggerA).mockReturnValueOnce(loggerB);

      adapter.log('msg a', 'ContextA');
      adapter.log('msg b', 'ContextB');

      expect(mockedCreateLogger).toHaveBeenCalledWith('ContextA');
      expect(mockedCreateLogger).toHaveBeenCalledWith('ContextB');
      expect(loggerA.info).toHaveBeenCalledWith('msg a');
      expect(loggerB.info).toHaveBeenCalledWith('msg b');
    });
  });
});
