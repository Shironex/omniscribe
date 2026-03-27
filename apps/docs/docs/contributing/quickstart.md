---
sidebar_position: 1
sidebar_label: Development Setup
---

# Development Setup

Get Omniscribe running locally for development and contributing.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22.0.0
- [pnpm](https://pnpm.io/) >= 10.x
- A C++ compiler for native modules (`node-pty`):
  - **macOS**: `xcode-select --install`
  - **Windows**: Visual Studio Build Tools

## Setup

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

This starts both the Vite dev server (frontend) and Electron (desktop app) concurrently. The app opens automatically once the frontend is ready.

## Common Commands

```bash
# Development
pnpm dev              # Start web + desktop concurrently
pnpm dev:debug        # Start with debug logging

# Building
pnpm build            # Build all packages and apps
pnpm build:packages   # Build only shared packages

# Quality
pnpm lint             # Run ESLint
pnpm format           # Run Prettier (write)
pnpm typecheck        # Run TypeScript type checking
pnpm test             # Run all tests

# Packaging
pnpm package:mac      # Package for macOS
pnpm package:win      # Package for Windows
```

## Project Configuration

- **ESLint + Prettier** are configured for code quality
- **Husky + lint-staged** run checks on git commit
- **Conventional commits** are used (`feat:`, `fix:`, `refactor:`, etc.)
- **TypeScript strict mode** is enabled across all packages

## Next Steps

- [Plugin SDK Overview](/sdk/overview) — Learn how the plugin system works
- [Creating a Provider Plugin](/sdk/creating-a-provider) — Build your own AI provider
- [API Reference](/docs/api) — Browse the full TypeScript API
