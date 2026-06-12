/**
 * Tests for OscAgentDetector.
 *
 * Ported from terax-ai (Apache-2.0) —
 * `src-tauri/src/modules/pty/agent_detect.rs` unit tests — adapted to
 * TypeScript/Jest with the `omniscribe` OSC 777 marker. Pure unit tests with
 * no NestJS dependencies.
 */

import { OscAgentDetector, OscTransition } from './osc-agent-detector';

const ESC = '\x1b';
const BEL = '\x07';
const ST = '\x1b\\';

/** Wrap an OSC body in ESC ] ... ESC \ (ST terminator). */
function osc(body: string): string {
  return `${ESC}]${body}${ST}`;
}

/** Feed a chunk and collect emitted transitions. */
function run(d: OscAgentDetector, input: string): OscTransition[] {
  const out: OscTransition[] = [];
  d.process(input, t => out.push(t));
  return out;
}

function started(agent: 'claude' | 'codex'): OscTransition {
  return { kind: 'started', agent };
}

describe('OscAgentDetector', () => {
  it('arms on agent command', () => {
    const d = new OscAgentDetector();
    expect(run(d, osc('133;C;claude -p hello'))).toEqual([started('claude')]);
  });

  it('arms on pathed and wrapped command', () => {
    const d = new OscAgentDetector();
    expect(run(d, osc('133;C;/usr/local/bin/codex exec'))).toEqual([started('codex')]);

    const d2 = new OscAgentDetector();
    expect(run(d2, osc('133;C;npx claude'))).toEqual([started('claude')]);
  });

  it('arms on dash-suffixed alias', () => {
    const d = new OscAgentDetector();
    expect(run(d, osc('133;C;claude-enigma'))).toEqual([started('claude')]);
  });

  it('does not arm on other commands', () => {
    const d = new OscAgentDetector();
    expect(run(d, osc('133;C;vim src/main.rs'))).toEqual([]);
    expect(run(d, osc('133;C;cat claude.txt'))).toEqual([]);
    expect(run(d, osc('133;C;claudexyz'))).toEqual([]);
  });

  it('ignores bell and plain output', () => {
    const d = new OscAgentDetector();
    run(d, osc('133;C;claude'));
    expect(run(d, BEL)).toEqual([]);
    expect(run(d, `thinking...${BEL}more`)).toEqual([]);
  });

  it('omniscribe marker drives status', () => {
    const d = new OscAgentDetector();
    run(d, osc('133;C;claude'));
    expect(run(d, osc('777;notify;omniscribe;attention'))).toEqual([{ kind: 'attention' }]);
    expect(run(d, osc('777;notify;omniscribe;working'))).toEqual([{ kind: 'working' }]);
    // Re-emitting working while already working is a no-op.
    expect(run(d, osc('777;notify;omniscribe;working'))).toEqual([]);
    expect(run(d, osc('777;notify;omniscribe;finished'))).toEqual([{ kind: 'finished' }]);
  });

  it('omniscribe marker auto-arms without preexec', () => {
    const d = new OscAgentDetector();
    expect(run(d, osc('777;notify;omniscribe;attention'))).toEqual([
      started('claude'),
      { kind: 'attention' },
    ]);
  });

  it('generic osc777 and osc9 attention only when armed', () => {
    const d = new OscAgentDetector();
    // Unknown 777 marker before arming → nothing.
    expect(run(d, osc('777;notify;Other;ready'))).toEqual([]);
    run(d, osc('133;C;codex'));
    // Once armed, a generic 777 notification counts as attention.
    expect(run(d, osc('777;notify;Codex;ready'))).toEqual([{ kind: 'attention' }]);
    expect(run(d, osc('9;needs you'))).toEqual([{ kind: 'attention' }]);
    // OSC 9;4 is taskbar progress, not a notification.
    expect(run(d, osc('9;4;1;50'))).toEqual([]);
  });

  it('exits on 133;D', () => {
    const d = new OscAgentDetector();
    run(d, osc('133;C;claude'));
    expect(run(d, osc('133;D;0'))).toEqual([{ kind: 'exited' }]);
    // A second D while disarmed does nothing.
    expect(run(d, osc('133;D;0'))).toEqual([]);
  });

  it('bel terminator inside osc is not attention', () => {
    const d = new OscAgentDetector();
    run(d, osc('133;C;claude'));
    // OSC 0 (set title) terminated by BEL — must not be read as attention.
    const seq = `${ESC}]0;set title${BEL}`;
    expect(run(d, seq)).toEqual([]);
  });

  it('started split across chunks', () => {
    const d = new OscAgentDetector();
    expect(run(d, `${ESC}]`)).toEqual([]);
    expect(run(d, '133;C;cla')).toEqual([]);
    const out = run(d, 'ude');
    out.push(...run(d, ST));
    expect(out).toEqual([started('claude')]);
  });

  it('finish reports exited when armed', () => {
    const d = new OscAgentDetector();
    run(d, osc('133;C;claude'));
    const out: OscTransition[] = [];
    d.finish(t => out.push(t));
    expect(out).toEqual([{ kind: 'exited' }]);
    // Idempotent — second finish emits nothing.
    const out2: OscTransition[] = [];
    d.finish(t => out2.push(t));
    expect(out2).toEqual([]);
  });

  it('finish is a no-op when never armed', () => {
    const d = new OscAgentDetector();
    const out: OscTransition[] = [];
    d.finish(t => out.push(t));
    expect(out).toEqual([]);
  });

  it('oversized osc does not throw and recovers', () => {
    const d = new OscAgentDetector();
    run(d, osc('133;C;claude'));
    const huge = `${ESC}]${'x'.repeat(2048 + 100)}${ST}`;
    expect(run(d, huge)).toEqual([]);
    // Detector still works after recovering from the oversized payload.
    expect(run(d, osc('777;notify;omniscribe;attention'))).toEqual([{ kind: 'attention' }]);
  });

  it('no-ESC chunk takes the fast path and emits nothing', () => {
    const d = new OscAgentDetector();
    expect(run(d, 'plain terminal output with no escape bytes')).toEqual([]);
    expect(d.isArmed).toBe(false);
  });

  it('accepts BEL terminator for the omniscribe marker', () => {
    const d = new OscAgentDetector();
    run(d, osc('133;C;claude'));
    // Hook emits \x1b]777;notify;omniscribe;working\x07 (BEL terminated).
    expect(run(d, `${ESC}]777;notify;omniscribe;attention${BEL}`)).toEqual([{ kind: 'attention' }]);
  });

  it('marker split across chunk boundary still self-arms', () => {
    const d = new OscAgentDetector();
    expect(run(d, `${ESC}]777;notify;omni`)).toEqual([]);
    const out = run(d, `scribe;working${BEL}`);
    expect(out).toEqual([started('claude')]);
  });

  it('re-arming after exit works (new command)', () => {
    const d = new OscAgentDetector();
    run(d, osc('133;C;claude'));
    run(d, osc('133;D;0'));
    expect(d.isArmed).toBe(false);
    expect(run(d, osc('133;C;codex'))).toEqual([started('codex')]);
  });
});
