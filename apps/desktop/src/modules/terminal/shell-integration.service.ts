import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger, extractErrorMessage, normalizePath } from '@omniscribe/shared';

/**
 * App-owned shell integration for PLAIN shell sessions.
 *
 * AI provider sessions (claude/codex) arm the OSC agent detector via their own
 * hooks. A PLAIN interactive shell (zsh/bash) emits nothing, so its status
 * detection is blind. This service materializes per-shell rc snippets into an
 * APP-OWNED directory (Electron `userData/shell-integration/`) — never into the
 * project or the user's home — and decorates the spawn so the shell sources our
 * snippet after the user's real config.
 *
 * The snippets emit OSC sequences the {@link OscAgentDetector} already consumes:
 *
 *  - `OSC 133;A`             — prompt start (precmd)
 *  - `OSC 133;B`             — command line read / prompt end (preexec)
 *  - `OSC 133;C;<cmd>`       — command start, carrying the command line (preexec)
 *  - `OSC 133;D;<exit>`      — command finished with exit status (precmd)
 *  - `OSC 777;notify;omniscribe;working` — emitted ONCE at shell init, BEL
 *    terminated, gated on `$OMNISCRIBE_SESSION_ID`, to self-arm the detector so
 *    a plain shell session goes "active" even before the first command.
 *
 * Design constraints:
 *  - **Idempotent + versioned**: snippet content is hashed; we only rewrite when
 *    the hash changes (or the file is missing/corrupt).
 *  - **App-owned only**: writes go exclusively to `userData/shell-integration/`,
 *    so this is NOT gated by project passive mode (which only governs writes
 *    INTO the project).
 *  - **Failure-safe**: any error materializing scripts → warn and spawn the
 *    shell UNMODIFIED. Shell integration is best-effort; it must never block a
 *    session.
 *  - **zsh / bash only**: any other shell (fish, sh, pwsh, cmd, …) spawns
 *    unchanged.
 *
 * Adapted in spirit from terax-ai's `pty/shell_init.rs` (per-shell rc files in
 * an app cache dir, chain-sourcing the real rc, only-if-changed writes).
 */

/** Bump when the rc snippet content format changes (forces a rewrite). */
const SHELL_INTEGRATION_VERSION = 1;

/** App-owned subdirectory under Electron `userData`. */
const SHELL_INTEGRATION_DIR = 'shell-integration';

/** Supported shells. Anything else spawns unmodified. */
type SupportedShell = 'zsh' | 'bash';

/** The decorated spawn parameters returned to the terminal service. */
export interface ShellIntegrationDecoration {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/**
 * Marker line written at the top of each generated rc file. Lets a human (and a
 * future cleanup pass) recognize app-owned files, and carries the version so a
 * stale file is obvious.
 */
function bannerFor(shell: SupportedShell): string {
  return `# Omniscribe shell integration (${shell}) — v${SHELL_INTEGRATION_VERSION}\n# Auto-generated. App-owned; safe to delete. Do not edit (regenerated on launch).\n`;
}

/**
 * zsh integration.
 *
 * Spawned with `ZDOTDIR` pointing at our dir, so zsh reads OUR `.zshrc`. We must
 * first source the user's real config from their ORIGINAL ZDOTDIR (or $HOME),
 * then install precmd/preexec hooks that emit the OSC marks.
 *
 * `.zshenv` runs for every zsh (incl. non-interactive); we restore the user's
 * ZDOTDIR there so any further zsh startup files resolve against the real dir.
 */
// NOTE: shell snippets are authored as arrays of single-quoted JS strings
// joined by '\n'. Single-quoted strings avoid JS template `${...}` interpolation
// (the shell scripts are FULL of `${VAR}` expansions) and let us write the
// literal escape `\\033` / `\\007` that printf needs for OSC (ESC) / BEL.
const ZSHRC_BODY = [
  '',
  "# --- Source the user's real zsh config first -------------------------------",
  '# Their original ZDOTDIR (captured into OMNISCRIBE_USER_ZDOTDIR by .zshenv),',
  '# falling back to $HOME. Source the standard interactive startup files.',
  '() {',
  '  emulate -L zsh',
  '  local userZdotdir="${OMNISCRIBE_USER_ZDOTDIR:-$HOME}"',
  "  # Restore ZDOTDIR so the user's own config (and anything it spawns) sees the",
  '  # real location, not ours.',
  '  if [[ -n "$OMNISCRIBE_USER_ZDOTDIR" ]]; then',
  '    export ZDOTDIR="$OMNISCRIBE_USER_ZDOTDIR"',
  '  else',
  '    unset ZDOTDIR',
  '  fi',
  '  [[ -f "$userZdotdir/.zshrc" ]] && source "$userZdotdir/.zshrc"',
  '}',
  '',
  '# --- Omniscribe OSC shell integration --------------------------------------',
  '# Guard against double-install (e.g. an inner shell re-sourcing this file).',
  'if [[ -z "$OMNISCRIBE_SHELL_INTEGRATION_ACTIVE" ]]; then',
  '  export OMNISCRIBE_SHELL_INTEGRATION_ACTIVE=1',
  '',
  '  __omniscribe_osc() { printf \'\\033]%s\\007\' "$1"; }',
  '',
  '  # precmd: prompt is about to be drawn. Emit D;<exit> for the just-finished',
  '  # command (if any), then A for prompt-start.',
  '  __omniscribe_precmd() {',
  '    local exit=$?',
  '    if [[ -n "$__omniscribe_executing" ]]; then',
  '      __omniscribe_osc "133;D;$exit"',
  '      unset __omniscribe_executing',
  '    fi',
  '    __omniscribe_osc "133;A"',
  '  }',
  '',
  '  # preexec: a command line was accepted and is about to run. Emit B (command',
  '  # read), then C;<cmd> (command start) carrying the command line.',
  '  __omniscribe_preexec() {',
  '    __omniscribe_osc "133;B"',
  '    __omniscribe_osc "133;C;$1"',
  '    __omniscribe_executing=1',
  '  }',
  '',
  '  autoload -Uz add-zsh-hook 2>/dev/null',
  '  if (( $+functions[add-zsh-hook] )); then',
  '    add-zsh-hook precmd __omniscribe_precmd',
  '    add-zsh-hook preexec __omniscribe_preexec',
  '  else',
  '    precmd_functions+=(__omniscribe_precmd)',
  '    preexec_functions+=(__omniscribe_preexec)',
  '  fi',
  '',
  '  # Self-arm the detector once at init (only inside an Omniscribe session).',
  '  if [[ -n "$OMNISCRIBE_SESSION_ID" ]]; then',
  '    __omniscribe_osc "777;notify;omniscribe;working"',
  '  fi',
  'fi',
  '',
].join('\n');

/**
 * `.zshenv` for our ZDOTDIR. Runs first, for every zsh. Capture the user's
 * original ZDOTDIR (so `.zshrc` can source their real config), restore it, and
 * source the user's real `.zshenv` so env-affecting config still applies.
 */
const ZSHENV_BODY = [
  '',
  "# Capture & restore the user's real ZDOTDIR so further zsh startup resolves",
  "# against their config, not Omniscribe's.",
  'export OMNISCRIBE_USER_ZDOTDIR="${OMNISCRIBE_USER_ZDOTDIR:-${ZDOTDIR:-$HOME}}"',
  'if [[ -f "$OMNISCRIBE_USER_ZDOTDIR/.zshenv" ]]; then',
  '  ZDOTDIR="$OMNISCRIBE_USER_ZDOTDIR" source "$OMNISCRIBE_USER_ZDOTDIR/.zshenv"',
  'fi',
  '',
].join('\n');

/**
 * bash integration. Spawned with `--rcfile <ourbashrc>` (which suppresses the
 * default ~/.bashrc), so we source the user's ~/.bashrc first, then install
 * PROMPT_COMMAND (precmd-equivalent) + a DEBUG trap (preexec-equivalent).
 */
const BASHRC_BODY = [
  '',
  "# --- Source the user's real bash config first ------------------------------",
  'if [ -f "$HOME/.bashrc" ]; then',
  '  source "$HOME/.bashrc"',
  'fi',
  '',
  '# --- Omniscribe OSC shell integration --------------------------------------',
  'if [ -z "$OMNISCRIBE_SHELL_INTEGRATION_ACTIVE" ]; then',
  '  export OMNISCRIBE_SHELL_INTEGRATION_ACTIVE=1',
  '',
  '  __omniscribe_osc() { printf \'\\033]%s\\007\' "$1"; }',
  '',
  '  # precmd-equivalent: runs right before each prompt. Emit D;<exit> for the',
  '  # finished command, then A for prompt-start. Must run FIRST so $? is the',
  "  # real command's exit code.",
  '  __omniscribe_precmd() {',
  '    local exit=$?',
  '    if [ -n "$__omniscribe_executing" ]; then',
  '      __omniscribe_osc "133;D;$exit"',
  '      unset __omniscribe_executing',
  '    fi',
  '    __omniscribe_osc "133;A"',
  '  }',
  '',
  '  # preexec-equivalent via DEBUG trap. Fires before each simple command. Guard',
  '  # so it only marks the first command of a line (not every sub-command) and',
  '  # skips our own PROMPT_COMMAND invocation.',
  '  __omniscribe_preexec() {',
  '    [ -n "$COMP_LINE" ] && return            # completion, not a real command',
  '    [ "$BASH_COMMAND" = "$PROMPT_COMMAND" ] && return',
  '    [ -n "$__omniscribe_executing" ] && return',
  '    __omniscribe_osc "133;B"',
  '    __omniscribe_osc "133;C;$BASH_COMMAND"',
  '    __omniscribe_executing=1',
  '  }',
  '',
  '  # Chain our precmd ahead of any existing PROMPT_COMMAND.',
  '  case "$PROMPT_COMMAND" in',
  '    *__omniscribe_precmd*) : ;;',
  '    "") PROMPT_COMMAND="__omniscribe_precmd" ;;',
  '    *) PROMPT_COMMAND="__omniscribe_precmd;$PROMPT_COMMAND" ;;',
  '  esac',
  '',
  "  trap '__omniscribe_preexec' DEBUG",
  '',
  '  # Self-arm the detector once at init (only inside an Omniscribe session).',
  '  if [ -n "$OMNISCRIBE_SESSION_ID" ]; then',
  '    __omniscribe_osc "777;notify;omniscribe;working"',
  '  fi',
  'fi',
  '',
].join('\n');

@Injectable()
export class ShellIntegrationService {
  private readonly logger = createLogger('ShellIntegration');

  /** Cached app-owned dir; resolved lazily on first use. */
  private resolvedDir: string | null = null;

  /**
   * Decorate a spawn so the shell loads our integration snippet AFTER the
   * user's real config. Returns the (possibly augmented) command/args/env.
   *
   * Failure-safe: on ANY error — unsupported shell, fs failure, missing
   * userData — returns the ORIGINAL spawn unchanged so a session never fails to
   * start because of shell integration.
   *
   * @param command Resolved shell executable (e.g. `/bin/zsh`).
   * @param args    Spawn args (e.g. `['-i']`).
   * @param env     Already-sanitized spawn env (post `buildSafeEnv`).
   */
  decorate(
    command: string,
    args: string[],
    env: Record<string, string>
  ): ShellIntegrationDecoration {
    const original: ShellIntegrationDecoration = { command, args, env };

    try {
      const shell = this.detectShell(command);
      if (!shell) {
        return original;
      }

      const dir = this.ensureDir();
      if (!dir) {
        return original;
      }

      if (shell === 'zsh') {
        return this.decorateZsh(dir, command, args, env);
      }
      return this.decorateBash(dir, command, args, env);
    } catch (error) {
      this.logger.warn(
        `Shell integration disabled for this session: ${extractErrorMessage(error)}`
      );
      return original;
    }
  }

  /**
   * Resolve a shell executable path to one of the supported shells, or
   * `undefined` for anything we don't integrate with. Uses the basename so
   * `/usr/local/bin/zsh`, `/bin/bash`, etc. all match; `.exe` is stripped for
   * safety though zsh/bash integration is POSIX-only in practice.
   */
  private detectShell(command: string): SupportedShell | undefined {
    const base = (normalizePath(command.toLowerCase()).split('/').pop() ?? '').replace('.exe', '');
    if (base === 'zsh') return 'zsh';
    if (base === 'bash') return 'bash';
    return undefined;
  }

  private decorateZsh(
    dir: string,
    command: string,
    args: string[],
    env: Record<string, string>
  ): ShellIntegrationDecoration {
    this.writeIfChanged(path.join(dir, '.zshrc'), bannerFor('zsh') + ZSHRC_BODY);
    this.writeIfChanged(path.join(dir, '.zshenv'), bannerFor('zsh') + ZSHENV_BODY);

    // Capture the user's original ZDOTDIR (if any) so our .zshenv/.zshrc can
    // chain-source their real config, then point ZDOTDIR at our dir.
    const nextEnv: Record<string, string> = { ...env };
    const userZdotdir = env.ZDOTDIR ?? process.env.ZDOTDIR;
    if (userZdotdir) {
      nextEnv.OMNISCRIBE_USER_ZDOTDIR = userZdotdir;
    }
    nextEnv.ZDOTDIR = dir;

    // Args are unchanged for zsh — ZDOTDIR drives startup-file resolution.
    return { command, args, env: nextEnv };
  }

  private decorateBash(
    dir: string,
    command: string,
    args: string[],
    env: Record<string, string>
  ): ShellIntegrationDecoration {
    const rcfile = path.join(dir, 'bashrc');
    this.writeIfChanged(rcfile, bannerFor('bash') + BASHRC_BODY);

    // Inject `--rcfile <ourbashrc>` while preserving the interactive flag. We
    // splice it in rather than appending so `-i` stays present. Avoid touching
    // login-shell semantics: bash reads --rcfile only for interactive non-login
    // shells, which is the plain-session case (`-i`).
    const nextArgs = this.injectBashRcfile(args, rcfile);
    return { command, args: nextArgs, env: { ...env } };
  }

  /**
   * Insert `--rcfile <file>` into bash args without disturbing existing flags.
   * If `--rcfile` is already present (shouldn't happen for plain sessions) we
   * leave args untouched to avoid fighting an explicit caller choice.
   */
  private injectBashRcfile(args: string[], rcfile: string): string[] {
    if (args.includes('--rcfile')) {
      return [...args];
    }
    return [...args, '--rcfile', rcfile];
  }

  /**
   * Resolve (and create) the app-owned integration directory under Electron
   * `userData`. Returns `null` if Electron's `app` is unavailable (e.g. tests
   * without an electron mock) — caller then spawns unmodified.
   *
   * Lazy `require('electron')` mirrors WorkspaceService: a static import would
   * force every transitive spec to mock electron.
   */
  private ensureDir(): string | null {
    if (this.resolvedDir) {
      return this.resolvedDir;
    }

    const { app } = require('electron') as typeof import('electron');
    const userData = app.getPath('userData');
    if (!userData) {
      return null;
    }

    const dir = path.join(userData, SHELL_INTEGRATION_DIR);
    fs.mkdirSync(dir, { recursive: true });
    this.resolvedDir = dir;
    return dir;
  }

  /**
   * Write `content` to `filePath` only when it differs from what's on disk
   * (compared by content hash). Idempotent: repeated launches with unchanged
   * content perform no write. A read failure (missing/corrupt) forces a write.
   */
  private writeIfChanged(filePath: string, content: string): void {
    const want = this.hash(content);

    // A read failure (missing/corrupt) leaves `have` undefined → forces a write.
    let have: string | undefined;
    try {
      have = this.hash(fs.readFileSync(filePath, 'utf8'));
    } catch {
      // intentionally left as undefined — file is missing or unreadable.
    }

    if (have === want) {
      return;
    }

    fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });
    this.logger.debug(`Materialized shell integration: ${filePath}`);
  }

  private hash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
