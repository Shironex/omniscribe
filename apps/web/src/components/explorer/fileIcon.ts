import {
  File,
  FileText,
  FileCode,
  FileJson,
  FileImage,
  FileCog,
  FileType,
  Braces,
  Hash,
  Database,
  Lock,
  Package,
  Settings,
  Terminal,
  Palette,
  BookText,
  type LucideIcon,
} from 'lucide-react';
import type { FsEntryKind } from '@omniscribe/shared';

/**
 * Lightweight extension → lucide icon map for the file explorer. Kept small and
 * dependency-free (no Material/Catppuccin icon packs). Directories and symlinks
 * are handled by the tree row itself; this maps regular files.
 */
const EXTENSION_ICON: Record<string, LucideIcon> = {
  // Web / JS / TS
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  mjs: FileCode,
  cjs: FileCode,
  vue: FileCode,
  svelte: FileCode,
  // Data / config
  json: FileJson,
  json5: FileJson,
  jsonc: FileJson,
  yaml: Settings,
  yml: Settings,
  toml: Settings,
  ini: Settings,
  env: FileCog,
  // Markup / docs
  md: BookText,
  mdx: BookText,
  txt: FileText,
  rst: FileText,
  // Styles
  css: Palette,
  scss: Palette,
  sass: Palette,
  less: Palette,
  // HTML / XML
  html: FileCode,
  htm: FileCode,
  xml: FileCode,
  // Images
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  svg: FileImage,
  webp: FileImage,
  ico: FileImage,
  avif: FileImage,
  // Shell / scripts
  sh: Terminal,
  bash: Terminal,
  zsh: Terminal,
  fish: Terminal,
  ps1: Terminal,
  // Languages
  py: FileCode,
  rb: FileCode,
  go: FileCode,
  rs: FileCode,
  java: FileCode,
  kt: FileCode,
  c: FileCode,
  h: FileCode,
  cpp: FileCode,
  hpp: FileCode,
  cs: FileCode,
  php: FileCode,
  swift: FileCode,
  // Misc
  sql: Database,
  lock: Lock,
  csv: Hash,
  tsv: Hash,
};

/** Bare filenames (no extension matching) that get a specific icon. */
const FILENAME_ICON: Record<string, LucideIcon> = {
  'package.json': Package,
  'package-lock.json': Lock,
  'pnpm-lock.yaml': Lock,
  'yarn.lock': Lock,
  'tsconfig.json': FileCog,
  '.gitignore': FileType,
  '.npmrc': FileCog,
  dockerfile: FileCog,
  'docker-compose.yml': FileCog,
  makefile: Settings,
  '.editorconfig': FileCog,
  '.prettierrc': Braces,
  '.eslintrc': Braces,
};

/** Return the lucide icon component for a file entry by name. */
export function getFileIcon(name: string): LucideIcon {
  const lower = name.toLowerCase();
  const byName = FILENAME_ICON[lower];
  if (byName) return byName;

  const dot = lower.lastIndexOf('.');
  if (dot > 0) {
    const ext = lower.slice(dot + 1);
    const byExt = EXTENSION_ICON[ext];
    if (byExt) return byExt;
  }
  return File;
}

/** Return the icon for an entry kind (file delegates to extension lookup). */
export function getEntryIcon(name: string, kind: FsEntryKind): LucideIcon {
  if (kind === 'file') return getFileIcon(name);
  // dir / symlink handled by the row; default fallback.
  return File;
}
