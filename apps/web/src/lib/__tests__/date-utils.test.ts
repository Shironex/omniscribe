import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getGreeting, formatRelativeTime } from '../date-utils';

describe('getGreeting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Good morning" before noon', () => {
    vi.setSystemTime(new Date(2025, 0, 15, 8, 0, 0));
    expect(getGreeting()).toBe('Good morning');
  });

  it('returns "Good morning" at midnight', () => {
    vi.setSystemTime(new Date(2025, 0, 15, 0, 0, 0));
    expect(getGreeting()).toBe('Good morning');
  });

  it('returns "Good morning" at 11:59', () => {
    vi.setSystemTime(new Date(2025, 0, 15, 11, 59, 59));
    expect(getGreeting()).toBe('Good morning');
  });

  it('returns "Good afternoon" at noon', () => {
    vi.setSystemTime(new Date(2025, 0, 15, 12, 0, 0));
    expect(getGreeting()).toBe('Good afternoon');
  });

  it('returns "Good afternoon" at 15:00', () => {
    vi.setSystemTime(new Date(2025, 0, 15, 15, 0, 0));
    expect(getGreeting()).toBe('Good afternoon');
  });

  it('returns "Good afternoon" at 17:59', () => {
    vi.setSystemTime(new Date(2025, 0, 15, 17, 59, 59));
    expect(getGreeting()).toBe('Good afternoon');
  });

  it('returns "Good evening" at 18:00', () => {
    vi.setSystemTime(new Date(2025, 0, 15, 18, 0, 0));
    expect(getGreeting()).toBe('Good evening');
  });

  it('returns "Good evening" at 23:59', () => {
    vi.setSystemTime(new Date(2025, 0, 15, 23, 59, 59));
    expect(getGreeting()).toBe('Good evening');
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15, 12, 0, 0)); // June 15, 2025 12:00
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Just now" for less than 1 minute ago', () => {
    const date = new Date(2025, 5, 15, 11, 59, 30);
    expect(formatRelativeTime(date)).toBe('Just now');
  });

  it('returns "Just now" for 0 seconds ago', () => {
    const date = new Date(2025, 5, 15, 12, 0, 0);
    expect(formatRelativeTime(date)).toBe('Just now');
  });

  it('returns minutes ago for 1-59 minutes', () => {
    const date1min = new Date(2025, 5, 15, 11, 59, 0);
    expect(formatRelativeTime(date1min)).toBe('1m ago');

    const date30min = new Date(2025, 5, 15, 11, 30, 0);
    expect(formatRelativeTime(date30min)).toBe('30m ago');

    const date59min = new Date(2025, 5, 15, 11, 1, 0);
    expect(formatRelativeTime(date59min)).toBe('59m ago');
  });

  it('returns hours ago for 1-23 hours', () => {
    const date1h = new Date(2025, 5, 15, 11, 0, 0);
    expect(formatRelativeTime(date1h)).toBe('1h ago');

    const date5h = new Date(2025, 5, 15, 7, 0, 0);
    expect(formatRelativeTime(date5h)).toBe('5h ago');

    const date23h = new Date(2025, 5, 14, 13, 0, 0);
    expect(formatRelativeTime(date23h)).toBe('23h ago');
  });

  it('returns "Yesterday" for exactly 1 day ago', () => {
    const date = new Date(2025, 5, 14, 12, 0, 0);
    expect(formatRelativeTime(date)).toBe('Yesterday');
  });

  it('returns days ago for 2-6 days', () => {
    const date2d = new Date(2025, 5, 13, 12, 0, 0);
    expect(formatRelativeTime(date2d)).toBe('2d ago');

    const date6d = new Date(2025, 5, 9, 12, 0, 0);
    expect(formatRelativeTime(date6d)).toBe('6d ago');
  });

  it('returns formatted date for 7+ days ago', () => {
    const date7d = new Date(2025, 5, 8, 12, 0, 0);
    const result = formatRelativeTime(date7d);
    // toLocaleDateString output varies by locale, just verify it does not say "d ago"
    expect(result).not.toContain('d ago');
    expect(result).not.toContain('Yesterday');
  });

  it('returns formatted date for much older dates', () => {
    const oldDate = new Date(2024, 0, 1);
    const result = formatRelativeTime(oldDate);
    expect(result).not.toContain('ago');
    expect(result).not.toContain('Just now');
  });
});
