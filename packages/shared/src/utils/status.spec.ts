import { mapSessionStatus, type UISessionStatus } from './status';
import type { SessionStatus } from '../types/session';

describe('mapSessionStatus', () => {
  const cases: [SessionStatus | string, UISessionStatus][] = [
    ['idle', 'idle'],
    ['disconnected', 'idle'],
    ['connecting', 'starting'],
    ['thinking', 'working'],
    ['working', 'working'],
    ['planning', 'planning'],
    ['needs_input', 'needsInput'],
    ['finished', 'done'],
    ['error', 'error'],
    // Legacy statuses (no longer in SessionStatus type, but still handled for backward compat)
    ['active', 'working'],
    ['executing', 'working'],
    ['paused', 'needsInput'],
  ];

  it.each(cases)('maps "%s" to "%s"', (input, expected) => {
    expect(mapSessionStatus(input)).toBe(expected);
  });

  it('returns "idle" for unknown status strings', () => {
    expect(mapSessionStatus('unknown_status')).toBe('idle');
  });

  it('returns "idle" for empty string', () => {
    expect(mapSessionStatus('')).toBe('idle');
  });

  it('is case-sensitive (uppercase falls through to default)', () => {
    expect(mapSessionStatus('IDLE')).toBe('idle');
    expect(mapSessionStatus('Error')).toBe('idle');
  });
});
