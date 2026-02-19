import { ClaudeStatusParserService } from '../services/status-parser.service';

describe('ClaudeStatusParserService', () => {
  let parser: ClaudeStatusParserService;

  beforeEach(() => {
    parser = new ClaudeStatusParserService();
  });

  // ================================================================
  // Idle detection (REPL prompt)
  // ================================================================
  describe('idle detection', () => {
    it('should return idle for ">" prompt at end of line', () => {
      expect(parser.parse('\n> ')).toBe('idle');
    });

    it('should return idle for ">" prompt with leading whitespace', () => {
      expect(parser.parse('\n  > ')).toBe('idle');
    });

    it('should return idle for standalone ">" prompt', () => {
      expect(parser.parse('> ')).toBe('idle');
    });

    it('should NOT return idle for ">" in the middle of text', () => {
      expect(parser.parse('value > threshold')).toBeNull();
    });
  });

  // ================================================================
  // Finished detection (exit/goodbye)
  // ================================================================
  describe('finished detection', () => {
    it('should return finished for "goodbye"', () => {
      expect(parser.parse('Goodbye!')).toBe('finished');
    });

    it('should return finished for "session ended"', () => {
      expect(parser.parse('Session ended successfully')).toBe('finished');
    });

    it('should return finished for "exiting"', () => {
      expect(parser.parse('Exiting Claude Code...')).toBe('finished');
    });

    it('should return finished for "thanks for using"', () => {
      expect(parser.parse('Thanks for using Claude!')).toBe('finished');
    });

    it('should return finished case-insensitively', () => {
      expect(parser.parse('GOODBYE')).toBe('finished');
    });
  });

  // ================================================================
  // Error detection
  // ================================================================
  describe('error detection', () => {
    it('should return error for "Error: Not authenticated"', () => {
      expect(parser.parse('Error: Not authenticated')).toBe('error');
    });

    it('should return error for "Error: Invalid API key"', () => {
      expect(parser.parse('Error: Invalid API key provided')).toBe('error');
    });

    it('should return error for "fatal error"', () => {
      expect(parser.parse('A fatal error occurred')).toBe('error');
    });

    it('should return error for "rate limit exceeded"', () => {
      expect(parser.parse('Rate limit exceeded, please wait')).toBe('error');
    });

    it('should return error for "API error"', () => {
      expect(parser.parse('API error: 500 Internal Server Error')).toBe('error');
    });

    it('should return error case-insensitively', () => {
      expect(parser.parse('FATAL ERROR occurred')).toBe('error');
    });
  });

  // ================================================================
  // Null return (no status change)
  // ================================================================
  describe('null return (general output)', () => {
    it('should return null for general output', () => {
      expect(parser.parse('Processing your request...')).toBeNull();
    });

    it('should return null for code output', () => {
      expect(parser.parse('function hello() { return "world"; }')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parser.parse('')).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
      expect(parser.parse('   \n  ')).toBeNull();
    });

    it('should return null for normal conversation text', () => {
      expect(parser.parse("I'll help you refactor this code. Let me look at the file.")).toBeNull();
    });
  });

  // ================================================================
  // ANSI code handling
  // ================================================================
  describe('ANSI code handling', () => {
    it('should handle output with ANSI codes for idle detection', () => {
      expect(parser.parse('\x1B[32m\n> \x1B[0m')).toBe('idle');
    });

    it('should handle output with ANSI codes for error detection', () => {
      expect(parser.parse('\x1B[31mError: Not authenticated\x1B[0m')).toBe('error');
    });

    it('should handle output with ANSI codes for finished detection', () => {
      expect(parser.parse('\x1B[1mGoodbye!\x1B[0m')).toBe('finished');
    });

    it('should handle output with OSC sequences', () => {
      expect(parser.parse('\x1B]0;Claude\x07Goodbye!')).toBe('finished');
    });
  });

  // ================================================================
  // Priority: error > finished > idle
  // ================================================================
  describe('priority ordering', () => {
    it('should prioritize error over finished patterns', () => {
      // Contains both an error and a goodbye pattern
      expect(parser.parse('Error: Not authenticated. Goodbye!')).toBe('error');
    });

    it('should prioritize error over idle patterns', () => {
      expect(parser.parse('Fatal error\n> ')).toBe('error');
    });
  });
});
