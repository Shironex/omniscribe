# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Omniscribe is a desktop application for orchestrating multiple AI coding assistant sessions in parallel. It uses Electron with an embedded NestJS backend in the main process and a React frontend in the renderer.

## Requirements

- Node.js >= 22
- pnpm 10.x

## Commands

```bash
# Install dependencies
pnpm install

# Development (starts web + desktop concurrently)
pnpm dev

# Build all packages (shared must build first — all others depend on it)
pnpm build

# Build only shared package (required before desktop/web/mcp-server builds)
pnpm build:packages

# Lint / Format
pnpm lint
pnpm format          # write
pnpm format:check    # CI check (no write)

# Test / Type-check
pnpm test
pnpm typecheck

# Package desktop app for distribution
pnpm --filter @omniscribe/desktop package

# Platform-specific builds
pnpm package:win    # Windows
pnpm package:mac    # macOS

# Rebuild node-pty after electron update
pnpm --filter @omniscribe/desktop rebuild
```

## Architecture

### Monorepo Structure

- `apps/desktop/` - Electron main process with NestJS backend
- `apps/web/` - React frontend (served by Vite, loaded by Electron renderer)
- `apps/mcp-server/` - MCP server for Claude Code status reporting
- `packages/shared/` - Shared types and utilities

### Backend (NestJS in Electron Main)

Located in `apps/desktop/src/modules/`:

- **TerminalModule** - PTY management via node-pty, handles spawn/input/resize/kill (global module)
- **SessionModule** - AI session lifecycle and state (Starting, Idle, Working, NeedsInput, Done, Error)
- **GitModule** - Git operations (branches, worktrees, commits) via CLI execution with domain services
- **GithubModule** - GitHub CLI operations (PRs, issues, repo info)
- **McpModule** - MCP server discovery, config generation, status polling
- **WorkspaceModule** - Project/tab management, persistence via electron-store
- **QuickActionModule** - Quick action management and execution
- **UsageModule** - Claude CLI usage data fetching
- **HealthModule** - Periodic health checks and zombie session detection
- **SharedModule** - CORS config, env-utils, throttler guard, NestJS logger adapter

Communication uses Socket.io WebSocket for real-time streaming (terminal output, status updates) and Electron IPC for native operations (dialogs, window controls). IPC handlers are modular register/cleanup pairs in `apps/desktop/src/main/ipc/`.

### Frontend (React)

Located in `apps/web/src/`:

- **stores/** - Zustand stores: useSessionStore, useWorkspaceStore, useGitStore, useMcpStore, useQuickActionStore, useTerminalStore, useSettingsStore, useUsageStore, useUpdateStore, useConnectionStore, useSessionHistoryStore, useTaskStore
- **components/** - Organized by domain: `terminal/`, `settings/`, `shared/`, `ui/`, `splash/`
- **hooks/** - Custom hooks for app initialization, session lifecycle, terminal operations, workspace management
- **lib/** - Socket.io client, emit helpers, terminal utilities, theme system, layout calculations

**UI stack:** Radix UI primitives + shadcn/ui pattern, Tailwind CSS, Lucide icons, `cn()` utility for class merging. 8 curated CSS themes (Forge, Carbon, Ember, Iceberg, Nord, Gruvbox, Dracula, Paper) with runtime switching via CSS custom properties. Forge is the default dark theme. Legacy theme IDs are migrated automatically via `LEGACY_THEME_MIGRATION` in `packages/shared/src/types/settings.ts`.

**No routing library** — tab-based navigation via workspace store state.

### Shared Package

`packages/shared/src/` contains code shared across all apps:

- **types/** - TypeScript types (session, workspace, mcp, git, github, settings, payloads, usage, updater). The `payloads.ts` file defines typed request/response contracts for all WebSocket events — always reference these types when adding new socket communication.
- **constants/** - Event names (`events.ts`), app constants (`app.ts` — ports, timeouts, directories)
- **logger.ts** - Universal `createLogger()` used by backend, frontend, and MCP server
- **Utilities** - `extractErrorMessage()`, `normalizePath()`, `mapSessionStatus()`, `encodeProjectPath()`

## Key Patterns

### NestJS Module Structure

Each backend module follows: `*.module.ts`, `*.service.ts`, `*.gateway.ts` (WebSocket), `index.ts` (barrel export)

### WebSocket Events

All event names are defined in `packages/shared/src/constants/events.ts` (single source of truth). Events follow the `domain:action` naming convention and cover: Session, Terminal, Git, GitHub, MCP, Workspace, QuickAction, Usage, Zombie, and System domains.

### State Management

Zustand stores in `apps/web/src/stores/` connect to backend via Socket.io. The `createSocketStore.ts` utility provides:

- `SocketStoreSlice` - Common state (isLoading, error, listenersInitialized)
- `createSocketListeners()` - Standardized socket event subscription with automatic cleanup

### Internal Events (Backend Only)

Backend services communicate via EventEmitter2 (dot-notation, e.g. `session.status`, `terminal.output`). These are separate from WebSocket events — defined in `apps/desktop/src/modules/shared/events.ts`. Gateways listen with `@OnEvent()` and broadcast to clients via Socket.io.

### Environment Safety

PTY processes use `buildSafeEnv()` from `apps/desktop/src/modules/shared/env-utils.ts` which applies an allowlist/blocklist to filter environment variables, blocking secrets and code injection vectors.

### Logging

All packages use `createLogger('Name')` from `@omniscribe/shared`. The backend bridges this to NestJS via `NestLoggerAdapter` in `apps/desktop/src/modules/shared/nest-logger.ts`.

### MCP Capabilities

Curated registry of MCP servers Omniscribe ships alongside user-authored entries in `.mcp.json`. Lives in `apps/desktop/src/modules/mcp/capabilities/`. Each capability is an `McpCapability` (id, label, description, optional `preflight`, `buildConfig(ctx) => McpWrittenServerEntry`). Registered in `McpCapabilityRegistryService`. Per-project enabled state lives in `WorkspaceService.projectCapabilities` and is surfaced in Settings → Integrations → AI Capabilities. `McpWriterService` writes a `_omniscribe.managedCapabilities` marker into `.mcp.json` so `removeConfig` can safely strip only capability-owned entries. Adding a capability = one file under `capabilities/` + one `register()` call.

### Dev-only environment flags

- `OMNISCRIBE_ENABLE_CDP=1` — "dogfood mode": exposes Chrome DevTools Protocol on Omniscribe's OWN Electron window (bound to `127.0.0.1:9222`) so you can drive Omniscribe itself from `@playwright/mcp` while developing it. OFF by default, including in unpackaged dev — otherwise Omniscribe would squat on 9222 and block the user's own Electron apps running inside sessions. Never bind beyond `127.0.0.1`.
- `OMNISCRIBE_CDP_PORT` — override the dogfood CDP port (default 9222). Note: the `playwright-electron` MCP capability targets the USER's Electron apps via a per-project port configured in Settings → AI Capabilities — it's independent of this switch.

### Testing

- **Backend:** Jest + `@nestjs/testing` TestingModule. Mock factories in `apps/desktop/test/mocks/` (MockPty, electron-store, child_process).
- **Frontend:** Vitest + jsdom. Store tests in `apps/web/src/stores/__tests__/`. Global mocks in `apps/web/src/test/setup.ts`.
