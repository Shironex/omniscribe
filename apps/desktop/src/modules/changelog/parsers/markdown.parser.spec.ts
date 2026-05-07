import { parseChangelogMarkdown } from './markdown.parser';

describe('parseChangelogMarkdown', () => {
  it('parses upstream shape and discards the H1 preamble', () => {
    const md = `# Changelog\n\n## 2.1.132\n\n- Added foo\n- Fixed bar\n\n## 2.1.131\n\n- baz\n`;
    const entries = parseChangelogMarkdown(md);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      version: '2.1.132',
      bodyMarkdown: '- Added foo\n- Fixed bar',
    });
    expect(entries[1]).toEqual({ version: '2.1.131', bodyMarkdown: '- baz' });
  });

  it('preserves upstream order (newest-first, no sort)', () => {
    const md = `## 9.9.9\n\n- newest\n\n## 1.0.0\n\n- oldest\n`;
    const entries = parseChangelogMarkdown(md);
    expect(entries.map(e => e.version)).toEqual(['9.9.9', '1.0.0']);
  });

  it('handles BOM and CRLF line endings', () => {
    const md = `\uFEFF# Changelog\r\n\r\n## 1.2.3\r\n\r\n- one\r\n- two\r\n`;
    const entries = parseChangelogMarkdown(md);
    expect(entries).toHaveLength(1);
    expect(entries[0].version).toBe('1.2.3');
    expect(entries[0].bodyMarkdown).toBe('- one\n- two');
  });

  it('trims trailing whitespace and blank lines from bodies', () => {
    const md = `## 1.0.0\n\n- a\n\n\n\n## 0.9.0\n\n- b\n\n\n`;
    const entries = parseChangelogMarkdown(md);
    expect(entries[0].bodyMarkdown).toBe('- a');
    expect(entries[1].bodyMarkdown).toBe('- b');
  });

  it('keeps non-semver release labels verbatim', () => {
    const md = `## v2 — Project Phoenix\n\n- ship it\n`;
    const entries = parseChangelogMarkdown(md);
    expect(entries).toHaveLength(1);
    expect(entries[0].version).toBe('v2 — Project Phoenix');
  });

  it('returns an empty array on input with no `## ` headers', () => {
    expect(parseChangelogMarkdown('# Changelog\n\nNothing here.')).toEqual([]);
  });
});
