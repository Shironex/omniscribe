# Changelog

All notable changes to this project will be documented in this file.

## 1.1.0 (2026-02-26)

### Features

- **Plugin system architecture** — Extensible provider plugin framework with `@omniscribe/plugin-api` package defining backend/frontend interfaces, base classes, and extension points (#179)
- **Plugin runtime infrastructure** — PluginModule with registry, loader, storage services, gateway, and IPC bridge for managing plugin lifecycle (#179)
- **Claude provider plugin** — Extracted all Claude-specific services (CLI detection, command builder, session launcher, usage fetcher, status parser) into `@omniscribe/provider-claude` plugin package (#179)
- **Codex provider plugin** — New `@omniscribe/provider-codex` plugin with CLI detection, command builder, usage fetcher/parser, settings UI, and custom themes (#179)
- **Frontend plugin framework** — ExtensionSlot components, FrontendPluginContext factory, plugin UI SDK, runtime theme injection, and plugin initialization hook (#179)
- **Dynamic settings & marketplace** — Registry-driven settings navigation with per-plugin sections and a marketplace UI for managing providers (#179)
- **Multi-provider usage popover** — Tabbed usage popover showing per-provider usage data with provider-specific panels (#179)
- **Documentation site** — Docusaurus-powered docs with architecture guides, feature docs, SDK reference, and download page (#179)
- **Pill-shaped workspace tabs** — Redesigned workspace tabs with pill-shaped styling for a cleaner look (#206)

### Bug Fixes

- **Plugin theme cascade** — Handle plugin theme classes in `applyThemeToDOM` and Sonner toast provider (#179)
- **Mode picker cleanup** — Hide disabled providers from mode picker dropdowns (#179)
- **Extension UI refresh** — Update extension UI when toggling providers on/off (#179)
- **CI plugin builds** — Build plugin packages before typecheck and tests, add missing frontend dependencies (#179)
- **Plugin arbitrary execution** — Add method allowlist to prevent arbitrary code execution via `plugin:invoke` event (#191)
- **Plugin deactivation lifecycle** — Fix broken deactivation lifecycle causing context leaks, missing cleanup, and no shutdown hooks (#192)
- **Plugin theme lookup** — Fix theme Map lookup mismatch in 3 locations causing themes to not apply correctly (#193)
- **Plugin CSS injection** — Sanitize plugin theme CSS to block `expression()` and scope SDK socket access (#199)
- **Theme-aware status colors** — Replace hardcoded colors with theme-aware CSS variables and add `--status-pending`/`--status-accent` to all 26 theme files (#203)
- **Terminal double paste** — Prevent double paste on Ctrl+V by adding `e.preventDefault()` (#204)
- **UI spacing and task pills** — Improve spacing, task pill styling, and fix window corner artifacts (#205)
- **Codex usage panel theme colors** — Codex usage popover now uses theme-aware colors via shared `getStatusInfo`/`UsageCard` utilities instead of hardcoded hex values, matching Claude usage panel behavior across all themes
- **Weekly usage parsing** — Fix Claude Code v2.1.49 TUI rendering word separators as `ESC[nC` instead of spaces, causing 0% usage display
- **CI workflow permissions** — Add missing `permissions` blocks to workflow files (#217, #218)

### Refactoring

- **Shared CLI utilities** — Extract shared CLI utilities from provider plugins into `@omniscribe/shared/node` sub-path (#200)
- **Plugin backend quality** — Improve validation, socket cleanup, and registry encapsulation in plugin backend (#201)
- **Plugin store frontend** — Reduce plugin store boilerplate, fix non-reactive selectors, and fix ExtensionSlot over-subscription (#202)

### Testing

- **Plugin infrastructure tests** — Unit tests for PluginRegistryService, PluginStorageService, PluginLoaderService, and PluginGateway (#179)
- **Claude provider tests** — Leaf service and plugin class unit tests for Claude provider (#179)
- **Codex provider tests** — Comprehensive backend service tests for Codex provider (#179)
- **Updated delegation tests** — Updated session module, usage, and guard tests for plugin delegation (#179)

### Stats

- 14 PRs merged (99 commits)
- 263 files changed — +39,208 / −10,614 lines

## 1.0.0 (2026-02-18)

### Features

- **Terminal copy/paste improvements** — Improved copy/paste behavior and output handling in terminal sessions with proper clipboard permission support in Electron (#171)
- **Drag-and-drop project tabs** — Reorder project tabs via drag-and-drop for custom workspace organization (#166)

### Bug Fixes

- **Splash screen theme colors** — Splash screen now uses theme system colors instead of hardcoded values, matching the active theme (#172)
- **Granular tab status** — Project tabs now show granular session status instead of a generic indicator (#169)

### Stats

- 4 PRs merged
- 30 files changed — +1,170 / −157 lines

## 0.10.0 (2026-02-17)

### Features

- **Preserve terminal output on tab switch** — Terminal instances are now hidden via CSS instead of destroyed when switching project tabs, eliminating output loss; hidden terminals pause rendering to save CPU/GPU and flush buffered output on restore (#165)
- **Open in Editor** — New "Open in Editor" option in the session terminal dropdown menu opens the session's worktree path (or project root) in your preferred code editor (#157, closes #62)
- **Auto-detect editor for file links** — Automatically detects installed editors (VS Code, VS Code Insiders, Cursor) and uses the correct protocol for clickable file path links in terminal output; configurable in Settings > Terminal (#156)

### Bug Fixes

- **Session status stuck at Done** — Expanded state machine transitions so `finished`, `error`, and `disconnected` states can transition back to active states, fixing the UI staying stuck at "Done" when Claude resumes work via MCP status updates (#164)

### Performance

- **Backend scrollback buffer** — Increased from 50KB to 500KB per session as a safety net for edge cases; hidden terminal write buffer capped at 1MB to prevent unbounded memory growth (#165)

### Dependencies

- Upgrade `vitest` from v3 to v4 and `jsdom` from v25 to v28 (#163)
- Bump `lucide-react`, `react-resizable-panels`, and `tailwind-merge` to latest (#163)

### Stats

- 5 PRs merged
- 42 files changed — +1,698 / −602 lines

## 0.9.0 (2026-02-15)

### Features

- **Rename terminal sessions** — Double-click a terminal session title to rename it inline (#155)
- **Debug logging (backend)** — Added structured debug logging to all backend services and gateways for improved observability (#139)
- **Debug logging (frontend)** — Added debug logging to frontend stores, hooks, and MCP tools (#150)

### Bug Fixes

- **MCP server production build** — Use CJS format for MCP server production bundle and update entry script reference to `index.cjs` (#154)
- **Silent catch blocks** — Eliminated silent catch blocks across the codebase and preserved error stack traces for better debugging (#134)
- **Toast theme colors** — Toasts now follow the active theme colors instead of using hardcoded dark/light values (#118)

### Refactoring

- **Split large frontend components** — Decomposed TopBar, SessionHistoryPanel, and TerminalGrid into smaller, focused components (#141)
- **Split SessionService** — Broke monolithic SessionService into focused, single-responsibility services (#137)
- **Split GitGateway** — Extracted shared validation utilities from GitGateway (#136)
- **Extract UsageOutputParser** — Separated output parsing logic from UsageService (#138)
- **Store concerns & type safety** — Fixed store responsibility boundaries, improved type safety, and standardized error handling (#147)
- **Simplify complex hooks** — Extracted sub-hooks and pure functions from overly complex hooks (#146)
- **Shadcn component migration** — Replaced raw HTML form elements with shadcn components in SessionHistoryFilters (#145)
- **cn() utility migration** — Migrated raw clsx/twMerge imports to the project's cn() utility (#144)

### Testing

- **IPC security tests** — Added unit tests for security-critical IPC handlers and utilities (#133)
- **Shared package tests** — Added tests for shared package utilities (logger, error, format, path) (#135)
- **Main process tests** — Added unit tests for backend main process utilities (#140)
- **Frontend component tests** — Added component tests for ErrorBoundary, TopBar, SessionHistory, LaunchModal, TerminalHeader (#148)
- **Frontend lib & hook tests** — Added tests for lib utilities and hooks (#149)

### Stats

- 19 PRs merged
- 174 files changed — +11,813 / −3,185 lines

## 0.8.1-beta.1 (2026-02-15)

### Features

- **Debug logging (backend)** — Added structured debug logging to all backend services and gateways for improved observability (#139)
- **Debug logging (frontend)** — Added debug logging to frontend stores, hooks, and MCP tools (#150)

### Bug Fixes

- **Silent catch blocks** — Eliminated silent catch blocks across the codebase and preserved error stack traces for better debugging (#134)
- **Toast theme colors** — Toasts now follow the active theme colors instead of using hardcoded dark/light values (#118)

### Refactoring

- **Split large frontend components** — Decomposed TopBar, SessionHistoryPanel, and TerminalGrid into smaller, focused components (#141)
- **Split SessionService** — Broke monolithic SessionService into focused, single-responsibility services (#137)
- **Split GitGateway** — Extracted shared validation utilities from GitGateway (#136)
- **Extract UsageOutputParser** — Separated output parsing logic from UsageService (#138)
- **Store concerns & type safety** — Fixed store responsibility boundaries, improved type safety, and standardized error handling (#147)
- **Simplify complex hooks** — Extracted sub-hooks and pure functions from overly complex hooks (#146)
- **Shadcn component migration** — Replaced raw HTML form elements with shadcn components in SessionHistoryFilters (#145)
- **cn() utility migration** — Migrated raw clsx/twMerge imports to the project's cn() utility (#144)

### Testing

- **IPC security tests** — Added unit tests for security-critical IPC handlers and utilities (#133)
- **Shared package tests** — Added tests for shared package utilities (logger, error, format, path) (#135)
- **Main process tests** — Added unit tests for backend main process utilities (#140)
- **Frontend component tests** — Added component tests for ErrorBoundary, TopBar, SessionHistory, LaunchModal, TerminalHeader (#148)
- **Frontend lib & hook tests** — Added tests for lib utilities and hooks (#149)

## 0.8.0 (2026-02-14)

### Features

- **In-app log file viewer** — New "View Logs" button in Settings > About > Diagnostics opens a two-step modal: browse log files with metadata (name, size, modified date), then view parsed JSONL entries with colored level badges (error/warn/info/debug), timestamps, context names, and expandable data fields (#116, closes #110)
- **Virtualized log list** — Log entries use `@tanstack/react-virtual` for smooth scrolling with thousands of entries, rendering only visible rows (#116)

### Improvements

- **Shared `formatFileSize` utility** — Extracted duplicate `formatBytes` logic into `@omniscribe/shared` and reused across GeneralSection and LogViewerModal (#116)
- **Log entry shape validation** — `parseLogEntries` now validates JSON structure before accepting entries, preventing malformed lines from causing rendering issues (#116)
- **File size guard** — `app:read-log-file` IPC handler checks file size against `LOG_MAX_FILE_SIZE` before reading, preventing excessive memory usage (#116)
- **Invalid date handling** — `formatLogTimestamp` properly falls back to raw ISO string when given invalid date input (#116)

### Security

- **Path traversal protection** — `app:read-log-file` validates filenames against traversal patterns (`/`, `\`, `..`) and enforces naming convention before reading (#116)
- **TOCTOU elimination** — Replaced `existsSync` + `readFile` with async `stat` + `ENOENT` catch to prevent race conditions (#116)

## 0.7.3 (2026-02-14)

### Bug Fixes

- **Branch selector shown when worktrees disabled** — Hide the branch selector in pre-launch slots when worktree mode is set to "never" (#115, closes #111)
- **Misleading branch label in non-worktree mode** — Sessions no longer get an incorrect branch assignment when worktree mode is disabled (#115)
- **Pre-launch slots not tracking external checkouts** — Auto-update slot branch labels when the user checks out a different branch outside Omniscribe (#115)
- **Missing branch/worktreePath in status events** — `SessionStatusUpdate` events now propagate `branch` and `worktreePath` fields so the frontend stays in sync (#115)
- **Continue-last missing branch context** — Pass `currentBranch` when resuming the last session from the history panel (#115)
- **Premature worktree cleanup** — Reference-count shared worktrees before auto-cleanup to prevent deleting worktrees still in use by other sessions (#115)
- **Silent worktree creation failures** — Show a toast notification when worktree creation fails instead of silently falling back (#115)
- **TOCTOU race in branch detection** — Fetch `currentBranch` once at session creation and reuse the value, eliminating a race where the branch could change between check and use (#115)
- **Git failure blocking session creation** — `getCurrentBranch` errors are now caught so git failures don't prevent sessions from launching (#115)
- **Worktree path comparison on Windows** — Use `normalizePath()` for worktree path comparison to handle Windows path separators correctly (#115)

## 0.7.2 (2026-02-14)

### Bug Fixes

- **Terminal URL links not opening in browser** — Fixed clickable URLs in terminal output opening `about:blank` instead of the actual URL; custom handler now passes the real URL to Electron's `setWindowOpenHandler` (#113, closes #112)
- **Editor protocol support** — Added `vscode:`, `vscode-insiders:`, and `cursor:` protocols to allowed external protocols for editor URI links (#113)

## 0.7.1 (2026-02-13)

### Performance

- **Byte-based terminal backpressure** — Switched backpressure tracking from packet-counting to byte-counting and tuned buffer thresholds, significantly reducing "Buffering output..." overlay noise during normal Claude Code usage (#109)

### Bug Fixes

- **Backpressure drain reset** — Reset pending counters for all terminals on drain (not just paused ones) and snapshot the paused set before iterating to avoid mutation during iteration (#109)

## 0.7.0 (2026-02-13)

### Features

- **Dynamic backend port** — NestJS backend now binds to an OS-assigned port (`listen(0)`) instead of hardcoded port 3001, eliminating EADDRINUSE crashes when running multiple Omniscribe instances (#105)
- **Lazy socket initialization** — Frontend socket singleton is now initialized with the dynamic port via IPC bridge (`app:get-backend-port`), replacing the eager module-level construction

### Bug Fixes

- **Reconnect listeners never firing** — Fixed socket.io-client v4 reconnect event handlers (`reconnect`, `reconnect_attempt`, `reconnect_error`, `reconnect_failed`) to attach to the Manager (`socket.io`) instead of the Socket instance, where they were silently ignored
- **Socket teardown for HMR** — Added `resetSocket()` export for safe socket cleanup during Vite HMR and test isolation
- **Usage polling crash guard** — `getSocket().connected` in usage store polling is now wrapped in try-catch to handle the case where the socket isn't initialized yet

### Code Quality

- **Port validation** — `setBackendPort()` rejects invalid ports (non-integer, <=0, >65535) and the startup flow throws on unexpected server address instead of silently falling back to port 0
- **CORS dynamic ports** — Regex-based origin matching now allows any localhost port instead of hardcoded values, with tests documenting that port-less origins are rejected
- **Consistent IPC logging** — Added debug log to `app:get-backend-port` handler for consistency with all other IPC handlers
- **Vite dev port** — Changed from default 5173 to 15174 to avoid collisions with other Vite projects

### Stats

- 34 files changed — +299 / −148 lines

## 0.6.1 (2026-02-13)

### Changes

- **License** — Switched from custom license to MIT, making Omniscribe fully open source

### Security

- **axios** — Bumped from 1.13.4 to 1.13.5 to fix high severity vulnerability

## 0.6.0 (2026-02-10)

### Features

- **Session History** — Browse, search, and filter past Claude Code sessions with branch filtering and sort controls (newest/oldest)
- **Resume Sessions** — Resume any previous Claude Code session directly from the history panel or terminal header
- **Fork Sessions** — Fork an existing session into a new conversation branch using `--fork-session`
- **Continue Last** — One-click button to continue the most recent Claude Code conversation (`--continue` flag)
- **Auto-Resume on Restart** _(Experimental)_ — Toggle in Settings > Sessions to automatically restore active sessions when Omniscribe restarts; uses eager snapshot saving for reliability across all shutdown scenarios
- **Hooks Integration** — Automatic Claude Code `SessionStart`/`SessionEnd` hooks for instant session ID capture (falls back to polling)
- **Tailwind CSS v4** — Migrated frontend from Tailwind CSS v3 to v4 with updated theme configuration
- **Keyboard Shortcuts** — Added missing shortcuts for settings (`Ctrl+,`), history (`Ctrl+H`), tabs, and terminal clear

### Bug Fixes

- **Shell PATH resolution** — Spawned sessions now inherit the user's full shell PATH on macOS/Linux, fixing missing dev tools like `node`, `git`, `claude` in terminal sessions (#97)
- **Terminal freezing** — Fixed backpressure oscillation that caused terminal UI lag and freezes; increased thresholds and replaced flickering bar with debounced theme-aware overlay
- **MCP status not updating UI** — Fixed MCP status updates not propagating to the frontend; status server now routes through SessionService via internal event
- **MCP config race condition** — Plain terminal sessions no longer write `.mcp.json`, preventing them from overwriting Claude session IDs
- **Hooks field name** — Fixed hook event field from `event` to `hook_event_name` to match Claude Code's actual format
- **Session state transitions** — Added `needs_input` and `finished` as valid transitions from `idle` status
- **Git error swallowing** — Fixed `execGit` silently swallowing fatal git errors
- **Git path validation** — Added input validation to Git gateway and worktree cleanup to prevent path traversal
- **Claude CLI auth on macOS** — Detect authentication via config file fallback when CLI detection fails
- **Git event mismatch** — Fixed event naming between frontend and backend, removed dead code
- **Predefined slot hover border** — Added missing hover border to predefined session slot cards
- **Auto-resume reliability** — Switched from shutdown-time snapshot saving to eager snapshots on every session state change, ensuring recovery even after forced kills (SIGINT/SIGTERM)
- **E2E test label matching** — Accept both "Claude" and "Plain AI" mode labels in e2e tests

### Performance

- **O(1) session lookup** — Removed static gateway maps in favor of direct SessionService lookups, eliminating duplicate state and O(N) scans (#93)
- **Remove execSync** — Replaced blocking `execSync` in GithubService with async `execFile`, unblocking the main thread
- **Frontend performance** — Improved React patterns, memoization, and socket reliability

### Refactoring

- **Shared package extraction** — Extracted types, constants, and event names to shared package; removed deprecated aliases
- **DRY deduplication** — Eliminated code duplication across backend and frontend
- **Gateway lifecycle alignment** — Aligned gateway lifecycle, event naming, and imports across all modules

### Dependencies

- Upgrade `react-resizable-panels` from 2.1.9 to 4.6.2

### Code Quality

- **Backend safety** — Hardened input validation and resource management across all gateways
- **WCAG accessibility** — Fixed accessibility issues across settings and terminal components
- **Comprehensive test coverage** — Added tests for backend services, frontend stores/hooks/components, and shared package utilities
- **Test infrastructure** — Fixed test failures, worker process leaks, and shared Jest config

### Stats

- 63 commits across 15+ PRs
- 214 files changed — +26,037 / −4,028 lines

## 0.6.0-beta.3 (2026-02-10)

### Bug Fixes

- **Shell PATH resolution** — Spawned sessions now inherit the user's full shell PATH on macOS/Linux, fixing missing dev tools like `node`, `git`, `claude` in terminal sessions (#97)
- **MCP status not updating UI** — Fixed MCP status updates not propagating to the frontend; status server now routes through SessionService via internal event to keep backend state in sync before broadcasting
- **MCP config race condition** — Plain terminal sessions no longer write `.mcp.json`, preventing them from overwriting Claude session IDs and breaking MCP communication
- **Hooks integration broken** — Fixed hook event field name from `event` to `hook_event_name` to match Claude Code's actual format
- **Session state transitions** — Added `needs_input` and `finished` as valid transitions from `idle` status, fixing rejected MCP status updates
- **Backpressure too aggressive** — Increased backpressure thresholds (HIGH_WATER_MARK 128→512, LOW_WATER_MARK 16→64, safety timeout 5s→10s) to prevent premature pausing during Claude Code output bursts
- **Backpressure overlay flicker** — Replaced flickering backpressure bar with a debounced theme-aware overlay
- **E2E test label matching** — Accept both "Claude" and "Plain AI" mode labels in e2e tests

### Code Quality

- **Test coverage expansion** — Added component smoke tests, store tests, hook tests, and lib utility tests across the frontend
- **Test infrastructure** — Fixed test failures and worker process leaks
- **Dead code cleanup** — Removed unused types, deprecated aliases, and code inconsistencies from shared package
- **Documentation** — Updated CLAUDE.md with accurate patterns and missing documentation

## 0.6.0-beta.2 (2026-02-10)

### Features

- **Tailwind CSS v4 migration** — Migrated frontend from Tailwind CSS v3 to v4 with updated theme configuration
- **Keyboard shortcuts** — Added missing shortcuts for settings, history, tabs, and terminal clear

### Bug Fixes

- **Terminal freezing** — Fixed backpressure oscillation that caused terminal UI lag and freezes
- **Worktree creation failures** — Fixed `execGit` silently swallowing fatal git errors
- **Claude CLI auth on macOS** — Detect authentication via config file fallback
- **Git event mismatch** — Fixed event naming between frontend and backend, removed dead code
- **Frontend performance** — Improved React patterns and socket reliability
- **Backend safety** — Hardened input validation and resource management
- **Predefined slot hover border** — Added missing hover border to predefined session slot cards

### Refactoring

- **Shared package extraction** — Extracted types, constants, and event names to shared package; removed deprecated aliases
- **DRY deduplication** — Eliminated code duplication across backend and frontend

### Code Quality

- **Pattern consistency & WCAG accessibility** — Aligned gateway lifecycle, event naming, imports, and fixed accessibility issues
- **Comprehensive test coverage** — Added tests for backend, frontend, and shared package; formatted shared Jest config

## 0.6.0-beta.1 (2026-02-08)

### Features

- **Session History** — Browse, search, and filter past Claude Code sessions with branch filtering and sort controls (newest/oldest)
- **Resume Sessions** — Resume any previous Claude Code session directly from the history panel or terminal header
- **Fork Sessions** — Fork an existing session into a new conversation branch using `--fork-session`
- **Continue Last** — One-click button to continue the most recent Claude Code conversation (`--continue` flag)
- **Auto-Resume on Restart** — Toggle in Settings > Sessions to automatically restore active sessions when Omniscribe restarts
- **Hooks Integration** — Automatic Claude Code `SessionStart`/`SessionEnd` hooks for instant session ID capture (falls back to polling)

### Improvements

- Claude session reader service for parsing `sessions-index.json` and `.jsonl` session files
- Hook manager service that registers/unregisters hooks and watches for hook events via temp directory
- Shared payload types for resume, fork, continue-last, and session history WebSocket events
- Gateway refactored to use shared `launchSessionWithWorktree()` helper, eliminating code duplication
- Session history panel with debounced search, branch dropdown filter, and sort toggle
- Resumed session indicator with accessibility attributes (`role="status"`, `aria-label`)
- `type="button"` added to all interactive buttons to prevent unintended form submission
- `fetchHistory` socket call includes 15-second timeout
- `autoResumeOnRestart` default added to session settings

## 0.5.1 (2026-02-08)

### Bug Fixes

- **Clipboard copy broken on Windows** — `navigator.clipboard.writeText()` silently fails in production because `file://` is not a secure context; replaced with Electron's native `clipboard` module via IPC
- **"Run in Terminal" broken on Windows** — `spawn('powershell', ...)` with `detached: true` ran as a hidden background process; fixed by using `cmd.exe /c start powershell` to open a visible console window
- **No feedback on copy/run actions** — Added toast notifications for success and error states on both the Copy and Run in Terminal buttons

## 0.5.0-beta.4 (2026-02-08)

### Bug Fixes

- **Proper CLI auth detection** — Replaced process-spawning detection (`spawn`, `execSync`) with credential file reading (`~/.claude/.credentials.json`) for reliable authentication state (#49)

### Internal

- Refactored `UsageService` to delegate CLI detection to shared `getClaudeCliStatus()` utility
- Removed `isAvailable()` method and `checkAuth()` in favor of the unified detection function
- Updated all usage gateway and service tests to mock the new utility

## 0.5.0-beta.3 (2026-02-08)

### Bug Fixes

- **Fixed raw error dump on update check** — The "release pending" detection now catches any `.yml` 404 regardless of the current channel, fixing a race condition where switching channels mid-check would show the raw HTTP error instead of the friendly "release is being prepared" message

## 0.5.0-beta.2 (2026-02-08)

### Improvements

- **Usage tooltip** — Claude usage button in TopBar now shows "Claude usage: X% (5h window)" on hover; tooltip auto-hides when popover is open
- **README** — Added Beta Releases section with opt-in/opt-out instructions
- **CI fix** — Explicitly set electron-builder publish channel for GitHub provider to generate correct `beta.yml` files

## 0.5.0-beta.1 (2026-02-08)

### Features

- **Beta update channel** — Switch between Stable and Beta update channels at runtime in Settings > General > Updates; preference persists across restarts
- **Unified TopBar** — Merged ProjectTabs, TopBar, and BottomBar into a single header, reclaiming +32px of terminal space; icon-only action buttons with tooltip hints on hover
- **Pre-release CI support** — Beta builds generate `beta.yml` for auto-update; pre-release GitHub Releases skip version sync to master

### Improvements

- Consolidated raw `<button>` elements to shadcn `Button` component across 7 files (net -90 lines)
- Theme-aware colors: replaced hardcoded status green with `primary`/`destructive` tokens
- Global TooltipProvider with 300ms delay for consistent hover hints
- Downgrade-aware messaging when switching from beta to stable channel
- Contextual error text when no beta release is available
- Channel label shown in update toast notifications
- `bump-version.sh` accepts full SemVer 2.0.0 pre-release suffixes (`-beta.1`, `-rc.1`)

## 0.5.0 (2026-02-08)

### Features

- **Unified TopBar** — Merged ProjectTabs, TopBar, and BottomBar into a single compact header with tabs, session actions, and settings all in one row (#54)
- **Beta update channel** — Switch between Stable and Beta update channels at runtime in Settings > About > Updates; includes downgrade support, contextual error messages, and friendly "release pending" handling (#56)
- **Claude usage tooltip** — Hover the Claude icon in TopBar to see usage percentage and rolling window at a glance
- **Proper CLI auth detection** — Reads `~/.claude/.credentials.json` directly instead of spawning processes for reliable authentication state (#49)

### Improvements

- **Button consolidation** — Replaced raw HTML buttons across the frontend with shadcn `Button` component for consistent styling (#55)
- **Accessibility** — Roving tabIndex on project tabs (WAI-ARIA tabs pattern), improved keyboard navigation
- **macOS detection** — Correct keyboard shortcut labels (⌘ vs Ctrl) on macOS web builds
- **CI release pipeline** — Explicit publish channel flag for electron-builder, glob-based YML artifact uploads, version-sync skipped for pre-releases
- **Type safety** — `UpdateChannel` type used across IPC boundary (preload, global types, store) instead of plain strings

### Bug Fixes

- Fixed release pending detection to work across channel switches (channel-agnostic `.yml` 404 matching)
- Fixed TOCTOU race in `checkForUpdates` by capturing channel before async gap
- Fixed semver validation regex for build metadata in version bump script
- Channel buttons now disabled during update checks to prevent mid-check switching

## 0.4.2 (2026-02-08)

### Bug Fixes

- **Friendly message when release is still building** — Detects `latest.yml` 404 errors during the CI build window and shows an amber "release is being prepared" message in About section with a Recheck button, instead of a raw HTTP error dump
- **Info toast instead of error toast** — Shows a gentle "New release detected" info toast instead of "Update failed" error toast when artifacts aren't ready yet

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
