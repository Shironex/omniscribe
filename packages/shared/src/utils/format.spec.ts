import { formatFileSize } from './format';

describe('formatFileSize', () => {
  describe('bytes (< 1024)', () => {
    it.each([
      [0, '0 B'],
      [1, '1 B'],
      [512, '512 B'],
      [1023, '1023 B'],
    ])('formats %i as "%s"', (bytes, expected) => {
      expect(formatFileSize(bytes)).toBe(expected);
    });
  });

  describe('kilobytes (1024 <= bytes < 1048576)', () => {
    it.each([
      [1024, '1.0 KB'],
      [1536, '1.5 KB'],
      [10240, '10.0 KB'],
      [102400, '100.0 KB'],
    ])('formats %i as "%s"', (bytes, expected) => {
      expect(formatFileSize(bytes)).toBe(expected);
    });
  });

  describe('megabytes (>= 1048576)', () => {
    it.each([
      [1048576, '1.0 MB'],
      [1572864, '1.5 MB'],
      [10485760, '10.0 MB'],
    ])('formats %i as "%s"', (bytes, expected) => {
      expect(formatFileSize(bytes)).toBe(expected);
    });
  });

  it('displays GB-range values as MB (no GB tier)', () => {
    expect(formatFileSize(1073741824)).toBe('1024.0 MB');
  });
});
