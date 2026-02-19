---
sidebar_position: 1
---

# Architecture Overview

Omniscribe is organized as a pnpm monorepo with the following structure:

```
omniscribe/
├── apps/
│   ├── desktop/          # Electron main process + NestJS backend
│   ├── web/              # React frontend (Vite)
│   ├── mcp-server/       # MCP server for AI status reporting
│   └── docs/             # This documentation site
├── packages/
│   ├── shared/           # Shared types, constants, logger
│   ├── plugin-api/       # Plugin interface definitions
│   └── plugins/
│       ├── provider-claude/   # Claude Code provider
│       └── provider-codex/    # OpenAI Codex provider
```

## How It Works

### Backend (Electron Main Process)

The NestJS backend runs inside Electron's main process and manages:

- **Terminal sessions** — PTY management via `node-pty` for spawning AI CLI tools
- **Plugin lifecycle** — Loading, activating, and managing provider plugins
- **Git operations** — Branches, worktrees, commits via CLI execution
- **WebSocket gateway** — Real-time communication with the frontend via Socket.io

### Frontend (React Renderer)

The React frontend connects to the backend over WebSocket and provides:

- **Session management** — Create, monitor, and interact with AI sessions
- **Tab-based navigation** — Multiple projects open simultaneously
- **Settings** — Plugin configuration, theme selection, usage monitoring
- **Terminal rendering** — xterm.js for live terminal output display

### Plugin System

Provider plugins implement the `AiProviderPlugin` interface from `@omniscribe/plugin-api`:

1. **CLI Detection** — Check if the AI tool is installed and authenticated
2. **Command Building** — Construct shell commands to launch/resume sessions
3. **Status Parsing** — Parse terminal output to detect session state (idle, working, needs input, etc.)
4. **Usage Tracking** — Fetch and display API usage data (optional)
5. **Frontend UI** — Register settings sections, status renderers, usage panels, and themes

### Communication Flow

```
AI CLI Tool (claude, codex)
    ↕ PTY (stdin/stdout)
Electron Main Process (NestJS + Plugins)
    ↕ Socket.io WebSocket
React Frontend (Zustand stores)
    ↕ Electron IPC
Native OS (dialogs, window controls)
```

## Technology Stack

| Layer                   | Technology               |
| ----------------------- | ------------------------ |
| Desktop shell           | Electron                 |
| Backend framework       | NestJS                   |
| Frontend framework      | React 18                 |
| State management        | Zustand                  |
| UI components           | Radix UI + shadcn/ui     |
| Styling                 | Tailwind CSS             |
| Terminal emulation      | xterm.js                 |
| Real-time communication | Socket.io                |
| Build tool (frontend)   | Vite                     |
| Package manager         | pnpm                     |
| Language                | TypeScript (strict mode) |
