/**
 * Post-TypeDoc generation script.
 * Scans content/docs/api/ and:
 * 1. Ensures each .mdx file has proper frontmatter (title, description)
 * 2. Generates meta.json files for sidebar ordering
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename, relative } from 'node:path';

const API_DIR = join(import.meta.dirname, '..', 'content', 'docs', 'api');

if (!existsSync(API_DIR)) {
  console.log('No API docs generated yet, skipping fix-api-meta.');
  process.exit(0);
}

function getTitle(content) {
  // Try to extract title from frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const titleMatch = fmMatch[1].match(/^title:\s*(.+)$/m);
    if (titleMatch) return titleMatch[1].replace(/^["']|["']$/g, '');
  }
  // Fall back to first heading
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) return headingMatch[1];
  return null;
}

function sanitizeYamlValue(value) {
  // Remove backslash-escaped angle brackets (e.g. \<P\> -> <P>)
  // then strip angle bracket content entirely for clean YAML
  return value.replace(/\\</g, '<').replace(/\\>/g, '>').replace(/<[^>]*>/g, '');
}

function ensureFrontmatter(filePath) {
  let content = readFileSync(filePath, 'utf-8');
  const hasFrontmatter = content.startsWith('---\n');

  if (!hasFrontmatter) {
    const title = sanitizeYamlValue(getTitle(content) || basename(filePath, '.mdx'));
    content = `---\ntitle: "${title}"\ndescription: "API Reference - ${title}"\n---\n\n${content}`;
  } else {
    // Sanitize existing frontmatter values with escaped angle brackets
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      let fm = fmMatch[1];
      // Fix escaped angle brackets in quoted strings
      fm = fm.replace(/\\</g, '<').replace(/\\>/g, '>');
      // Remove generic type params from quoted values to keep YAML clean
      fm = fm.replace(/"([^"]*)"/g, (match, inner) => `"${inner.replace(/<[^>]*>/g, '')}"`);
      content = `---\n${fm}\n---${content.slice(fmMatch[0].length)}`;

      // Ensure title exists
      if (!fm.includes('title:')) {
        const title = basename(filePath, '.mdx');
        content = content.replace('---\n', `---\ntitle: "${title}"\ndescription: "API Reference - ${title}"\n`);
      }
    }
  }

  writeFileSync(filePath, content, 'utf-8');
}

function processDirectory(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const pages = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      processDirectory(fullPath);
      pages.push(entry.name);
    } else if (entry.name.endsWith('.mdx')) {
      ensureFrontmatter(fullPath);
      const name = basename(entry.name, '.mdx');
      if (name !== 'index') {
        pages.push(name);
      }
    }
  }

  // Generate meta.json
  const metaPath = join(dir, 'meta.json');
  const isRoot = dir === API_DIR;
  const meta = {
    title: isRoot ? 'API Reference' : basename(dir),
    ...(isRoot ? {} : {}),
    pages: ['index', ...pages.filter(p => p !== 'index').sort()],
  };

  // Only include 'index' if index.mdx exists
  if (!existsSync(join(dir, 'index.mdx'))) {
    meta.pages = meta.pages.filter(p => p !== 'index');
  }

  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
}

processDirectory(API_DIR);

const rel = relative(process.cwd(), API_DIR);
console.log(`Fixed API docs frontmatter and generated meta.json files in ${rel}/`);
