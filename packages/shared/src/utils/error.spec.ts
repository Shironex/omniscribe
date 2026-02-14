import { extractErrorMessage } from './error';

describe('extractErrorMessage', () => {
  describe('with Error instances', () => {
    it('returns the message from a standard Error', () => {
      expect(extractErrorMessage(new Error('something broke'))).toBe('something broke');
    });

    it('returns the message from Error subclasses', () => {
      expect(extractErrorMessage(new TypeError('bad type'))).toBe('bad type');
      expect(extractErrorMessage(new RangeError('out of range'))).toBe('out of range');
    });

    it('returns empty string for Error with empty message', () => {
      expect(extractErrorMessage(new Error(''))).toBe('');
    });

    it('returns Error message even when fallback is provided', () => {
      expect(extractErrorMessage(new Error('real message'), 'fallback')).toBe('real message');
    });
  });

  describe('with non-Error values and no fallback', () => {
    it('stringifies a string value', () => {
      expect(extractErrorMessage('string error')).toBe('string error');
    });

    it('stringifies a number', () => {
      expect(extractErrorMessage(42)).toBe('42');
    });

    it('stringifies null', () => {
      expect(extractErrorMessage(null)).toBe('null');
    });

    it('stringifies undefined', () => {
      expect(extractErrorMessage(undefined)).toBe('undefined');
    });

    it('stringifies a boolean', () => {
      expect(extractErrorMessage(false)).toBe('false');
    });

    it('stringifies a plain object', () => {
      expect(extractErrorMessage({ code: 'ENOENT' })).toBe('[object Object]');
    });
  });

  describe('with non-Error values and a fallback', () => {
    it('returns fallback for null', () => {
      expect(extractErrorMessage(null, 'something went wrong')).toBe('something went wrong');
    });

    it('returns fallback for undefined', () => {
      expect(extractErrorMessage(undefined, 'unknown error')).toBe('unknown error');
    });

    it('returns fallback for a number', () => {
      expect(extractErrorMessage(0, 'fallback')).toBe('fallback');
    });

    it('returns fallback for a string', () => {
      expect(extractErrorMessage('raw error', 'fallback')).toBe('fallback');
    });
  });
});
