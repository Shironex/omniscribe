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

  it('does not arm on other commands (emits shell-busy instead)', () => {
    // Non-agent commands must NOT arm the detector. Under the layered model they
    // drive the UNARMED plain-shell cycle (shell-busy) rather than being
    // silently dropped.
    const d = new OscAgentDetector();
    expect(run(d, osc('133;C;vim src/main.rs'))).toEqual([{ kind: 'shell-busy' }]);
    expect(run(d, osc('133;C;cat claude.txt'))).toEqual([{ kind: 'shell-busy' }]);
    expect(run(d, osc('133;C;claudexyz'))).toEqual([{ kind: 'shell-busy' }]);
    expect(d.isArmed).toBe(false);
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
    expect(d.isArmed).toBe(false);
    // A second D while disarmed is the UNARMED shell cycle: shell-idle (the old
    // model dropped it; that's the bug being fixed).
    expect(run(d, osc('133;D;0'))).toEqual([{ kind: 'shell-idle' }]);
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

  // ==========================================================================
  // UNARMED regime — plain-shell activity cycle (no agent running)
  // ==========================================================================
  describe('unarmed plain-shell cycle', () => {
    it('emits shell-busy on a non-agent command without arming', () => {
      const d = new OscAgentDetector();
      expect(run(d, osc('133;C;ls -la'))).toEqual([{ kind: 'shell-busy' }]);
      expect(d.isArmed).toBe(false);
    });

    it('emits shell-idle on D while unarmed', () => {
      const d = new OscAgentDetector();
      expect(run(d, osc('133;D;0'))).toEqual([{ kind: 'shell-idle' }]);
      expect(d.isArmed).toBe(false);
    });

    it('cycles busy/idle indefinitely for plain commands', () => {
      const d = new OscAgentDetector();
      // First command: vim
      expect(run(d, osc('133;C;vim file.txt'))).toEqual([{ kind: 'shell-busy' }]);
      expect(run(d, osc('133;D;0'))).toEqual([{ kind: 'shell-idle' }]);
      // Second command: sleep — cycle must continue, not get stuck after the
      // first D (the original bug).
      expect(run(d, osc('133;C;sleep 8'))).toEqual([{ kind: 'shell-busy' }]);
      expect(run(d, osc('133;D;0'))).toEqual([{ kind: 'shell-idle' }]);
      // Third command for good measure.
      expect(run(d, osc('133;C;git status'))).toEqual([{ kind: 'shell-busy' }]);
      expect(run(d, osc('133;D;1'))).toEqual([{ kind: 'shell-idle' }]);
      expect(d.isArmed).toBe(false);
    });

    it('a plain D at the first prompt sets shell-idle (reproduces the live bug)', () => {
      // A plain zsh session's very first prompt emits 133;D with no preceding
      // agent C. Old model ignored it (armed-only); new model emits shell-idle.
      const d = new OscAgentDetector();
      expect(run(d, osc('133;D;0'))).toEqual([{ kind: 'shell-idle' }]);
      // Then the user runs a command — must go busy, then idle again.
      expect(run(d, osc('133;C;echo hi'))).toEqual([{ kind: 'shell-busy' }]);
      expect(run(d, osc('133;D;0'))).toEqual([{ kind: 'shell-idle' }]);
    });

    it('133;A and 133;B prompt marks emit nothing', () => {
      const d = new OscAgentDetector();
      expect(run(d, osc('133;A'))).toEqual([]);
      expect(run(d, osc('133;B'))).toEqual([]);
      expect(d.isArmed).toBe(false);
    });

    it('generic 777/9 attention is NOT emitted while unarmed', () => {
      const d = new OscAgentDetector();
      run(d, osc('133;C;ls')); // shell-busy, still unarmed
      expect(run(d, osc('9;some notification'))).toEqual([]);
      expect(run(d, osc('777;notify;Other;ready'))).toEqual([]);
    });

    it('finish() is a no-op for a plain shell that only cycled (never armed)', () => {
      const d = new OscAgentDetector();
      run(d, osc('133;C;ls'));
      run(d, osc('133;D;0'));
      const out: OscTransition[] = [];
      d.finish(t => out.push(t));
      expect(out).toEqual([]);
    });
  });

  // ==========================================================================
  // Layering — UNARMED cycle ↔ ARMED agent lifecycle transitions
  // ==========================================================================
  describe('layering: cycle → agent arm → exit → cycle resume', () => {
    it('arms on an agent command mid-cycle then resumes the cycle after exit', () => {
      const d = new OscAgentDetector();

      // Plain command cycle.
      expect(run(d, osc('133;C;ls'))).toEqual([{ kind: 'shell-busy' }]);
      expect(run(d, osc('133;D;0'))).toEqual([{ kind: 'shell-idle' }]);

      // Agent command — switches to ARMED regime (started, NOT shell-busy).
      expect(run(d, osc('133;C;claude -p hi'))).toEqual([started('claude')]);
      expect(d.isArmed).toBe(true);

      // While armed, the agent owns the cycle: a stray C is ignored, 777 drives
      // status, and the agent's D disarms with `exited`.
      expect(run(d, osc('133;C;some sub'))).toEqual([]);
      expect(run(d, osc('777;notify;omniscribe;attention'))).toEqual([{ kind: 'attention' }]);
      expect(run(d, osc('133;D;0'))).toEqual([{ kind: 'exited' }]);
      expect(d.isArmed).toBe(false);

      // Cycle resumes for the next plain command.
      expect(run(d, osc('133;C;npm test'))).toEqual([{ kind: 'shell-busy' }]);
      expect(run(d, osc('133;D;0'))).toEqual([{ kind: 'shell-idle' }]);
    });

    it('an agent C does NOT emit shell-busy (arming takes precedence)', () => {
      const d = new OscAgentDetector();
      expect(run(d, osc('133;C;codex exec'))).toEqual([started('codex')]);
      expect(d.isArmed).toBe(true);
    });

    it('777 self-arm from a non-agent shell still arms (claude-hook path)', () => {
      // The 777 marker is reserved for the claude-hook path; if it ever arrives
      // (e.g. claude spawned directly) it self-arms exactly as before. The
      // `working` event self-arms (started); the follow-on setWorking is a no-op
      // because ensureArmed already put it in the Working state.
      const d = new OscAgentDetector();
      expect(run(d, osc('777;notify;omniscribe;working'))).toEqual([started('claude')]);
      expect(d.isArmed).toBe(true);
    });
  });
});
