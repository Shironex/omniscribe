import { loadLanguage, type LanguageName } from '@uiw/codemirror-extensions-langs';
import type { Extension } from '@codemirror/state';

/**
 * Map a file extension to a `@uiw/codemirror-extensions-langs` language id.
 * The package's language ids are themselves mostly file-extension-like (`ts`,
 * `js`, `kt`, `rb`, …); this allowlist keeps the mapping explicit and avoids
 * pulling in exotic grammars. Anything unknown returns null and the diff
 * renders without syntax highlighting (still fully readable).
 */
const EXT_TO_LANG: Record<string, LanguageName> = {
  ts: 'ts',
  tsx: 'tsx',
  mts: 'mts',
  cts: 'cts',
  js: 'js',
  jsx: 'jsx',
  mjs: 'mjs',
  cjs: 'cjs',
  json: 'json',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  html: 'html',
  htm: 'htm',
  vue: 'vue',
  svelte: 'svelte',
  md: 'md',
  mdx: 'md',
  markdown: 'markdown',
  py: 'py',
  rb: 'rb',
  go: 'go',
  rs: 'rs',
  java: 'java',
  kt: 'kt',
  kts: 'kts',
  c: 'c',
  h: 'h',
  cpp: 'cpp',
  cc: 'cc',
  cxx: 'cxx',
  hpp: 'hpp',
  cs: 'cs',
  php: 'php',
  sh: 'sh',
  bash: 'bash',
  zsh: 'sh',
  ksh: 'ksh',
  ps1: 'ps1',
  yml: 'yml',
  yaml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  svg: 'svg',
  sql: 'sql',
  swift: 'swift',
  dart: 'dart',
  lua: 'lua',
  scala: 'scala',
  groovy: 'groovy',
  diff: 'diff',
  patch: 'patch',
};

/** Resolve a `LanguageName` for a path, or null when unsupported. */
export function getLanguageName(path: string): LanguageName | null {
  const base = path.split('/').pop() ?? path;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  return EXT_TO_LANG[ext] ?? null;
}

/**
 * Resolve a CodeMirror language `Extension` for a path, or null. Swallows any
 * loader error so an unsupported language never breaks the diff view.
 */
export function languageExtensionForFile(path: string): Extension | null {
  const name = getLanguageName(path);
  if (!name) return null;
  try {
    return loadLanguage(name);
  } catch {
    return null;
  }
}
