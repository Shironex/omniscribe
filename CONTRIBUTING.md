# Contributing to Omniscribe

Thank you for your interest in contributing to Omniscribe! This guide will help you get started.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22.0.0
- [pnpm](https://pnpm.io/) >= 9.0.0
- [Git](https://git-scm.com/)
- A C++ compiler for native modules (node-pty):
  - **Windows**: Visual Studio Build Tools
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `build-essential` package

## Getting Started

```bash
# Clone the repository
git clone https://github.com/Shironex/omniscribe.git
cd omniscribe

# Install dependencies
pnpm install

# Build shared packages (required before first run)
pnpm build:packages

# Start development
pnpm dev
```

## Project Structure

```
omniscribe/
├── apps/
│   ├── desktop/       # Electron + NestJS backend
│   ├── web/           # React frontend (Vite)
│   └── mcp-server/    # MCP status server
├── packages/
│   └── shared/        # Shared types and utilities
└── docs/              # Internal documentation
```

## Development Workflow

1. Create a new branch from `master`
2. Make your changes
3. Ensure linting passes: `pnpm lint`
4. Ensure the project builds: `pnpm build`
5. Submit a pull request

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: resolve bug
refactor: restructure code
ui: visual changes
docs: documentation updates
chore: maintenance tasks
security: security improvements
```

## Code Style

- TypeScript strict mode is enabled
- ESLint + Prettier are configured — run `pnpm lint` and `pnpm format`
- No `any` types — use proper TypeScript types
- Use the shared logger (`createLogger()` from `@omniscribe/shared`) instead of `console.log`

## Architecture Notes

- **Backend** (NestJS in Electron main process): Each module has `*.module.ts`, `*.service.ts`, `*.gateway.ts`
- **Frontend** (React): Zustand stores in `apps/web/src/stores/`, components in `apps/web/src/components/`
- **Communication**: Socket.io for real-time events, Electron IPC for native operations
- **Shared types**: `packages/shared/src/types/` — always reference `payloads.ts` for WebSocket event contracts

## Reporting Issues

- Use GitHub Issues to report bugs or request features
- Include steps to reproduce for bug reports
- Include your OS and Node.js version

## License

By contributing, you agree to the terms outlined in the [LICENSE](LICENSE) file.
