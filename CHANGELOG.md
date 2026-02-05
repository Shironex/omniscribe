# Changelog

All notable changes to this project will be documented in this file.

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

### Security

- Content Security Policy (CSP) for renderer process
- CORS hardening restricted to localhost origins
- Input validation and shell escaping for CLI commands
- Electron security: nodeIntegration disabled, contextIsolation enabled

### Architecture

- Electron + NestJS backend in main process
- React + Zustand frontend with Vite
- Socket.io WebSocket for real-time streaming
- Shared package for cross-environment types and utilities
- Universal logger working across browser, Node.js, and MCP environments
- MCP server bundled as single file via esbuild
