<a name="top"></a>

# Omniscribe

**Orchestrate multiple AI coding sessions in parallel**

[![Electron](https://img.shields.io/badge/Electron-40.0-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![NestJS](https://img.shields.io/badge/NestJS-10.4-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![OS](https://img.shields.io/badge/OS-Windows%20%7C%20macOS%20%7C%20Linux-0078D4)](https://github.com/your-username/omniscribe)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## Table of Contents

- [About](#about)
- [Features](#features)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Contributing](#contributing)
- [License](#license)

## About

Omniscribe is a desktop application for managing multiple AI coding assistant sessions (Claude Code, etc.) simultaneously. Run 1-6 sessions in parallel, each with its own terminal, optional git worktree isolation, and MCP server configuration.

## Features

| Feature | Description |
|---------|-------------|
| **Multi-Session Grid** | Run 1-6 AI sessions in parallel with live terminal views |
| **Real-Time Status** | Track session states: idle, working, planning, needs_input, finished |
| **Git Worktrees** | Isolate each session in its own git worktree for parallel development |
| **MCP Integration** | Configure Model Context Protocol servers per session |
| **Project Tabs** | Manage multiple projects with persistent recent history |
| **Cross-Platform** | Native support for Windows, macOS, and Linux |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `N` | Add new session slot |
| `L` | Launch all pending sessions |
| `1-6` | Launch individual session by position |
| `Ctrl/Cmd + K` | Stop all running sessions |

## Quick Start

```bash
# Clone the repository
git clone https://github.com/your-username/omniscribe.git
cd omniscribe

# Install dependencies
pnpm install

# Start development
pnpm dev

# Build for production
pnpm build

# Package for distribution
pnpm package          # Current platform
pnpm package:win      # Windows
pnpm package:mac      # macOS
pnpm package:linux    # Linux
```

## Architecture

```
omniscribe/
├── apps/
│   ├── desktop/       # Electron + NestJS backend
│   ├── web/           # React frontend
│   └── mcp-server/    # MCP status server
└── packages/
    └── shared/        # Shared types
```

**Communication Flow:**

```
┌─────────────────────────────────┐
│     Electron Main Process       │
│  ┌───────────────────────────┐  │
│  │    NestJS Backend         │  │
│  │  Terminal │ Session │ Git │  │
│  │    MCP    │ Workspace     │  │
│  └───────────────────────────┘  │
│              │ WebSocket        │
└──────────────┼──────────────────┘
               │
┌──────────────┼──────────────────┐
│     Electron Renderer           │
│  ┌───────────────────────────┐  │
│  │    React + Zustand        │  │
│  │   Terminal Grid │ Stores  │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop | Electron 40 |
| Backend | NestJS 10 |
| Frontend | React 18, Zustand 5 |
| Terminal | xterm.js, node-pty |
| Styling | Tailwind CSS |
| Build | Vite, esbuild |
| IPC | Socket.io, Electron IPC |

## Contributing

Contributions are welcome! Feel free to:

- [Submit an issue](https://github.com/your-username/omniscribe/issues) for bugs or feature requests
- Open a pull request with improvements
- Share feedback and suggestions

## License

MIT

---

[Back to top](#top)
