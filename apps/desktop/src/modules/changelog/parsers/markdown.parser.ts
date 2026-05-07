import type { ChangelogEntry } from '@omniscribe/shared';

/**
 * Parse a CHANGELOG.md-shaped document into versioned entries.
 *
 * Upstream shape:
 *   # Changelog
 *
 *   ## 2.1.132
 *
 *   - bullet
 *   - bullet
 *
 *   ## 2.1.131
 *   ...
 *
 * The `# Changelog` preamble is discarded. Order is preserved (newest-first).
 * Header text is kept verbatim — no semver validation — so release codenames
 * still parse cleanly.
 */
export function parseChangelogMarkdown(md: string): ChangelogEntry[] {
  // Strip BOM, normalize line endings.
  const text = md
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const lines = text.split('\n');
  const out: ChangelogEntry[] = [];

  let currentVersion: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentVersion !== null) {
      out.push({ version: currentVersion, bodyMarkdown: buffer.join('\n').trim() });
    }
  };

  const headerRe = /^##\s+(.+)$/;
  for (const line of lines) {
    const m = headerRe.exec(line);
    if (m) {
      flush();
      currentVersion = m[1].trim();
      buffer = [];
    } else if (currentVersion !== null) {
      buffer.push(line);
    }
    // Lines before the first `## ` (e.g. `# Changelog` preamble) are ignored.
  }
  flush();

  return out.filter(entry => entry.version.length > 0);
}
