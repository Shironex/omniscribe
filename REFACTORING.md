# Refactoring Opportunities

This document tracks refactoring opportunities identified in the Omniscribe codebase.

## 1. Hardcoded App Name "Omniscribe" - ✅ COMPLETED

Found **85+ occurrences** across the codebase. Moved to a constants file.

**Solution:** Created `packages/shared/src/constants/app.ts` with centralized constants.

### Constants Added:
- `APP_NAME` - Display name ("Omniscribe")
- `APP_NAME_LOWER` - Lowercase for paths/IDs ("omniscribe")
- `APP_ID` - Electron app ID
- `MCP_SERVER_NAME` - MCP server identifier
- `USER_DATA_DIR` - User data directory name (.omniscribe)
- `WORKTREES_DIR` - Worktrees subdirectory
- `MCP_CONFIGS_DIR` - MCP configs subdirectory
- `MCP_SERVER_DIR` - MCP server subdirectory
- `GIT_TIMEOUT_MS` - Git command timeout (30s)
- `GH_TIMEOUT_MS` - GitHub CLI timeout (30s)
- `STATUS_CACHE_TTL_MS` - Status cache TTL (5min)
- `VITE_DEV_PORT` - Vite dev server port (5173)
- `MCP_STATUS_PORT_START/END` - Status server port range (9900-9999)
- `LOCALHOST` - Localhost address (127.0.0.1)
- `TERM_PROGRAM` - Terminal program identifier
- `LOG_FILE_PREFIX` - Log file prefix

### Files Updated:
- `packages/shared/src/constants/app.ts` - NEW
- `packages/shared/src/constants/index.ts` - NEW
- `packages/shared/src/index.ts` - Export constants
- `apps/desktop/src/modules/git/git.service.ts` - Use GIT_TIMEOUT_MS
- `apps/desktop/src/modules/git/worktree.service.ts` - Use GIT_TIMEOUT_MS, paths
- `apps/desktop/src/modules/git/github.service.ts` - Use GH_TIMEOUT_MS
- `apps/desktop/src/modules/mcp/mcp-config.service.ts` - Use MCP constants
- `apps/desktop/src/modules/mcp/mcp-status-server.service.ts` - Use port constants
- `apps/desktop/src/modules/terminal/terminal.service.ts` - Use TERM_PROGRAM
- `apps/desktop/src/main/logger.ts` - Use LOG_FILE_PREFIX
- `apps/desktop/src/main/window.ts` - Use VITE_DEV_PORT
- `apps/web/src/components/shared/WelcomeView.tsx` - Use APP_NAME
- `apps/web/src/components/settings/sections/GeneralSection.tsx` - Use APP_NAME
- `apps/web/src/components/settings/sections/AppearanceSection.tsx` - Use APP_NAME
- `apps/web/src/components/settings/sections/WorktreesSection.tsx` - Use path constants
- `apps/web/src/components/settings/sections/McpSection.tsx` - Use MCP_SERVER_NAME

---

## 2. Duplicate Timeout Constants - ✅ COMPLETED

`GIT_TIMEOUT_MS = 30000` was defined in **3 separate files** - now consolidated in `packages/shared/src/constants/app.ts`.

---

## 3. Port/URL Constants Scattered - ✅ COMPLETED

All port and URL constants consolidated:
- `VITE_DEV_PORT` (5173) - used in window.ts (vite.config.ts keeps local copy as build config)
- `MCP_STATUS_PORT_START/END` (9900-9999) - used in mcp-status-server.service.ts
- `LOCALHOST` (127.0.0.1) - used in mcp-status-server.service.ts

---

## 4. Large Files to Split - HIGH PRIORITY

| File | Lines | Split Suggestions |
|------|-------|-------------------|
| `git.service.ts` | **933** | Split into `git-branch.service.ts`, `git-commit.service.ts`, `git-status.service.ts` |
| `ipc-handlers.ts` | **775** | Split by domain: `ipc-dialog.ts`, `ipc-window.ts`, `ipc-filesystem.ts` |
| `session.service.ts` | **721** | Extract `session-spawn.service.ts` (PTY management), `session-prompt.service.ts` |
| `usage.service.ts` | **639** | Extract parsing logic to `usage-parser.ts` |
| `github.service.ts` | **606** | Could extract PR/issue specific methods |

---

## 5. MCP Module Refactoring - HIGH PRIORITY

The MCP module (`apps/desktop/src/modules/mcp/`) has 6 files but responsibilities overlap:

| Current File | Lines | Issues |
|--------------|-------|--------|
| `mcp.service.ts` | 187 | Config discovery/parsing |
| `mcp-config.service.ts` | 386 | Config writing, internal MCP finding, tracking |
| `mcp-status-server.service.ts` | 304 | HTTP server, session routing |
| `mcp.gateway.ts` | 239 | WebSocket handlers |

**Suggested Split:**
- `mcp-discovery.service.ts` - Finding and parsing MCP configs
- `mcp-writer.service.ts` - Writing session configs
- `mcp-internal.service.ts` - Internal MCP binary management
- `mcp-status-server.service.ts` - Keep as-is (focused)
- `mcp-session-registry.service.ts` - Session tracking (currently in config service)

---

## 6. Duplicate Type Definitions - MEDIUM PRIORITY

`StatusPayload` interface defined in **2 places**:
- `apps/mcp-server/src/index.ts:36-43`
- `apps/desktop/src/modules/mcp/mcp-status-server.service.ts:9-16`

**Solution:** Move to `packages/shared/src/types/mcp.ts`.

---

## 7. Console.log Patterns - LOW PRIORITY

**79 console.log/error/warn calls** in desktop app. Using mixed formats:
- `[McpService] message`
- `[McpConfigService] message`
- `[omniscribe-mcp] message`

**Solution:** Create a logger utility with consistent prefix formatting, or standardize on NestJS Logger.

---

## 8. Store Patterns - ✅ COMPLETED

All socket-connected stores now consistently use the `createSocketListeners` utility from `stores/utils/createSocketStore.ts`.

**Standardized stores (use utility):**
- `useSessionStore` - Session management
- `useWorkspaceStore` - Workspace/tab management
- `useGitStore` - Git operations
- `useMcpStore` - MCP server discovery (migrated)

**Non-socket stores (no utility needed):**
- `useQuickActionStore` - Uses Electron persistence, no socket listeners
- `useTerminalControlStore` - Pure client-side state
- `useSettingsStore` - Pure client-side state
- `useUsageStore` - Uses polling with `emitAsync`, not event-driven

**Pattern benefits:**
- Consistent `initListeners`/`cleanupListeners` interface
- Common state: `isLoading`, `error`, `listenersInitialized`
- Common actions: `setLoading`, `setError`
- Automatic connect/reconnect handling
- Prevents duplicate listener registration

---

## Progress Tracking

- [x] 1. Create constants file for app name ✅
- [x] 2. Consolidate timeout constants (included in #1) ✅
- [x] 3. Consolidate network constants (included in #1) ✅
- [x] 4. Split large files
- [x] 5. Refactor MCP module
- [ ] 6. Consolidate StatusPayload type
- [x] 7. Standardize logging
- [x] 8. Standardize store patterns
