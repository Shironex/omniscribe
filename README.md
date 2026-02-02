# Omniscribe

A desktop application for orchestrating multiple AI coding assistant sessions in parallel. Built with Electron + NestJS + React.

## Overview

Omniscribe provides a unified interface for managing multiple AI coding sessions (Claude Code, Gemini CLI, OpenAI Codex) simultaneously, each with isolated git worktrees and configurable MCP (Model Context Protocol) servers.

## Key Features

- **Multi-Session Terminal Grid** - Run 1-6 AI sessions in parallel with live terminal views
- **Git Worktree Isolation** - Each session operates in its own git worktree
- **MCP Integration** - Configure and monitor MCP servers per session
- **Real-Time Status** - Track session states (Idle, Working, NeedsInput, Done, Error)
- **Plugin System** - Extensible via plugins and skills
- **Cross-Platform** - Windows, macOS, Linux support

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                 NestJS Backend                       │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐  │    │
│  │  │ Terminal    │ │ Session     │ │ Git          │  │    │
│  │  │ Service     │ │ Service     │ │ Service      │  │    │
│  │  │ (node-pty)  │ │             │ │              │  │    │
│  │  └─────────────┘ └─────────────┘ └──────────────┘  │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐  │    │
│  │  │ MCP         │ │ Plugin      │ │ Workspace    │  │    │
│  │  │ Service     │ │ Service     │ │ Service      │  │    │
│  │  └─────────────┘ └─────────────┘ └──────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                            │ WebSocket / IPC                 │
└────────────────────────────┼────────────────────────────────┘
                             │
┌────────────────────────────┼────────────────────────────────┐
│                    Electron Renderer                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                 React Frontend                       │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐  │    │
│  │  │ Terminal    │ │ Sidebar     │ │ Git Graph    │  │    │
│  │  │ Grid        │ │             │ │ Panel        │  │    │
│  │  └─────────────┘ └─────────────┘ └──────────────┘  │    │
│  │  Zustand Stores: Session | Workspace | Git | MCP   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Framework | Electron 28+ |
| Backend Runtime | NestJS 10 (embedded in main process) |
| Frontend Framework | React 18 |
| Language | TypeScript 5.5+ |
| Terminal Emulator | xterm.js 6.0 |
| PTY Library | node-pty |
| State Management | Zustand 5.0 |
| Styling | Tailwind CSS 3.4 |
| Build Tool | Vite 5 |
| IPC | WebSocket (Socket.io) + Electron IPC |

## Project Structure

```
omniscribe/
├── apps/
│   ├── desktop/              # Electron main process + NestJS
│   │   ├── src/
│   │   │   ├── main/         # Electron main entry
│   │   │   ├── modules/      # NestJS modules
│   │   │   │   ├── terminal/
│   │   │   │   ├── session/
│   │   │   │   ├── git/
│   │   │   │   ├── mcp/
│   │   │   │   └── workspace/
│   │   │   └── preload/      # Electron preload scripts
│   │   └── package.json
│   └── web/                  # React frontend (renderer)
│       ├── src/
│       │   ├── components/
│       │   ├── stores/
│       │   ├── hooks/
│       │   └── lib/
│       └── package.json
├── packages/
│   └── shared/               # Shared types and utilities
├── docs/                     # Documentation
└── package.json              # Workspace root
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Development
pnpm dev

# Build
pnpm build

# Package for distribution
pnpm package
```

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Tech Stack Decisions](./docs/TECH-STACK.md)
- [Implementation Plan](./docs/IMPLEMENTATION-PLAN.md)
- [API Specification](./docs/specs/API.md)
- [Frontend Components](./docs/specs/COMPONENTS.md)
- [State Management](./docs/specs/STATE.md)
- [MCP Integration](./docs/specs/MCP.md)

## License

MIT
