import * as path from 'path';
import * as os from 'os';
import { encodeProjectPath, getClaudeSessionsDir, getSessionsIndexPath } from './claude-paths';

describe('encodeProjectPath', () => {
  describe('Unix paths (default on POSIX)', () => {
    it('encodes a standard Unix path', () => {
      expect(encodeProjectPath('/home/user/project')).toBe('-home-user-project');
    });

    it('encodes a macOS-style path', () => {
      expect(encodeProjectPath('/Users/shirone/Documents/Projects/omniscribe')).toBe(
        '-Users-shirone-Documents-Projects-omniscribe'
      );
    });

    it('encodes root path', () => {
      expect(encodeProjectPath('/')).toBe('-');
    });

    it('encodes a simple path', () => {
      expect(encodeProjectPath('/foo')).toBe('-foo');
    });

    it('handles trailing slashes', () => {
      // path.normalize on POSIX does NOT remove trailing slashes for non-root paths
      const result = encodeProjectPath('/home/user/project/');
      expect(result).toBe('-home-user-project-');
    });

    it('normalizes double slashes', () => {
      expect(encodeProjectPath('/home//user/project')).toBe('-home-user-project');
    });

    it('preserves spaces in path segments', () => {
      expect(encodeProjectPath('/home/my user/project')).toBe('-home-my user-project');
    });
  });

  describe('Windows paths (mocked platform)', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('encodes a Windows path with drive letter', () => {
      // On POSIX, path.normalize won't convert / to \, so provide backslashes directly
      expect(encodeProjectPath('C:\\Users\\foo\\project')).toBe('C--Users-foo-project');
    });

    it('encodes another drive letter', () => {
      expect(encodeProjectPath('D:\\dev\\myapp')).toBe('D--dev-myapp');
    });
  });
});

describe('getClaudeSessionsDir', () => {
  it('returns the correct sessions directory for a project', () => {
    const homedir = os.homedir();
    const result = getClaudeSessionsDir('/home/user/project');
    const expected = path.join(homedir, '.claude', 'projects', '-home-user-project');
    expect(result).toBe(expected);
  });
});

describe('getSessionsIndexPath', () => {
  it('returns the correct sessions-index.json path', () => {
    const homedir = os.homedir();
    const result = getSessionsIndexPath('/home/user/project');
    const expected = path.join(
      homedir,
      '.claude',
      'projects',
      '-home-user-project',
      'sessions-index.json'
    );
    expect(result).toBe(expected);
  });
});
