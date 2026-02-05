# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Omniscribe is a desktop application for orchestrating multiple AI coding assistant sessions in parallel. It uses Electron with an embedded NestJS backend in the main process and a React frontend in the renderer.

## Commands

```bash
# Install dependencies
pnpm install

# Development (starts web + desktop concurrently)
pnpm dev

# Build all packages
pnpm build

# Build only shared package (required before desktop build)
pnpm build:packages

# Lint
pnpm lint

# Format
pnpm format

# Package desktop app for distribution
pnpm --filter @omniscribe/desktop package

# Platform-specific builds
pnpm package:win    # Windows
pnpm package:mac    # macOS
pnpm package:linux  # Linux

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

- **TerminalModule** - PTY management via node-pty, handles spawn/input/resize/kill
- **SessionModule** - AI session lifecycle and state (Starting, Idle, Working, NeedsInput, Done, Error)
- **GitModule** - Git operations (branches, worktrees, commits) via CLI execution
- **McpModule** - MCP server discovery, config generation, status polling
- **WorkspaceModule** - Project/tab management, persistence via electron-store

Communication uses Socket.io WebSocket for real-time streaming (terminal output, status updates) and Electron IPC for native operations (dialogs, window controls).

### Frontend (React)

Located in `apps/web/src/`:

- **stores/** - Zustand stores (useSessionStore, useWorkspaceStore, useGitStore, useMcpStore, useQuickActionStore)
- **components/** - React components (terminal/, sidebar/, settings/, shared/, ui/)
- **hooks/** - Custom hooks for app initialization, session lifecycle, workspace management
- **lib/** - Utilities including socket.ts for WebSocket connection

### Shared Package

`packages/shared/src/types/` contains TypeScript types shared between frontend and backend (session.ts, workspace.ts, mcp.ts, git.ts, payloads.ts). The `payloads.ts` file defines typed request/response contracts for all WebSocket events - always reference these types when adding new socket communication.

## Key Patterns

### NestJS Module Structure

Each backend module follows: `*.module.ts`, `*.service.ts`, `*.gateway.ts` (WebSocket), `index.ts` (barrel export)

### WebSocket Events

- Backend emits: `terminal:output`, `session:status`, `git:update`
- Frontend emits: `terminal:input`, `terminal:resize`, `session:create`

### State Management

Zustand stores in `apps/web/src/stores/` connect to backend via Socket.io. The `createSocketStore.ts` utility provides:

- `SocketStoreSlice` - Common state (isLoading, error, listenersInitialized)
- `createSocketListeners()` - Standardized socket event subscription with automatic cleanup

### Logging (Backend)

Services use NestJS Logger: `private readonly logger = new Logger(ServiceName.name);`
