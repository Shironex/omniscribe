import * as path from 'path';
import * as os from 'os';

/**
 * Encode a project path to match Claude Code's directory naming convention.
 * Claude Code stores sessions under ~/.claude/projects/<encoded-path>/
 *
 * Examples:
 * - Windows: C:\Users\foo\project -> C--Users-foo-project
 * - Unix: /home/user/project -> -home-user-project
 */
export function encodeProjectPath(projectPath: string): string {
  const normalized = path.normalize(projectPath);

  if (process.platform === 'win32') {
    // Windows: C:\Users\foo -> C--Users-foo
    // Replace :\ with --, then remaining \ with -
    return normalized.replace(/:\\/g, '--').replace(/\\/g, '-');
  } else {
    // Unix: /home/user/project -> -home-user-project
    // Replace all / with -
    return normalized.replace(/\//g, '-');
  }
}

/** Get the Claude Code sessions directory for a project */
export function getClaudeSessionsDir(projectPath: string): string {
  const encoded = encodeProjectPath(projectPath);
  return path.join(os.homedir(), '.claude', 'projects', encoded);
}

/** Get the path to sessions-index.json for a project */
export function getSessionsIndexPath(projectPath: string): string {
  return path.join(getClaudeSessionsDir(projectPath), 'sessions-index.json');
}
