import * as fs from 'fs';
import * as path from 'path';
import { MAX_PATH_LENGTH } from '@omniscribe/shared';

/**
 * Path-authorization boundary for the FS module.
 *
 * Every filesystem operation is scoped to a single authorized `projectPath`
 * (the "workspace root" — mirrors terax's WorkspaceRegistry concept). A target
 * supplied by the renderer may be absolute or relative to the root, but the
 * *resolved* path must live inside the root. We canonicalize via `fs.realpath`
 * of the nearest existing ancestor so that `..` segments and symlink escapes
 * (a symlink inside the project that points outside it) are both defeated.
 *
 * On any violation we throw {@link FsPathError}; callers translate it into a
 * typed error response.
 */
export class FsPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FsPathError';
  }
}

/** Directories whose contents must never be mutated through the FS module. */
const PROTECTED_MUTATION_SEGMENTS = [
  // Rewriting loose/packed objects can corrupt the repository.
  path.join('.git', 'objects'),
];

/**
 * Resolve `target` (absolute or relative to `root`) to an absolute path and
 * assert it stays within `root`. Returns the canonicalized absolute path.
 *
 * The returned path is canonical up to the nearest existing ancestor — the
 * final (possibly not-yet-created) segments are appended verbatim, which is
 * exactly what create/rename need.
 */
export function resolveWithinRoot(root: string, target?: string): string {
  if (typeof root !== 'string' || root.length === 0) {
    throw new FsPathError('Invalid projectPath: must be a non-empty string');
  }
  if (root.length > MAX_PATH_LENGTH) {
    throw new FsPathError(`projectPath exceeds maximum length of ${MAX_PATH_LENGTH} characters`);
  }
  if (target !== undefined && typeof target !== 'string') {
    throw new FsPathError('Invalid target: must be a string');
  }
  if (target && target.length > MAX_PATH_LENGTH) {
    throw new FsPathError(`target exceeds maximum length of ${MAX_PATH_LENGTH} characters`);
  }
  if (root.includes('\0') || (target && target.includes('\0'))) {
    throw new FsPathError('Path contains a null byte');
  }

  // Canonicalize the root itself (it must exist and be a directory).
  const canonicalRoot = realpathNearest(path.resolve(root));

  // An absent / empty target means "the root".
  const requested =
    target && target.length > 0
      ? path.isAbsolute(target)
        ? target
        : path.join(canonicalRoot, target)
      : canonicalRoot;

  const resolved = realpathNearest(path.resolve(requested));

  if (!isInside(canonicalRoot, resolved)) {
    throw new FsPathError('Path escapes the project root');
  }

  return resolved;
}

/**
 * Like {@link resolveWithinRoot} but additionally rejects mutations targeting
 * protected internal directories (e.g. `.git/objects`).
 */
export function resolveMutableWithinRoot(root: string, target?: string): string {
  const resolved = resolveWithinRoot(root, target);
  const canonicalRoot = realpathNearest(path.resolve(root));
  const rel = path.relative(canonicalRoot, resolved);
  for (const segment of PROTECTED_MUTATION_SEGMENTS) {
    if (rel === segment || rel.startsWith(segment + path.sep)) {
      throw new FsPathError(`Refusing to mutate protected path: ${segment}`);
    }
  }
  return resolved;
}

/**
 * Return the real (symlink-resolved) path. If the full path does not exist,
 * walk up to the nearest existing ancestor, realpath that, and re-append the
 * trailing non-existent segments. This lets us safely authorize paths for
 * create/rename where the leaf does not exist yet, while still resolving any
 * symlinks along the existing prefix.
 */
export function realpathNearest(absolutePath: string): string {
  let current = absolutePath;
  const trailing: string[] = [];

  // Walk up until we find an existing path (or hit the filesystem root).
  for (;;) {
    try {
      const real = fs.realpathSync.native(current);
      if (trailing.length === 0) return real;
      return path.join(real, ...trailing.reverse());
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // EACCES / ELOOP / ENOTDIR etc. — surface as a path error.
        throw new FsPathError(
          `Cannot resolve path: ${(err as NodeJS.ErrnoException).code ?? 'unknown error'}`
        );
      }
      const parent = path.dirname(current);
      if (parent === current) {
        // Reached the filesystem root without finding an existing ancestor.
        return path.join(parent, ...trailing.reverse());
      }
      trailing.push(path.basename(current));
      current = parent;
    }
  }
}

/** True when `child` is `parent` itself or nested beneath it. */
function isInside(parent: string, child: string): boolean {
  if (child === parent) return true;
  const rel = path.relative(parent, child);
  return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
}
