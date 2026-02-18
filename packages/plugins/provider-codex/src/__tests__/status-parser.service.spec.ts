import { CodexStatusParserService } from '../services/status-parser.service';

describe('CodexStatusParserService', () => {
  let parser: CodexStatusParserService;

  beforeEach(() => {
    parser = new CodexStatusParserService();
  });

  // ================================================================
  // Error detection (highest priority)
  // ================================================================
  describe('error detection', () => {
    it('should return error for "Error: Not authenticated"', () => {
      expect(parser.parse('Error: Not authenticated')).toBe('error');
    });

    it('should return error for "rate limit" messages', () => {
      expect(parser.parse('Rate limit exceeded, please wait')).toBe('error');
    });

    it('should return error for "API error"', () => {
      expect(parser.parse('API error: 500 Internal Server Error')).toBe('error');
    });

    it('should return error for "fatal error"', () => {
      expect(parser.parse('A fatal error occurred')).toBe('error');
    });

    it('should return error for "Error: Invalid API key"', () => {
      expect(parser.parse('Error: Invalid API key provided')).toBe('error');
    });

    it('should return error for "insufficient_quota"', () => {
      expect(parser.parse('insufficient_quota: You exceeded your current quota')).toBe('error');
    });

    it('should return error case-insensitively', () => {
      expect(parser.parse('FATAL ERROR occurred')).toBe('error');
    });
  });

  // ================================================================
  // Finished detection (exit/goodbye)
  // ================================================================
  describe('finished detection', () => {
    it('should return finished for "session ended"', () => {
      expect(parser.parse('Session ended successfully')).toBe('finished');
    });

    it('should return finished for "exiting"', () => {
      expect(parser.parse('Exiting Codex...')).toBe('finished');
    });

    it('should return finished for "goodbye"', () => {
      expect(parser.parse('Goodbye!')).toBe('finished');
    });

    it('should return finished case-insensitively', () => {
      expect(parser.parse('GOODBYE')).toBe('finished');
    });
  });

  // ================================================================
  // Needs input detection (approval prompts)
  // ================================================================
  describe('needs_input detection', () => {
    it('should return needs_input for "[y/n]" prompts', () => {
      expect(parser.parse('Apply these changes? [y/n]')).toBe('needs_input');
    });

    it('should return needs_input for "approve?" prompts', () => {
      expect(parser.parse('Do you approve?')).toBe('needs_input');
    });

    it('should return needs_input for "allow this" prompts', () => {
      expect(parser.parse('Allow this operation?')).toBe('needs_input');
    });

    it('should return needs_input for permission allow/deny prompts', () => {
      expect(parser.parse('Permission required: allow or deny?')).toBe('needs_input');
    });

    it('should return needs_input case-insensitively', () => {
      expect(parser.parse('APPROVE?')).toBe('needs_input');
    });
  });

  // ================================================================
  // Working detection
  // ================================================================
  describe('working detection', () => {
    it('should return working for "thinking" indicator', () => {
      expect(parser.parse('Thinking about this...')).toBe('working');
    });

    it('should return working for "reasoning" indicator', () => {
      expect(parser.parse('Reasoning through the problem...')).toBe('working');
    });

    it('should return working for "executing" indicator', () => {
      expect(parser.parse('Executing command...')).toBe('working');
    });

    it('should return working for "running" indicator', () => {
      expect(parser.parse('Running tests...')).toBe('working');
    });

    it('should return working case-insensitively', () => {
      expect(parser.parse('THINKING')).toBe('working');
    });
  });

  // ================================================================
  // Idle detection (lowest priority)
  // ================================================================
  describe('idle detection', () => {
    it('should return idle for "> " prompt at end', () => {
      expect(parser.parse('> ')).toBe('idle');
    });

    it('should return idle for trailing ">" prompt', () => {
      expect(parser.parse('some output\n> ')).toBe('idle');
    });
  });

  // ================================================================
  // Null return (no status change)
  // ================================================================
  describe('null return (general output)', () => {
    it('should return null for general output', () => {
      expect(parser.parse('function hello() { return "world"; }')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parser.parse('')).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
      expect(parser.parse('   \n  ')).toBeNull();
    });

    it('should return null for normal conversation text', () => {
      expect(parser.parse("I'll help you refactor this code.")).toBeNull();
    });

    it('should return null for code output', () => {
      expect(parser.parse('const x = 42;')).toBeNull();
    });
  });

  // ================================================================
  // ANSI code handling
  // ================================================================
  describe('ANSI code handling', () => {
    it('should handle output with ANSI codes for error detection', () => {
      expect(parser.parse('\x1B[31mError: Not authenticated\x1B[0m')).toBe('error');
    });

    it('should handle output with ANSI codes for finished detection', () => {
      expect(parser.parse('\x1B[1mGoodbye!\x1B[0m')).toBe('finished');
    });

    it('should handle output with ANSI codes for working detection', () => {
      expect(parser.parse('\x1B[33mThinking...\x1B[0m')).toBe('working');
    });
  });

  // ================================================================
  // Priority ordering
  // ================================================================
  describe('priority ordering', () => {
    it('should prioritize error over finished patterns', () => {
      expect(parser.parse('Error: Not authenticated. Goodbye!')).toBe('error');
    });

    it('should prioritize error over idle patterns', () => {
      expect(parser.parse('Fatal error\n> ')).toBe('error');
    });

    it('should prioritize error over needs_input', () => {
      expect(parser.parse('API error: approve? [y/n]')).toBe('error');
    });

    it('should prioritize finished over needs_input', () => {
      expect(parser.parse('Session ended. Approve? [y/n]')).toBe('finished');
    });

    it('should prioritize needs_input over working', () => {
      expect(parser.parse('Running... approve?')).toBe('needs_input');
    });

    it('should prioritize working over idle', () => {
      expect(parser.parse('Thinking... > ')).toBe('working');
    });
  });
});
