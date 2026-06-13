import {
  File,
  FileText,
  FileCode,
  FileJson,
  FileImage,
  FileCog,
  FileType,
  FileKey,
  FileArchive,
  FileSpreadsheet,
  Braces,
  Database,
  Lock,
  Package,
  Settings,
  Terminal,
  Palette,
  BookText,
  Scale,
  Container,
  Boxes,
  Binary,
  Film,
  Music,
  type LucideIcon,
} from 'lucide-react';
import type { FsEntryKind } from '@omniscribe/shared';

/**
 * Lightweight extension → (icon, color) map for the file explorer. Kept
 * dependency-free (no Material/Seti icon packs); each entry pairs a lucide
 * glyph with one of a small set of tokenized color families so the tree reads
 * like a real editor instead of a wall of identical gray icons. Directories and
 * symlinks are colored by the tree row itself; this maps regular files.
 */

/** Color family → tokenized Tailwind text class (see `--icon-*` in globals.css). */
type IconColor =
  | 'code'
  | 'data'
  | 'style'
  | 'markup'
  | 'doc'
  | 'media'
  | 'shell'
  | 'db'
  | 'neutral';

const COLOR_CLASS: Record<IconColor, string> = {
  code: 'text-icon-code',
  data: 'text-icon-data',
  style: 'text-icon-style',
  markup: 'text-icon-markup',
  doc: 'text-icon-doc',
  media: 'text-icon-media',
  shell: 'text-icon-shell',
  db: 'text-icon-db',
  neutral: 'text-muted-foreground',
};

export interface FileIconStyle {
  Icon: LucideIcon;
  /** Tokenized text-color class for the icon. */
  className: string;
}

type Entry = readonly [LucideIcon, IconColor];

const DEFAULT_ENTRY: Entry = [File, 'neutral'];

const EXTENSION_ICON: Record<string, Entry> = {
  // TypeScript / JavaScript (TS blue, JS gold — the iconic split)
  ts: [FileCode, 'code'],
  tsx: [FileCode, 'code'],
  mts: [FileCode, 'code'],
  cts: [FileCode, 'code'],
  js: [FileCode, 'data'],
  jsx: [FileCode, 'data'],
  mjs: [FileCode, 'data'],
  cjs: [FileCode, 'data'],
  // Web frameworks / markup
  vue: [FileCode, 'markup'],
  svelte: [FileCode, 'markup'],
  astro: [FileCode, 'markup'],
  html: [FileCode, 'markup'],
  htm: [FileCode, 'markup'],
  xml: [FileCode, 'markup'],
  // Data / config
  json: [FileJson, 'data'],
  json5: [FileJson, 'data'],
  jsonc: [FileJson, 'data'],
  yaml: [Settings, 'data'],
  yml: [Settings, 'data'],
  toml: [Settings, 'data'],
  ini: [Settings, 'neutral'],
  conf: [Settings, 'neutral'],
  env: [FileKey, 'data'],
  // Markdown / docs
  md: [BookText, 'doc'],
  mdx: [BookText, 'doc'],
  markdown: [BookText, 'doc'],
  rst: [FileText, 'doc'],
  txt: [FileText, 'neutral'],
  pdf: [FileText, 'media'],
  // Styles
  css: [Palette, 'style'],
  scss: [Palette, 'style'],
  sass: [Palette, 'style'],
  less: [Palette, 'style'],
  pcss: [Palette, 'style'],
  styl: [Palette, 'style'],
  // Images
  png: [FileImage, 'media'],
  jpg: [FileImage, 'media'],
  jpeg: [FileImage, 'media'],
  gif: [FileImage, 'media'],
  svg: [FileImage, 'media'],
  webp: [FileImage, 'media'],
  ico: [FileImage, 'media'],
  avif: [FileImage, 'media'],
  bmp: [FileImage, 'media'],
  // Video / audio / fonts
  mp4: [Film, 'media'],
  mov: [Film, 'media'],
  webm: [Film, 'media'],
  mkv: [Film, 'media'],
  mp3: [Music, 'media'],
  wav: [Music, 'media'],
  flac: [Music, 'media'],
  ogg: [Music, 'media'],
  woff: [FileType, 'media'],
  woff2: [FileType, 'media'],
  ttf: [FileType, 'media'],
  otf: [FileType, 'media'],
  // Shell / scripts
  sh: [Terminal, 'shell'],
  bash: [Terminal, 'shell'],
  zsh: [Terminal, 'shell'],
  fish: [Terminal, 'shell'],
  ps1: [Terminal, 'shell'],
  bat: [Terminal, 'shell'],
  cmd: [Terminal, 'shell'],
  // Languages
  py: [FileCode, 'code'],
  rb: [FileCode, 'code'],
  go: [FileCode, 'code'],
  rs: [FileCode, 'code'],
  java: [FileCode, 'code'],
  kt: [FileCode, 'code'],
  c: [FileCode, 'code'],
  h: [FileCode, 'code'],
  cpp: [FileCode, 'code'],
  cc: [FileCode, 'code'],
  hpp: [FileCode, 'code'],
  cs: [FileCode, 'code'],
  php: [FileCode, 'code'],
  swift: [FileCode, 'code'],
  dart: [FileCode, 'code'],
  lua: [FileCode, 'code'],
  r: [FileCode, 'code'],
  scala: [FileCode, 'code'],
  clj: [FileCode, 'code'],
  ex: [FileCode, 'code'],
  exs: [FileCode, 'code'],
  elm: [FileCode, 'code'],
  hs: [FileCode, 'code'],
  pl: [FileCode, 'code'],
  sol: [FileCode, 'code'],
  proto: [FileCode, 'code'],
  graphql: [FileCode, 'markup'],
  gql: [FileCode, 'markup'],
  // Data / database
  sql: [Database, 'db'],
  db: [Database, 'db'],
  sqlite: [Database, 'db'],
  sqlite3: [Database, 'db'],
  prisma: [Database, 'db'],
  csv: [FileSpreadsheet, 'db'],
  tsv: [FileSpreadsheet, 'db'],
  xlsx: [FileSpreadsheet, 'db'],
  xls: [FileSpreadsheet, 'db'],
  // Archives / binary
  zip: [FileArchive, 'neutral'],
  tar: [FileArchive, 'neutral'],
  gz: [FileArchive, 'neutral'],
  tgz: [FileArchive, 'neutral'],
  rar: [FileArchive, 'neutral'],
  '7z': [FileArchive, 'neutral'],
  wasm: [Binary, 'neutral'],
  bin: [Binary, 'neutral'],
  exe: [Binary, 'neutral'],
  // Misc
  lock: [Lock, 'neutral'],
};

/** Exact (lowercased) filenames that get a specific icon, checked before ext. */
const FILENAME_ICON: Record<string, Entry> = {
  // Manifests / lockfiles
  'package.json': [Package, 'data'],
  'package-lock.json': [Lock, 'neutral'],
  'pnpm-lock.yaml': [Lock, 'neutral'],
  'yarn.lock': [Lock, 'neutral'],
  'bun.lockb': [Lock, 'neutral'],
  'pnpm-workspace.yaml': [Boxes, 'data'],
  // TS / build config
  'tsconfig.json': [FileCog, 'data'],
  'jsconfig.json': [FileCog, 'data'],
  'turbo.json': [FileCog, 'data'],
  'vite.config.ts': [FileCog, 'data'],
  'vitest.config.ts': [FileCog, 'data'],
  'tailwind.config.ts': [Palette, 'style'],
  'tailwind.config.js': [Palette, 'style'],
  // Linters / formatters
  'eslint.config.mjs': [Braces, 'data'],
  'eslint.config.js': [Braces, 'data'],
  '.eslintrc': [Braces, 'data'],
  '.eslintrc.json': [Braces, 'data'],
  '.prettierrc': [Braces, 'data'],
  'commitlint.config.cjs': [Braces, 'data'],
  '.editorconfig': [FileCog, 'neutral'],
  // Ignore / rc files
  '.gitignore': [FileType, 'neutral'],
  '.gitattributes': [FileType, 'neutral'],
  '.gitmodules': [FileType, 'neutral'],
  '.dockerignore': [FileCog, 'neutral'],
  '.npmignore': [FileCog, 'neutral'],
  '.prettierignore': [FileCog, 'neutral'],
  '.eslintignore': [FileCog, 'neutral'],
  '.npmrc': [FileCog, 'neutral'],
  '.nvmrc': [FileCog, 'neutral'],
  // Docker / make
  dockerfile: [Container, 'code'],
  'docker-compose.yml': [Container, 'data'],
  'docker-compose.yaml': [Container, 'data'],
  makefile: [Settings, 'neutral'],
  // Project meta
  license: [Scale, 'doc'],
  'license.md': [Scale, 'doc'],
  'license.txt': [Scale, 'doc'],
  'readme.md': [BookText, 'doc'],
  readme: [BookText, 'doc'],
};

/** Resolve the (icon, color) entry for a file by name. */
function resolveEntry(name: string): Entry {
  const lower = name.toLowerCase();

  const byName = FILENAME_ICON[lower];
  if (byName) return byName;

  // Dotenv family (.env, .env.local, .env.example, .env.production…).
  if (lower === '.env' || lower.startsWith('.env.')) return [FileKey, 'data'];

  const dot = lower.lastIndexOf('.');
  if (dot > 0) {
    const ext = lower.slice(dot + 1);
    const byExt = EXTENSION_ICON[ext];
    if (byExt) return byExt;
  }
  return DEFAULT_ENTRY;
}

/** Icon component + tokenized color class for a file entry by name. */
export function getFileIconStyle(name: string): FileIconStyle {
  const [Icon, color] = resolveEntry(name);
  return { Icon, className: COLOR_CLASS[color] };
}

/** Return just the lucide icon component for a file entry by name. */
export function getFileIcon(name: string): LucideIcon {
  return resolveEntry(name)[0];
}

/** Return the icon for an entry kind (file delegates to extension lookup). */
export function getEntryIcon(name: string, kind: FsEntryKind): LucideIcon {
  if (kind === 'file') return getFileIcon(name);
  // dir / symlink handled by the row; default fallback.
  return File;
}
