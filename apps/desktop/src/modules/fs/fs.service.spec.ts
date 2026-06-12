import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Electron mock — delete() trashes via shell.trashItem. Capture calls.
// jest.mock factories are hoisted, so expose the spy through the module object.
// ---------------------------------------------------------------------------
jest.mock('electron', () => ({
  shell: { trashItem: jest.fn().mockResolvedValue(undefined) },
}));

import { FsService } from './fs.service';

function getTrashMock(): jest.Mock {
  const electron = require('electron') as { shell: { trashItem: jest.Mock } };
  return electron.shell.trashItem;
}

describe('FsService', () => {
  let service: FsService;
  let root: string;
  let outside: string;

  beforeEach(async () => {
    service = new FsService();
    // Real tmp dirs. realpath both so macOS /var -> /private/var canonicalization
    // doesn't trip the in-root assertion.
    root = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'fs-root-')));
    outside = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'fs-out-')));
    getTrashMock().mockClear();
  });

  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true });
    await fsp.rm(outside, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Path-traversal guard
  // -------------------------------------------------------------------------
  describe('path-traversal guard', () => {
    it('rejects ".." escaping the project root', async () => {
      await expect(service.stat(root, '../escape.txt')).rejects.toThrow(
        /escapes the project root/i
      );
    });

    it('rejects an absolute target outside the root', async () => {
      const target = path.join(outside, 'secret.txt');
      await fsp.writeFile(target, 'secret');
      await expect(service.readFile(root, target)).rejects.toThrow(/escapes the project root/i);
    });

    it('rejects a symlink that escapes the root (symlink target resolution)', async () => {
      // Create a file outside, and a symlink inside the root pointing at it.
      const secret = path.join(outside, 'secret.txt');
      await fsp.writeFile(secret, 'top secret');
      const link = path.join(root, 'link');
      await fsp.symlink(secret, link);

      await expect(service.readFile(root, 'link')).rejects.toThrow(/escapes the project root/i);
    });

    it('rejects mutations under .git/objects', async () => {
      await fsp.mkdir(path.join(root, '.git', 'objects'), { recursive: true });
      await expect(service.writeFile(root, '.git/objects/ff/abc', 'x')).rejects.toThrow(
        /protected path/i
      );
    });

    it('allows a relative target inside the root', async () => {
      await fsp.writeFile(path.join(root, 'inside.txt'), 'hi');
      const entry = await service.stat(root, 'inside.txt');
      expect(entry.name).toBe('inside.txt');
      expect(entry.kind).toBe('file');
    });
  });

  // -------------------------------------------------------------------------
  // readDir
  // -------------------------------------------------------------------------
  describe('readDir', () => {
    it('sorts directories first then case-insensitive name', async () => {
      await fsp.mkdir(path.join(root, 'zeta'));
      await fsp.mkdir(path.join(root, 'Alpha'));
      await fsp.writeFile(path.join(root, 'b.txt'), '');
      await fsp.writeFile(path.join(root, 'A.txt'), '');

      const { entries } = await service.readDir(root);
      const names = entries.map(e => e.name);
      // dirs (Alpha, zeta) before files (A.txt, b.txt)
      expect(names).toEqual(['Alpha', 'zeta', 'A.txt', 'b.txt']);
      expect(entries[0].kind).toBe('dir');
    });

    it('reports symlinks with kind=symlink', async () => {
      await fsp.writeFile(path.join(root, 'real.txt'), 'x');
      await fsp.symlink(path.join(root, 'real.txt'), path.join(root, 'aalink'));
      const { entries } = await service.readDir(root);
      const link = entries.find(e => e.name === 'aalink');
      expect(link?.kind).toBe('symlink');
    });

    it('defaults to the project root when target is omitted', async () => {
      await fsp.writeFile(path.join(root, 'x.txt'), '');
      const result = await service.readDir(root);
      expect(result.path).toBe(root);
    });
  });

  // -------------------------------------------------------------------------
  // readFile + binary detection
  // -------------------------------------------------------------------------
  describe('readFile', () => {
    it('returns utf8 content for a text file', async () => {
      await fsp.writeFile(path.join(root, 'a.txt'), 'hello world');
      const res = await service.readFile(root, 'a.txt');
      expect(res.content).toBe('hello world');
      expect(res.binary).toBeUndefined();
    });

    it('flags binary files (NUL-byte sniff) and omits content', async () => {
      await fsp.writeFile(path.join(root, 'b.bin'), Buffer.from([0x41, 0x00, 0x42]));
      const res = await service.readFile(root, 'b.bin');
      expect(res.binary).toBe(true);
      expect(res.content).toBeUndefined();
    });

    it('flags files over the size cap as tooLarge without reading', async () => {
      const big = path.join(root, 'big.txt');
      // 2MB + 1 byte
      await fsp.writeFile(big, Buffer.alloc(2 * 1024 * 1024 + 1, 0x41));
      const res = await service.readFile(root, 'big.txt');
      expect(res.tooLarge).toBe(true);
      expect(res.content).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // writeFile (atomic)
  // -------------------------------------------------------------------------
  describe('writeFile', () => {
    it('writes content atomically and leaves no temp files behind', async () => {
      const result = await service.writeFile(root, 'nested/dir/file.txt', 'content');
      expect(result).toBe(path.join(root, 'nested/dir/file.txt'));
      expect(await fsp.readFile(result, 'utf8')).toBe('content');

      // No leftover .tmp siblings.
      const siblings = await fsp.readdir(path.join(root, 'nested/dir'));
      expect(siblings.filter(n => n.endsWith('.tmp'))).toHaveLength(0);
    });

    it('overwrites an existing file', async () => {
      await fsp.writeFile(path.join(root, 'f.txt'), 'old');
      await service.writeFile(root, 'f.txt', 'new');
      expect(await fsp.readFile(path.join(root, 'f.txt'), 'utf8')).toBe('new');
    });
  });

  // -------------------------------------------------------------------------
  // create / rename / delete
  // -------------------------------------------------------------------------
  describe('mutations', () => {
    it('createFile creates an empty file and fails if it exists', async () => {
      const p = await service.createFile(root, 'new.txt');
      expect(fs.existsSync(p)).toBe(true);
      await expect(service.createFile(root, 'new.txt')).rejects.toThrow();
    });

    it('createDir creates a directory recursively', async () => {
      const p = await service.createDir(root, 'a/b/c');
      const stat = await fsp.stat(p);
      expect(stat.isDirectory()).toBe(true);
    });

    it('rename moves a file in-root', async () => {
      await fsp.writeFile(path.join(root, 'src.txt'), 'data');
      const dest = await service.rename(root, 'src.txt', 'dest/moved.txt');
      expect(fs.existsSync(path.join(root, 'src.txt'))).toBe(false);
      expect(await fsp.readFile(dest, 'utf8')).toBe('data');
    });

    it('rename rejects when the destination escapes the root', async () => {
      await fsp.writeFile(path.join(root, 'src.txt'), 'data');
      await expect(service.rename(root, 'src.txt', '../evil.txt')).rejects.toThrow(
        /escapes the project root/i
      );
    });

    it('delete sends the path to the OS trash (shell.trashItem), not rm', async () => {
      const target = path.join(root, 'trash-me.txt');
      await fsp.writeFile(target, 'bye');
      const resolved = await service.delete(root, 'trash-me.txt');

      const trash = getTrashMock();
      expect(trash).toHaveBeenCalledTimes(1);
      expect(trash).toHaveBeenCalledWith(resolved);
      // Service must NOT have hard-deleted it (the OS trash mock is a no-op).
      expect(fs.existsSync(target)).toBe(true);
    });

    it('delete rejects a non-existent target before trashing', async () => {
      await expect(service.delete(root, 'nope.txt')).rejects.toThrow();
      expect(getTrashMock()).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // search (manual walk fallback — tmp dir is not a git repo)
  // -------------------------------------------------------------------------
  describe('search', () => {
    beforeEach(async () => {
      await fsp.mkdir(path.join(root, 'src'), { recursive: true });
      await fsp.writeFile(path.join(root, 'src', 'index.ts'), '');
      await fsp.writeFile(path.join(root, 'src', 'helper.ts'), '');
      await fsp.writeFile(path.join(root, 'README.md'), '');
      // Skipped dir must be excluded from the walk.
      await fsp.mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
      await fsp.writeFile(path.join(root, 'node_modules', 'pkg', 'index.ts'), '');
    });

    it('finds files by fuzzy query and excludes SKIP_DIRS', async () => {
      const { matches } = await service.search(root, 'index');
      const rels = matches.map(m => m.relativePath);
      expect(rels).toContain(path.join('src', 'index.ts'));
      // node_modules entry must not appear.
      expect(rels.some(r => r.includes('node_modules'))).toBe(false);
    });

    it('returns a bounded sample for an empty query', async () => {
      const { matches } = await service.search(root, '');
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // grep (JS scan fallback path)
  // -------------------------------------------------------------------------
  describe('grep', () => {
    it('finds a literal match via the JS scan fallback', async () => {
      // Force the JS scan path by stubbing the CLI availability checks.
      jest
        .spyOn(service as unknown as { hasRipgrep: () => Promise<boolean> }, 'hasRipgrep')
        .mockResolvedValue(false);
      jest
        .spyOn(service as unknown as { isGitRepo: () => Promise<boolean> }, 'isGitRepo')
        .mockResolvedValue(false);

      await fsp.writeFile(path.join(root, 'a.txt'), 'foo\nbar NEEDLE baz\nqux');
      const { matches } = await service.grep(root, 'NEEDLE', { fixedString: true });
      expect(matches).toHaveLength(1);
      expect(matches[0].line).toBe(2);
      expect(matches[0].relativePath).toBe('a.txt');
    });

    it('returns no matches for an empty query', async () => {
      const { matches } = await service.grep(root, '   ');
      expect(matches).toHaveLength(0);
    });
  });
});
