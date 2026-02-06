# Changelog

All notable changes to this project will be documented in this file.

## 0.1.4 (2026-02-06)

### Bug Fixes

- Fix Windows app icon not displaying in taskbar/window — use `.ico` format and remove `signAndEditExecutable` to allow rcedit icon embedding
- Use platform-conditional icon format in BrowserWindow (`.ico` on Windows, `.png` elsewhere)

### DX (Developer Experience)

- Add `scripts/bump-version.sh` for local version bumping (`patch`, `minor`, `major`, or explicit)
- Add `version-sync` CI job to auto-commit bumped package versions back to master after release
- Replace inline version-bump logic in release workflow with shared script
- Harden bump script: anchored semver regex, env-var passing to node, file-existence guards
- Harden release workflow: pass tag name via env var, quote `$GITHUB_OUTPUT`, add Node.js setup to version-sync job
- Clean up GitHub labels: remove 7 unused defaults, add priority/area/platform/type labels
- Update dependabot config to tag PRs with `chore` label

## 0.1.3 (2026-02-06)

### Security

- **[P0]** Fix shell injection: replace `exec()` with `execFile()` in git and GitHub CLI services — arguments are now passed as arrays, preventing shell metacharacter injection
- **[P1]** Bind NestJS backend to `127.0.0.1` instead of `0.0.0.0`, preventing LAN exposure

### Bug Fixes

- **[P2]** Fix socket connection hang when concurrent callers race during initial connect — replaced `setInterval` polling (no timeout) with a pending callers queue and 30-second timeout
- **[P3]** Fix MCP server version drift: version is now injected from `package.json` at build time instead of being hardcoded

### Docs

- Update SECURITY.md to reflect `execFile` with argument arrays

## 0.1.2 (2026-02-06)

### Features

- Toast notifications for auto-update events (available, downloaded, error)
- macOS graceful fallback: directs users to GitHub Releases instead of attempting auto-install (code signing not yet available)
- Reusable Markdown component for rendering HTML release notes from GitHub
- Centralized `GITHUB_RELEASES_URL` in shared constants

### Bug Fixes

- Updater listeners now initialize at app startup instead of only when Settings > About is opened, so the 5-second startup check is no longer missed
- Generic update errors are now surfaced to users instead of being silently swallowed
- Prevent potential listener leak if app unmounts during async initialization

### Improvements

- Centralized platform detection (`IS_MAC`) in shared utility
- Extracted `MacDownloadFallback` component to reduce duplication in About section
- Use project `cn()` utility consistently in Markdown component
- Named constants for toast durations

## 0.1.1 (2026-02-06)

### Bug Fixes

- Add left padding on macOS to prevent traffic light buttons from overlapping tab text
- Hide redundant custom window controls on macOS (native traffic lights suffice)
- Fix app crash (EADDRINUSE) when reopening from macOS dock after closing window
- Fix duplicate IPC handler registration on macOS window recreate

## 0.1.0 (2026-02-05)

### Features

- Multi-session grid: run 1-6 AI coding sessions in parallel with live terminal views
- Real-time session status tracking (idle, working, planning, needs_input, finished, error)
- Git worktree isolation per session for parallel development
- MCP (Model Context Protocol) server integration for Claude Code status reporting
- Project tabs with persistent recent history
- Cross-platform support (Windows, macOS, Linux)
- Discord-style settings modal with 40-theme system
- Per-project theme persistence
- Keyboard shortcuts (N: add session, L: launch all, 1-6: launch individual, Ctrl/Cmd+K: stop all)
- Claude CLI detection and version checking
- GitHub CLI integration with detection and guards
- AI-powered quick actions for git and development workflows
- Welcome view with recent projects
- Idle landing view with greeting and keyboard shortcut hints
- Auto-update system with download progress tracking and user-controlled installation
- Default session mode setting

### Security

- Content Security Policy (CSP) for renderer process
- CORS hardening restricted to localhost origins
- Safe argument passing for CLI commands (execFile with argument arrays)
- Electron security: nodeIntegration disabled, contextIsolation enabled

### Architecture

- Electron + NestJS backend in main process
- React + Zustand frontend with Vite
- Socket.io WebSocket for real-time streaming
- Shared package for cross-environment types and utilities
- Universal logger working across browser, Node.js, and MCP environments
- MCP server bundled as single file via esbuild
