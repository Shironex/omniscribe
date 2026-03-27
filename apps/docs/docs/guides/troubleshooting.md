---
sidebar_position: 2
---

# Troubleshooting

Common issues and their solutions. If your problem is not listed here, check the [GitHub Issues](https://github.com/Shironex/omniscribe/issues) page or open a new issue.

## Claude CLI Not Detected

**Symptoms:** New sessions default to Plain mode. The Claude option is disabled with a tooltip saying the CLI is not found.

**Solutions:**

- Ensure the `claude` command works in your regular terminal. Open a terminal outside of Omniscribe and run `claude --version`.
- If you just installed the CLI, restart Omniscribe so it can re-detect it at startup.
- Check that the Claude CLI is authenticated. Run `claude` in your terminal and complete the authentication flow if prompted.
- On macOS, Omniscribe reads `~/.claude/.credentials.json` as a fallback for authentication detection. Verify this file exists after authenticating.

## Terminal Freezing or "Buffering output..." Overlay

**Symptoms:** A terminal pane shows a "Buffering output..." overlay and appears frozen.

**Solutions:**

- This happens when AI output is extremely fast and triggers the backpressure system. The overlay should resolve automatically within approximately 10 seconds.
- If the overlay persists, the session may be stuck. Use the terminal header dropdown menu to kill the session, then relaunch it.
- Since v0.7.1, backpressure thresholds have been tuned to reduce false triggers during normal usage.

## Sessions Stuck in "Connecting" State

**Symptoms:** A session shows "Connecting" or "Starting" status and never progresses.

**Solutions:**

- Check your internet connection. Claude Code requires an active connection to Anthropic's API.
- Verify that your Claude CLI authentication is still valid. Tokens can expire.
- Try killing the session from the terminal header menu and relaunching it.

## Auto-Update Not Working on macOS

**Symptoms:** Omniscribe detects an update and downloads it, but the installation step fails silently on macOS.

**Explanation:** Omniscribe is not code-signed with an Apple Developer certificate. macOS blocks the auto-install step for unsigned applications.

**Workaround:** Download updates manually from the [GitHub Releases page](https://github.com/Shironex/omniscribe/releases). When an update is detected, the app will show a link to the releases page on macOS instead of attempting auto-install.

## "Too Many Requests" Errors

**Symptoms:** Toast notification saying "Too many requests" or WebSocket operations being throttled.

**Solutions:**

- This can happen if WebSocket rate limits are hit during heavy usage. The default limits are generous (100 requests/second, 500 requests/10 seconds).
- If you encounter this, try reducing the number of active sessions temporarily.
- Core session and workspace handlers have rate limiting skipped since v0.3.1, so this should be rare during normal usage.

## App Won't Open on macOS (Unsigned)

**Symptoms:** macOS shows a warning that the app "can't be opened because Apple cannot check it for malicious software."

**Solutions:**

- **First launch:** Right-click the application and select "Open" from the context menu, then click "Open" in the dialog.
- **Alternative:** Go to System Preferences > Security & Privacy > General, and click "Open Anyway" next to the blocked app message.
- You only need to do this once. Subsequent launches will work normally.

## Port Conflict (EADDRINUSE)

**Symptoms:** Omniscribe fails to start with an EADDRINUSE error.

**Solutions:**

- Since v0.7.0, Omniscribe uses dynamic port binding (`listen(0)`), which lets the OS assign an available port. This error should not occur in current versions.
- If it does occur, close any other running Omniscribe instances and try again.
- On macOS, closing the window does not quit the app. Check the Dock for a running instance and quit it before relaunching.

## Worktree Creation Fails

**Symptoms:** A toast notification appears saying worktree creation failed when launching a session with a branch.

**Solutions:**

- Ensure git is installed and accessible from your PATH.
- Verify that the current project directory is a valid git repository.
- Check that the target branch name exists or is a valid new branch name.
- The toast notification includes the specific error message from git, which can help identify the issue.

## Shell PATH Not Inherited

**Symptoms:** Sessions cannot find commands like `node`, `git`, or `claude` even though they work in your regular terminal.

**Solutions:**

- This was fixed in v0.6.0. If you are on an older version, update Omniscribe.
- If the issue persists on v0.6.0+, ensure your shell profile (`~/.zshrc`, `~/.bashrc`, or `~/.bash_profile`) exports PATH correctly. Omniscribe reads the user's shell PATH on macOS.

## Clipboard Copy Not Working on Windows

**Symptoms:** Copying text from the terminal does nothing on Windows.

**Solutions:**

- This was fixed in v0.5.1 by switching to Electron's native clipboard module.
- If you are on an older version, update Omniscribe.

## Viewing Logs for Debugging

If none of the above solutions help, check the application logs for more details:

1. Open **Settings > General/About > Diagnostics**
2. Click **"Open Log Folder"** to access the raw log files
3. Or click **"View Logs"** to browse and inspect log entries directly in the app

Log files are in JSONL format with structured entries including timestamps, log levels, and context names. Logs rotate automatically at 10MB and are retained for 7 days.
