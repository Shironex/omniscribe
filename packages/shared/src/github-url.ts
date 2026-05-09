/**
 * Parses a git remote URL and returns a normalized GitHub HTTPS URL if the
 * remote points to github.com. Returns null for non-GitHub hosts or malformed
 * inputs.
 *
 * Handles the following URL forms:
 *   - https://github.com/owner/repo[.git]
 *   - https://user:token@github.com/owner/repo[.git]  (credentials stripped)
 *   - git@github.com:owner/repo[.git]
 *   - ssh://git@github.com/owner/repo[.git]
 */
export function parseGitHubRepoUrl(
  url: string
): { httpsUrl: string; owner: string; repo: string } | null {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();

  // SSH shorthand: git@github.com:owner/repo[.git]
  // Strict — owner and repo each forbid `/`, so paths like
  // `git@github.com:owner/repo.git/extra/path` are rejected outright
  // instead of silently flattening into `repo = "repo.git"`.
  const sshShorthand = /^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(trimmed);
  if (sshShorthand) {
    const [, host, owner, repo] = sshShorthand;
    if (host.toLowerCase() !== 'github.com') return null;
    return buildResult(owner, repo);
  }

  // HTTPS or SSH-URL: https://... or ssh://...
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.hostname.toLowerCase() !== 'github.com') return null;
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'ssh:') return null;

  // pathname is like /owner/repo[.git] (leading slash present).
  // Strip leading slash and any trailing slash, then require exactly two
  // non-empty segments. `https://github.com/owner/repo/tree/branch` and
  // `https://github.com/owner/repo/issues/1` are rejected — this function
  // answers "is this a clean repo URL", not "does this URL touch a repo".
  const parts = parsed.pathname.replace(/^\//, '').replace(/\/$/, '').split('/');
  if (parts.length !== 2) return null;

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, '');
  if (!owner || !repo) return null;

  return buildResult(owner, repo);
}

function buildResult(
  owner: string,
  repo: string
): { httpsUrl: string; owner: string; repo: string } {
  return {
    httpsUrl: `https://github.com/${owner}/${repo}`,
    owner,
    repo,
  };
}
