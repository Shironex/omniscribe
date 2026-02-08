# Changelog

All notable changes to this project will be documented in this file.

## 0.4.1 (2026-02-08)

### Improvements

- **Claude CLI update warning** — Added a warning in Settings > Integrations that informs users running the CLI update command will terminate existing Claude Code instances

## 0.4.0 (2026-02-08)

### Features

- **Launch presets modal** — Batch session creation with grid preset cards (2×1, 2×2, 3×2) for quick multi-session setup; opens via Shift+N shortcut
- **MCP task list** — New `omniscribe_tasks` MCP tool lets Claude report its task list to Omniscribe; per-session TaskBadge and TaskListPopover in terminal header show real-time progress
- **Splash screen** — Branded loading screen with logo, version, and spinner; waits for WebSocket, theme, and stores to be ready before fading out
- **Terminal drag handle** — Grip icon on terminal headers for precise drag-and-drop reordering with ghost preview overlay (no more accidental drags on header clicks)
- **Skip-permissions setting** — Global toggle in Settings > Sessions to launch Claude sessions with `--dangerously-skip-permissions`
- **Quick action execution mode** — Choose between paste-only and paste+execute behavior in Settings > Quick Actions
- **Commit & Push quick action** — Combined git action available on AI session terminals
- **Midnight theme** — New dark theme with purple palette
- **Theme persistence** — Inline script in `index.html` applies saved theme instantly, eliminating flash-of-wrong-theme on startup

### Improvements

- Quick action buttons now hidden on plain terminals (only shown on AI sessions)
- Skip-permissions badge shown on terminal header when enabled
- CI now runs on version branches in addition to master
- Extracted `useAppVersion` hook for dynamic version display

### Stats

- 39 commits across 7 PRs
- 78 files changed — +2,592 / −253 lines

## 0.3.2 (2026-02-07)

### Bug Fixes

- **MCP server crash in dev mode** — `__VERSION__` was only injected by esbuild during production builds, causing `ReferenceError` in dev. Added `getVersion()` fallback that reads `package.json` at runtime.
- **MCP server duplicate shebang** — production bundle had two shebangs (source + esbuild banner) causing `SyntaxError: Invalid or unexpected token`. Removed shebang from source since esbuild handles it.

## 0.3.1 (2026-02-07)

### Bug Fixes

- **Rate limiting too aggressive** — WebSocket throttle limits (10/s, 50/10s) caused `Too Many Requests` errors during normal desktop usage. Increased to 100/s and 500/10s, and added `@SkipThrottle()` to core session/workspace handlers since this is a single-user desktop app.
- **Default AI mode not persisting across restart** — Backend electron-store defaults were missing `session: DEFAULT_SESSION_SETTINGS`, causing the preference to be lost on restart. Also fixed a race condition in `usePreLaunchSlots` where `claudeCliStatus === null` (still loading) incorrectly forced plain mode.
- **No UI feedback on rate limiting** — Added `ws:throttled` event emission from `WsThrottlerGuard` to the client, with toast notification via the connection store.
- **Deep-merge preferences on upgrade** — Existing user preferences are now preserved when new defaults are added, instead of being overwritten.
- **Early Claude CLI detection** — Detect CLI installation status at startup so pre-launch slots default to the correct AI mode immediately.

## 0.3.0 (2026-02-07) — _Upgrade to 0.3.1_

### Security & Hardening

- **Electron sandbox & fuses** — enable sandbox on all renderers, configure Electron fuses to disable Node.js in renderer, block remote code execution
- **Permission handlers** — deny all permission requests (camera, mic, geolocation, etc.) and block external navigation
- **Environment variable sanitization** — allowlist + blocklist patterns prevent secrets from leaking to spawned terminal processes
- **WebSocket rate limiting** — two-tier throttling (10/sec burst, 50/10sec sustained) on all 6 gateways via `@nestjs/throttler`
- **Session concurrency guard** — server-side enforcement of 12-session cap with disabled UI button and toast feedback

### Resilience & Recovery

- **Connection State Recovery** — 30-second recovery window with automatic session state rehydration on reconnect
- **Reconnection overlay** — visual feedback during disconnects: spinner while reconnecting, retry button on failure, brief "Reconnected" flash on success
- **Terminal backpressure** — PTY pause/resume based on socket drain state (16KB high-water mark) with cancel button for buffered output
- **Health check service** — 2-minute sweeps detect zombie PTY processes; three-tier health model (healthy/degraded/failed) with status dots and tooltips
- **MCP config write serialization** — per-file mutex via `async-mutex` eliminates `.mcp.json` corruption from concurrent writes
- **Socket listener timing fix** — `initListeners()` before `connectSocket()` ensures initial state fetch is never missed

### Observability

- **Structured JSON file logging** — rotating log files (10MB max, 7-day retention) with automatic cleanup
- **Open Log Folder** — button in Settings > Diagnostics for quick access to log directory
- **Startup security audit log** — logs sandbox status, fuse configuration, and permission handler registration on launch

### State Management

- **Unified terminal store** — merged `useTerminalControlStore` + `useTerminalSettingsStore` into single `useTerminalStore`
- **Devtools middleware on all stores** — 103 named actions across 10 Zustand stores with `storeName/actionName` convention for Redux DevTools

### Testing

- **E2E test suite** — 10 Playwright tests with Electron launch fixture: smoke, session create/launch, 12-session cap, project tabs, reconnection overlay
- **WebSocket integration tests** — 38 tests across all 6 gateways with real socket.io connections
- **CI pipeline** — 7-stage pipeline: format → lint → typecheck → unit test → integration → build → E2E
- **969 total tests** — 884 unit + 37 MCP + 38 integration + 10 E2E, all passing

### UX Improvements

- **CLI-aware session mode** — defaults to Plain when Claude CLI is unavailable; disables Claude option with tooltip explaining why
- **Session health indicators** — colored status dots on session cards with contextual tooltips
- **Backpressure indicator** — visual feedback when terminal output is buffered, with cancel action

### Dependencies

- Upgrade ESLint to v9, Vite to v7, Zod to v4
- Bump 15+ safe/medium-risk dependencies to latest

### DX (Developer Experience)

- Condition-based E2E waits replacing all `waitForTimeout()` calls
- Named devtools actions for socket store utilities
- `data-testid` attributes on key UI components for test targeting

## 0.2.0 (2026-02-06)

### Features

- **Max 12 sessions** — increased from 6 to 12 parallel AI sessions
- **Drag-and-drop reordering** — rearrange terminals by dragging via `@dnd-kit`
- **Terminal search** — Ctrl+Shift+F opens search bar with regex and case-sensitive modes
- **11 terminal color themes** — tokyonight, dark, light, dracula, nord, monokai, gruvbox, catppuccin, onedark, solarized, github-light
- **Terminal settings UI** — font family/size, cursor style/blink, scrollback lines, theme picker in Settings modal
- **Resizable panels** — drag dividers between terminals (replaces CSS grid)
- **WebGL rendering** — GPU-accelerated terminal rendering with automatic canvas fallback
- **Smart copy/paste** — Ctrl+C copies selection or sends ^C; Ctrl+V pastes from clipboard
- **File path link detection** — clickable paths (e.g. `src/main.ts:42`) open in VS Code
- **Spatial pane navigation** — Ctrl+Alt+Arrow keys to move focus between terminals
- **Error boundary** — crash recovery UI with restart button per terminal
- **OS-specific font defaults** — Cascadia Code (Windows), SF Mono (macOS), Ubuntu Mono (Linux)

### Performance

- **Chunk-based output batching** (4ms/4KB) replacing naive 16ms flush for smoother streaming
- **Scrollback buffer** (50KB per session) for reconnect replay when rejoining a terminal
- **Serialized write queue** with large-write chunking prevents input interleaving
- **Resize deduplication** with 150ms debounce
- **Shutdown guard** prevents callbacks during app teardown
- **Bounded output buffer** (100KB cap) prevents memory leaks from long-running processes
- **Large paste handling** with chunked writes to prevent UI freezes

### Validation & Safety

- **Payload validation** — type checks, 1MB input size limit, dimension validation on resize

### Refactoring

- Extract **14 hooks**, **9 components**, and **4 utility files** from 8 oversized frontend components (~1,500 lines reduced)
- TerminalView: 557 → 187 lines (6 extracted hooks: settings, search, resize, keyboard, connection, initialization)
- TerminalGrid: 492 → 245 lines (layout utils, TerminalCard, PreLaunchSection, DnD hook, panel resize hook)
- TerminalHeader + App: 352+322 → 135+195 lines (QuickActionsDropdown, MoreMenuDropdown, SessionStatusDisplay, keyboard shortcuts hook)
- IntegrationsSection + Sidebar: 495+278 → 114+247 lines (ClaudeCliStatusCard, ClaudeAuthCard, InstallCommandDisplay, useSidebarResize)
- UsagePopover + WelcomeView: 314+220 → 218+194 lines (date-utils, path-utils, ProgressBar, UsageCard)

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
