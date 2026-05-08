import { parseGitHubRepoUrl } from './github-url';

describe('parseGitHubRepoUrl', () => {
  // ── HTTPS ──────────────────────────────────────────────────────────────

  it('parses HTTPS URL without .git suffix', () => {
    const result = parseGitHubRepoUrl('https://github.com/owner/repo');
    expect(result).toEqual({
      httpsUrl: 'https://github.com/owner/repo',
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('parses HTTPS URL with .git suffix', () => {
    const result = parseGitHubRepoUrl('https://github.com/owner/repo.git');
    expect(result).toEqual({
      httpsUrl: 'https://github.com/owner/repo',
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('strips embedded credentials from HTTPS URL', () => {
    const result = parseGitHubRepoUrl('https://user:token@github.com/owner/repo.git');
    expect(result).toEqual({
      httpsUrl: 'https://github.com/owner/repo',
      owner: 'owner',
      repo: 'repo',
    });
  });

  // ── SSH shorthand ──────────────────────────────────────────────────────

  it('parses SSH shorthand without .git suffix', () => {
    const result = parseGitHubRepoUrl('git@github.com:owner/repo');
    expect(result).toEqual({
      httpsUrl: 'https://github.com/owner/repo',
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('parses SSH shorthand with .git suffix', () => {
    const result = parseGitHubRepoUrl('git@github.com:owner/repo.git');
    expect(result).toEqual({
      httpsUrl: 'https://github.com/owner/repo',
      owner: 'owner',
      repo: 'repo',
    });
  });

  // ── SSH URL form ───────────────────────────────────────────────────────

  it('parses ssh:// URL form', () => {
    const result = parseGitHubRepoUrl('ssh://git@github.com/owner/repo.git');
    expect(result).toEqual({
      httpsUrl: 'https://github.com/owner/repo',
      owner: 'owner',
      repo: 'repo',
    });
  });

  // ── Non-GitHub hosts → null ────────────────────────────────────────────

  it('returns null for GitLab', () => {
    expect(parseGitHubRepoUrl('https://gitlab.com/owner/repo.git')).toBeNull();
  });

  it('returns null for Bitbucket', () => {
    expect(parseGitHubRepoUrl('https://bitbucket.org/owner/repo.git')).toBeNull();
  });

  it('returns null for GitHub Enterprise (non-github.com host)', () => {
    expect(parseGitHubRepoUrl('https://github.mycompany.com/owner/repo.git')).toBeNull();
  });

  it('returns null for SSH shorthand with non-GitHub host', () => {
    expect(parseGitHubRepoUrl('git@gitlab.com:owner/repo.git')).toBeNull();
  });

  // ── Mixed-case host ────────────────────────────────────────────────────

  it('accepts mixed-case GitHub.com host in HTTPS URL', () => {
    const result = parseGitHubRepoUrl('https://GitHub.COM/owner/repo.git');
    expect(result).toEqual({
      httpsUrl: 'https://github.com/owner/repo',
      owner: 'owner',
      repo: 'repo',
    });
  });

  // ── Malformed / edge cases → null ──────────────────────────────────────

  it('returns null for empty string', () => {
    expect(parseGitHubRepoUrl('')).toBeNull();
  });

  it('returns null for completely invalid input', () => {
    expect(parseGitHubRepoUrl('not-a-url')).toBeNull();
  });

  it('returns null for URL with no path segments', () => {
    expect(parseGitHubRepoUrl('https://github.com/')).toBeNull();
  });

  it('returns null for URL with only owner (no repo)', () => {
    expect(parseGitHubRepoUrl('https://github.com/owner')).toBeNull();
  });
});
