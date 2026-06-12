/**
 * Unit tests for ShellIntegrationService.
 *
 * `fs` and `electron` are mocked at the module level (jest.mock is hoisted) via
 * shared mock fns, mirroring the pattern in src/main/logger.spec.ts. No real
 * filesystem or Electron access; no real shells are ever spawned.
 */
import * as path from 'path';

// --- electron mock ----------------------------------------------------------
const mockGetPath = jest.fn(() => '/userData');
jest.mock('electron', () => ({
  app: { getPath: (...args: unknown[]) => mockGetPath(...args) },
}));

// --- fs mock ----------------------------------------------------------------
const mockMkdirSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
jest.mock('fs', () => ({
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
}));

import { ShellIntegrationService } from './shell-integration.service';

const DIR = path.join('/userData', 'shell-integration');

/** Drive readFileSync to behave as "file missing" (forces a write). */
function fileMissing(): void {
  mockReadFileSync.mockImplementation(() => {
    throw new Error('ENOENT');
  });
}

/** Find the content written to a given path in the writeFileSync calls. */
function writtenContent(filePath: string): string | undefined {
  const call = mockWriteFileSync.mock.calls.find(c => c[0] === filePath);
  return call?.[1] as string | undefined;
}

describe('ShellIntegrationService', () => {
  let service: ShellIntegrationService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPath.mockReturnValue('/userData');
    fileMissing();
    service = new ShellIntegrationService();
  });

  // ==========================================================================
  // Shell detection / decoration
  // ==========================================================================
  describe('decorate — zsh', () => {
    it('points ZDOTDIR at the app-owned dir and keeps command/args', () => {
      const result = service.decorate('/bin/zsh', ['-i'], { HOME: '/home/u' });

      expect(result.command).toBe('/bin/zsh');
      expect(result.args).toEqual(['-i']); // args unchanged for zsh
      expect(result.env.ZDOTDIR).toBe(DIR);
    });

    it('captures an existing ZDOTDIR into OMNISCRIBE_USER_ZDOTDIR', () => {
      const result = service.decorate('/usr/local/bin/zsh', ['-i'], {
        HOME: '/home/u',
        ZDOTDIR: '/home/u/.config/zsh',
      });

      expect(result.env.OMNISCRIBE_USER_ZDOTDIR).toBe('/home/u/.config/zsh');
      expect(result.env.ZDOTDIR).toBe(DIR);
    });

    it('materializes .zshrc and .zshenv with hooks + 777 marker', () => {
      service.decorate('/bin/zsh', ['-i'], {});

      const zshrc = writtenContent(path.join(DIR, '.zshrc'));
      const zshenv = writtenContent(path.join(DIR, '.zshenv'));
      expect(zshrc).toBeDefined();
      expect(zshenv).toBeDefined();

      // OSC 133 prompt/command marks the detector consumes.
      expect(zshrc).toContain('133;A');
      expect(zshrc).toContain('133;B');
      expect(zshrc).toContain('133;C;');
      expect(zshrc).toContain('133;D;');
      // 777 omniscribe self-arm marker, gated on the session id.
      expect(zshrc).toContain('777;notify;omniscribe;working');
      expect(zshrc).toContain('OMNISCRIBE_SESSION_ID');
      // Sources the user's real config first.
      expect(zshrc).toContain('.zshrc');
      // .zshenv restores the user's real ZDOTDIR.
      expect(zshenv).toContain('OMNISCRIBE_USER_ZDOTDIR');
    });
  });

  describe('decorate — bash', () => {
    it('injects --rcfile pointing at the app-owned bashrc, preserving -i', () => {
      const result = service.decorate('/bin/bash', ['-i'], { HOME: '/home/u' });

      expect(result.command).toBe('/bin/bash');
      expect(result.args).toEqual(['-i', '--rcfile', path.join(DIR, 'bashrc')]);
    });

    it('does not set ZDOTDIR for bash', () => {
      const result = service.decorate('/bin/bash', ['-i'], {});
      expect(result.env.ZDOTDIR).toBeUndefined();
    });

    it('materializes bashrc with PROMPT_COMMAND + DEBUG trap hooks', () => {
      service.decorate('/bin/bash', ['-i'], {});

      const bashrc = writtenContent(path.join(DIR, 'bashrc'));
      expect(bashrc).toBeDefined();
      expect(bashrc).toContain('PROMPT_COMMAND');
      expect(bashrc).toContain('trap');
      expect(bashrc).toContain('DEBUG');
      expect(bashrc).toContain('133;A');
      expect(bashrc).toContain('133;C;');
      expect(bashrc).toContain('133;D;');
      expect(bashrc).toContain('777;notify;omniscribe;working');
      expect(bashrc).toContain('OMNISCRIBE_SESSION_ID');
      // Sources the user's real ~/.bashrc first.
      expect(bashrc).toContain('$HOME/.bashrc');
    });

    it('does not double-inject --rcfile if already present', () => {
      const result = service.decorate('/bin/bash', ['--rcfile', '/x', '-i'], {});
      expect(result.args).toEqual(['--rcfile', '/x', '-i']);
    });
  });

  describe('decorate — unsupported shells spawn unchanged', () => {
    it.each([
      ['/bin/sh', ['-l']],
      ['/usr/bin/fish', []],
      ['/usr/bin/pwsh', []],
      ['cmd.exe', []],
      ['/usr/local/bin/claude', ['-p', 'hi']],
      ['/usr/local/bin/codex', ['exec']],
    ])('%s is returned unmodified', (command, args) => {
      const env = { HOME: '/home/u' };
      const result = service.decorate(command, args as string[], env);

      expect(result.command).toBe(command);
      expect(result.args).toEqual(args);
      expect(result.env).toEqual(env);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
      expect(mockMkdirSync).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Idempotency / versioned rewrite
  // ==========================================================================
  describe('materialization idempotency', () => {
    it('writes when the file is missing', () => {
      service.decorate('/bin/zsh', ['-i'], {});
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        path.join(DIR, '.zshrc'),
        expect.any(String),
        expect.objectContaining({ encoding: 'utf8' })
      );
    });

    it('does NOT rewrite when on-disk content already matches', () => {
      // First pass: capture what would be written.
      service.decorate('/bin/zsh', ['-i'], {});
      const zshrc = writtenContent(path.join(DIR, '.zshrc'))!;
      const zshenv = writtenContent(path.join(DIR, '.zshenv'))!;

      // Second pass on a FRESH service: readFileSync returns the same content,
      // so the hash matches and nothing is rewritten.
      jest.clearAllMocks();
      mockGetPath.mockReturnValue('/userData');
      mockReadFileSync.mockImplementation((p: string) => {
        if (p === path.join(DIR, '.zshrc')) return zshrc;
        if (p === path.join(DIR, '.zshenv')) return zshenv;
        throw new Error('ENOENT');
      });

      const fresh = new ShellIntegrationService();
      fresh.decorate('/bin/zsh', ['-i'], {});

      expect(mockWriteFileSync).not.toHaveBeenCalled();
      // Env decoration still applied even when no write happens.
    });

    it('rewrites when on-disk content differs (version/content drift)', () => {
      mockReadFileSync.mockReturnValue('# stale content from an old version\n');

      service.decorate('/bin/zsh', ['-i'], {});

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        path.join(DIR, '.zshrc'),
        expect.any(String),
        expect.anything()
      );
    });

    it('caches the resolved dir (getPath called once across decorations)', () => {
      service.decorate('/bin/zsh', ['-i'], {});
      service.decorate('/bin/bash', ['-i'], {});
      expect(mockGetPath).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Failure-safe fallback
  // ==========================================================================
  describe('failure-safe fallback', () => {
    it('falls back to the original spawn when mkdirSync throws', () => {
      mockMkdirSync.mockImplementation(() => {
        throw new Error('EACCES');
      });

      const env = { HOME: '/home/u' };
      const result = service.decorate('/bin/zsh', ['-i'], env);

      expect(result.command).toBe('/bin/zsh');
      expect(result.args).toEqual(['-i']);
      expect(result.env).toEqual(env); // no ZDOTDIR added
      expect(result.env.ZDOTDIR).toBeUndefined();
    });

    it('falls back when writeFileSync throws', () => {
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('ENOSPC');
      });

      const env = { HOME: '/home/u' };
      const result = service.decorate('/bin/bash', ['-i'], env);

      expect(result.command).toBe('/bin/bash');
      expect(result.args).toEqual(['-i']); // no --rcfile injected
      expect(result.env).toEqual(env);
    });

    it('falls back when electron app.getPath throws', () => {
      mockGetPath.mockImplementation(() => {
        throw new Error('app not ready');
      });

      const env = { HOME: '/home/u' };
      const result = service.decorate('/bin/zsh', ['-i'], env);

      expect(result).toEqual({ command: '/bin/zsh', args: ['-i'], env });
    });

    it('falls back when userData path is empty', () => {
      mockGetPath.mockReturnValue('');

      const env = { HOME: '/home/u' };
      const result = service.decorate('/bin/zsh', ['-i'], env);

      expect(result.env.ZDOTDIR).toBeUndefined();
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });
  });
});
