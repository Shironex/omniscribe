import type { FsEntry } from '@omniscribe/shared';
import type { DirNode } from '@/stores/useFsStore';

/** A single visible row in the flattened, virtualized tree. */
export interface TreeRow {
  /** Absolute path of the entry. */
  path: string;
  /** Display name. */
  name: string;
  /** Entry kind. */
  kind: FsEntry['kind'];
  /** Nesting depth (root children = 0). */
  depth: number;
  /** True for directories. */
  isDir: boolean;
  /** True when the directory is expanded. */
  expanded: boolean;
  /** True when this directory's children are currently loading. */
  loading: boolean;
}

/**
 * Flatten the loaded + expanded portion of the tree into an ordered list of
 * visible rows for virtualization. Walks depth-first from `rootPath`, descending
 * only into expanded directories whose children have been loaded.
 */
export function flattenTree(
  rootPath: string,
  dirs: Record<string, DirNode>,
  expanded: Record<string, boolean>
): TreeRow[] {
  const rows: TreeRow[] = [];

  const walk = (dirPath: string, depth: number): void => {
    const node = dirs[dirPath];
    const entries = node?.entries ?? [];
    for (const entry of entries) {
      const isDir = entry.kind === 'dir';
      const isExpanded = isDir && Boolean(expanded[entry.path]);
      rows.push({
        path: entry.path,
        name: entry.name,
        kind: entry.kind,
        depth,
        isDir,
        expanded: isExpanded,
        loading: isDir ? Boolean(dirs[entry.path]?.loading) : false,
      });
      if (isExpanded) {
        walk(entry.path, depth + 1);
      }
    }
  };

  walk(rootPath, 0);
  return rows;
}
