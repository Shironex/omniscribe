---
sidebar_position: 1
---

# Introduction

Omniscribe is a desktop application for orchestrating multiple AI coding assistant sessions in parallel. It provides a unified interface for managing sessions across different AI providers like Claude Code and OpenAI Codex.

## Features

- **Multi-session management** — Run multiple AI coding sessions simultaneously across different projects
- **Provider plugins** — Extensible plugin system supporting multiple AI providers
- **Real-time streaming** — Live terminal output with status detection and usage tracking
- **Git integration** — Branch management, worktrees, and GitHub operations
- **MCP support** — Model Context Protocol integration for enhanced AI capabilities
- **40+ themes** — Customizable UI with runtime theme switching

## Architecture

Omniscribe is built as an Electron desktop application with:

- **Backend**: NestJS running in the Electron main process, managing PTY sessions, git operations, and plugin lifecycle
- **Frontend**: React with Zustand state management, connected via Socket.io for real-time updates
- **Plugin System**: TypeScript-based plugin API (`@omniscribe/plugin-api`) that providers implement to integrate with the platform
- **MCP Server**: Reports session status to AI coding assistants like Claude Code

## Quick Links

- [Getting Started](/docs/getting-started/overview) — Architecture overview and setup
- [Plugin SDK](/sdk/overview) — Build your own provider plugin
- [API Reference](/docs/api) — Auto-generated TypeScript API docs
