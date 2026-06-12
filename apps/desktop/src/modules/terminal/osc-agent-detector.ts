/**
 * OSC Agent Detector
 *
 * A byte/string-stream state machine that scans raw PTY output for OSC
 * (Operating System Command) sequences and emits typed agent-status
 * transitions. Transitions come ONLY from OSC sequences — never from raw
 * output heuristics — so a TUI agent (e.g. Claude Code) that repaints its
 * screen continuously never flaps between working/waiting.
 *
 * Recognized sequences:
 *  - `OSC 133;C;<command>`  — command start (shell integration). Arms the
 *    detector when <command> resolves to a known agent (claude/codex),
 *    tolerating path prefixes (`/usr/local/bin/codex`), wrappers (`npx claude`),
 *    and dash-suffixed aliases (`claude-enigma`).
 *  - `OSC 133;D;<exit>`     — command done → emits `exited` (disarms).
 *  - `OSC 777;notify;omniscribe;<event>` — marker our Claude Code hooks emit
 *    via the `terminalSequence` field. <event> ∈ working|attention|finished.
 *    These SELF-ARM the detector even without a preceding 133;C, so
 *    notifications work in bash, Windows, tmux, and wrapper setups where no
 *    shell preexec fired.
 *  - `OSC 9;<text>`         — generic notification (treated as attention when
 *    armed). `OSC 9;4;...` is taskbar progress, not a notification — ignored.
 *
 * Both BEL (`\x07`) and ST (`\x1b\\`) terminators are accepted. An OSC
 * sequence may span two chunks; a bounded carry buffer (capped at OSC_MAX)
 * preserves partial sequences across `process()` calls. When the carry buffer
 * overflows the cap the sequence is abandoned (sanity guard against a wedged
 * stream). When a chunk contains no ESC byte and we are not mid-sequence, the
 * chunk is skipped entirely (zero-cost fast path on the hot data path).
 *
 * Adapted from terax-ai (Apache-2.0) —
 * `src-tauri/src/modules/pty/agent_detect.rs`. Ported to TypeScript operating
 * on UTF-16 string chunks (node-pty delivers strings); the OSC grammar only
 * uses ASCII control/intro bytes, so char-code comparisons are equivalent.
 */

const ESC = 0x1b;
const BEL = 0x07;
const OSC_INTRO = 0x5d; // ']'
const ST_FINAL = 0x5c; // '\\'
const SEMICOLON = 0x3b; // ';'

/** Sanity cap on a single OSC payload (matches terax's 2048). */
const OSC_MAX = 2048;

/** Default agents whose command invocations arm the detector. */
const DEFAULT_AGENTS = ['claude', 'codex'] as const;

/** OSC 777 marker our Claude Code hooks emit via `terminalSequence`. */
const OMNISCRIBE_MARKER = 'notify;omniscribe;';

/** Internal scanner state. */
const enum ScanState {
  Ground,
  Esc,
  Osc,
  OscEsc,
}

/** Whether the armed agent is currently producing output or waiting on us. */
const enum ArmedStatus {
  Working,
  Waiting,
}

/** Agents the detector recognizes. */
export type DetectedAgent = 'claude' | 'codex';

/** Kinds of transition the detector can emit. */
export type OscTransitionKind = 'started' | 'working' | 'attention' | 'finished' | 'exited';

/**
 * A typed agent-status transition. `agent` is only present on `started`
 * (and only when known); downstream code keys off `kind`.
 */
export interface OscTransition {
  kind: OscTransitionKind;
  agent?: DetectedAgent;
}

/** Callback invoked for each transition the detector emits. */
export type OscTransitionHandler = (transition: OscTransition) => void;

/**
 * Per-PTY OSC agent detector. Instantiate one per spawned PTY session and feed
 * it the RAW data stream from `pty.onData` (before any batching/scrollback).
 */
export class OscAgentDetector {
  private readonly agents: readonly string[];
  private state: ScanState = ScanState.Ground;
  /** Accumulated OSC payload bytes for the in-progress sequence. */
  private osc: number[] = [];
  /** Whether a known agent command is currently active. */
  private armed = false;
  private status: ArmedStatus = ArmedStatus.Working;

  constructor(agents: readonly string[] = DEFAULT_AGENTS) {
    this.agents = agents;
  }

  /** True once a known agent command has armed the detector. */
  get isArmed(): boolean {
    return this.armed;
  }

  /**
   * Feed a chunk of raw PTY output. Transitions are reported synchronously via
   * `emit`. Safe to call with empty chunks. Never throws on malformed input.
   *
   * @param input Raw PTY output chunk (string, as delivered by node-pty).
   * @param emit  Invoked once per detected transition.
   */
  process(input: string, emit: OscTransitionHandler): void {
    // Zero-cost fast path: when grounded and the chunk has no ESC byte, there
    // can be no OSC sequence to act on. (We must NOT skip while mid-sequence —
    // the carry buffer is waiting on a terminator.)
    if (this.state === ScanState.Ground && input.indexOf('\x1b') === -1) {
      return;
    }

    for (let i = 0; i < input.length; i++) {
      const b = input.charCodeAt(i);

      switch (this.state) {
        case ScanState.Ground:
          if (b === ESC) {
            this.state = ScanState.Esc;
          }
          break;

        case ScanState.Esc:
          if (b === OSC_INTRO) {
            this.state = ScanState.Osc;
            this.osc.length = 0;
          } else if (b === ESC) {
            // Stay in Esc — ESC ESC collapses to a single intro attempt.
          } else {
            this.state = ScanState.Ground;
          }
          break;

        case ScanState.Osc:
          if (b === BEL) {
            this.finishOsc(emit);
            this.state = ScanState.Ground;
          } else if (b === ESC) {
            this.state = ScanState.OscEsc;
          } else if (this.osc.length < OSC_MAX) {
            this.osc.push(b);
          } else {
            // Oversized payload — abandon the sequence (sanity cap).
            this.osc.length = 0;
            this.state = ScanState.Ground;
          }
          break;

        case ScanState.OscEsc:
          if (b === ST_FINAL) {
            this.finishOsc(emit);
            this.state = ScanState.Ground;
          } else if (b === ESC) {
            // Stay — another ESC; wait for the ST final.
          } else {
            this.osc.length = 0;
            this.state = ScanState.Ground;
          }
          break;
      }
    }
  }

  /**
   * Called when the underlying PTY closes. If an agent was armed, reports it as
   * `exited` exactly once so the UI doesn't leave a stale "working" entry if the
   * shell died mid-command. Idempotent.
   */
  finish(emit: OscTransitionHandler): void {
    if (this.armed) {
      this.disarm();
      emit({ kind: 'exited' });
    }
  }

  private disarm(): void {
    this.armed = false;
    this.status = ArmedStatus.Working;
  }

  /** Dispatch a completed OSC payload to its handler by Ps (the leading code). */
  private finishOsc(emit: OscTransitionHandler): void {
    const body = this.osc;
    this.osc = [];

    const sep = body.indexOf(SEMICOLON);
    const ps = sep === -1 ? body : body.slice(0, sep);
    const pt = sep === -1 ? [] : body.slice(sep + 1);
    const psStr = String.fromCharCode(...ps);

    switch (psStr) {
      case '133':
        this.handleOsc133(pt, emit);
        break;
      case '9':
        // OSC 9;4 is taskbar progress, not a notification.
        if (!this.startsWith(pt, '4;') && String.fromCharCode(...pt) !== '4') {
          this.genericAttention(emit);
        }
        break;
      case '777':
        this.handleOsc777(pt, emit);
        break;
      default:
        break;
    }
  }

  private handleOsc777(pt: number[], emit: OscTransitionHandler): void {
    const ptStr = String.fromCharCode(...pt);
    if (ptStr.startsWith(OMNISCRIBE_MARKER)) {
      const event = ptStr.slice(OMNISCRIBE_MARKER.length);
      switch (event) {
        case 'working':
          this.ensureArmed(emit);
          this.setWorking(emit);
          break;
        case 'attention':
          this.ensureArmed(emit);
          this.status = ArmedStatus.Waiting;
          emit({ kind: 'attention' });
          break;
        case 'finished':
          this.ensureArmed(emit);
          this.status = ArmedStatus.Waiting;
          emit({ kind: 'finished' });
          break;
        default:
          break;
      }
      return;
    }
    this.genericAttention(emit);
  }

  private handleOsc133(pt: number[], emit: OscTransitionHandler): void {
    const first = pt[0];
    if (first === 0x43 /* 'C' */) {
      if (this.armed) {
        return;
      }
      // Strip the "C;" prefix to get the command line.
      const cmd = this.startsWith(pt, 'C;') ? String.fromCharCode(...pt.slice(2)) : '';
      const agent = this.matchAgent(cmd);
      if (agent) {
        this.armed = true;
        this.status = ArmedStatus.Working;
        emit({ kind: 'started', agent });
      }
    } else if (first === 0x44 /* 'D' */ && this.armed) {
      this.disarm();
      emit({ kind: 'exited' });
    }
  }

  /**
   * Self-arm path: an OSC 777 marker can arrive with no preceding 133;C (bash,
   * Windows, tmux, wrappers). Arm and report `started` so the session goes
   * active. Defaults the agent to claude (only our Claude hooks emit this
   * marker).
   */
  private ensureArmed(emit: OscTransitionHandler): void {
    if (!this.armed) {
      this.armed = true;
      this.status = ArmedStatus.Working;
      emit({ kind: 'started', agent: 'claude' });
    }
  }

  private setWorking(emit: OscTransitionHandler): void {
    if (this.status !== ArmedStatus.Working) {
      this.status = ArmedStatus.Working;
      emit({ kind: 'working' });
    }
  }

  private genericAttention(emit: OscTransitionHandler): void {
    if (this.armed) {
      this.status = ArmedStatus.Waiting;
      emit({ kind: 'attention' });
    }
  }

  /**
   * Resolve a command line to a known agent, ignoring leading flags and path
   * prefixes. A token matches an agent when its basename equals the agent name
   * or the agent name followed by a dash (e.g. `claude-enigma`). Wrappers like
   * `npx claude` match on the second token.
   */
  private matchAgent(cmd: string): DetectedAgent | undefined {
    for (const token of cmd.split(/\s+/)) {
      if (token.length === 0 || token.startsWith('-')) {
        continue;
      }
      // Basename: last path segment (handle both / and \).
      const base = token.split(/[/\\]/).pop() ?? token;
      for (const agent of this.agents) {
        if (base.startsWith(agent)) {
          const rest = base.slice(agent.length);
          if (rest.length === 0 || rest.startsWith('-')) {
            return agent as DetectedAgent;
          }
        }
      }
    }
    return undefined;
  }

  /** True when the byte buffer begins with the given ASCII prefix. */
  private startsWith(buf: number[], prefix: string): boolean {
    if (buf.length < prefix.length) {
      return false;
    }
    for (let i = 0; i < prefix.length; i++) {
      if (buf[i] !== prefix.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }
}
