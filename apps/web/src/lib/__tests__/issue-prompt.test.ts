import { describe, it, expect } from 'vitest';
import type { Issue } from '@omniscribe/shared';
import { buildIssueSystemPrompt, buildIssueSessionName } from '../issue-prompt';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    number: 42,
    title: 'Fix login bug',
    body: 'The login form crashes when submitting empty fields.',
    state: 'open',
    author: { login: 'octocat' },
    url: 'https://github.com/owner/repo/issues/42',
    labels: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
    ...overrides,
  };
}

describe('buildIssueSystemPrompt', () => {
  it('includes issue number, title, URL, and body', () => {
    const prompt = buildIssueSystemPrompt(makeIssue());
    expect(prompt).toContain('Issue #42');
    expect(prompt).toContain('Fix login bug');
    expect(prompt).toContain('https://github.com/owner/repo/issues/42');
    expect(prompt).toContain('The login form crashes when submitting empty fields.');
  });

  it('includes labels when present', () => {
    const prompt = buildIssueSystemPrompt(
      makeIssue({ labels: [{ name: 'bug' }, { name: 'urgent', color: 'ff0000' }] })
    );
    expect(prompt).toContain('Labels: bug, urgent');
  });

  it('omits labels line when no labels', () => {
    const prompt = buildIssueSystemPrompt(makeIssue({ labels: [] }));
    expect(prompt).not.toContain('Labels:');
  });

  it('shows fallback text when body is null/undefined', () => {
    const prompt = buildIssueSystemPrompt(makeIssue({ body: undefined }));
    expect(prompt).toContain('No description provided.');
  });

  it('truncates very long bodies at 80k chars', () => {
    const longBody = 'x'.repeat(100_000);
    const prompt = buildIssueSystemPrompt(makeIssue({ body: longBody }));
    // Body should be truncated, not the full 100k
    expect(prompt).toContain('[body truncated]');
    expect(prompt.length).toBeLessThan(85_000);
  });

  it('does not truncate bodies under 80k chars', () => {
    const body = 'y'.repeat(50_000);
    const prompt = buildIssueSystemPrompt(makeIssue({ body }));
    expect(prompt).not.toContain('[body truncated]');
    expect(prompt).toContain(body);
  });
});

describe('buildIssueSessionName', () => {
  it('returns formatted name with issue number and title', () => {
    const name = buildIssueSessionName(makeIssue());
    expect(name).toBe('Issue #42: Fix login bug');
  });

  it('truncates long titles with ellipsis', () => {
    const longTitle =
      'This is a very long issue title that exceeds the maximum allowed character limit for display';
    const name = buildIssueSessionName(makeIssue({ title: longTitle }));
    expect(name.length).toBeLessThanOrEqual(60);
    expect(name).toContain('Issue #42: ');
    expect(name).toMatch(/\u2026$/); // ends with ellipsis
  });

  it('keeps short titles intact', () => {
    const name = buildIssueSessionName(makeIssue({ title: 'Short' }));
    expect(name).toBe('Issue #42: Short');
  });

  it('accounts for number length in prefix', () => {
    const name = buildIssueSessionName(makeIssue({ number: 12345, title: 'Test' }));
    expect(name).toBe('Issue #12345: Test');
  });
});
