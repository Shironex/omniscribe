import { describe, it, expect } from 'vitest';
import { mapToTerminalSessions } from '../session-mappers';
import type { FrontendSessionConfig } from '@/stores/useSessionStore';

function makeSession(overrides: Partial<FrontendSessionConfig> = {}): FrontendSessionConfig {
  return {
    id: 'sess-1',
    name: 'Test',
    workingDirectory: '/test',
    aiMode: 'claude',
    projectPath: '/test/project',
    status: 'working',
    createdAt: new Date(),
    lastActiveAt: new Date(),
    ...overrides,
  };
}

describe('mapToTerminalSessions', () => {
  it('returns the same per-session output object when inputs are referentially equal', () => {
    // The map cache is keyed on the FrontendSessionConfig reference, so
    // the same source + same customTitle + same slot index → same output
    // ref. This is what lets React.memo'd TerminalCards skip re-renders
    // during status fan-outs that don't actually change the source.
    const session = makeSession({ id: 'sess-1' });
    const titles: Record<string, string> = {};

    const first = mapToTerminalSessions([session], titles);
    const second = mapToTerminalSessions([session], titles);

    expect(second[0]).toBe(first[0]);
  });

  it('rotates the output when the source session reference changes', () => {
    const titles: Record<string, string> = {};
    const v1 = makeSession({ id: 'sess-1', status: 'idle' });
    const v2 = { ...v1, status: 'working' as const };

    const first = mapToTerminalSessions([v1], titles);
    const second = mapToTerminalSessions([v2], titles);

    expect(second[0]).not.toBe(first[0]);
    expect(second[0].status).toBe('working');
  });

  it('rotates the output when the customTitle for a session changes', () => {
    const session = makeSession({ id: 'sess-1' });

    const first = mapToTerminalSessions([session], {});
    const second = mapToTerminalSessions([session], { 'sess-1': 'Renamed' });

    expect(second[0]).not.toBe(first[0]);
    expect(second[0].customTitle).toBe('Renamed');
  });

  it('rotates the output when the slot number (index) changes', () => {
    const a = makeSession({ id: 'sess-a' });
    const b = makeSession({ id: 'sess-b' });
    const titles: Record<string, string> = {};

    const first = mapToTerminalSessions([a, b], titles);
    // Same `a` reference, but now at index 1 instead of 0 → different
    // sessionNumber → cache miss expected.
    const second = mapToTerminalSessions([b, a], titles);

    expect(second[1]).not.toBe(first[0]);
    expect(second[1].sessionNumber).toBe(2);
    expect(first[0].sessionNumber).toBe(1);
  });

  it('produces stable references for unchanged neighbors when one session is updated', () => {
    // The targeted re-render path: one session ticks, others should
    // keep their cached output object.
    const a = makeSession({ id: 'sess-a', status: 'idle' });
    const b = makeSession({ id: 'sess-b', status: 'working' });
    const titles: Record<string, string> = {};

    const first = mapToTerminalSessions([a, b], titles);

    // `a` rotates; `b` stays the same reference.
    const aV2 = { ...a, status: 'working' as const };
    const second = mapToTerminalSessions([aV2, b], titles);

    expect(second[0]).not.toBe(first[0]);
    expect(second[1]).toBe(first[1]);
  });
});
