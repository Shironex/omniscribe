---
sidebar_position: 1
slug: /intro
---

# What is Omniscribe?

Omniscribe is a free, open-source desktop app that lets you run multiple AI coding sessions side by side. Instead of juggling terminal windows, Omniscribe gives you a single interface to launch, monitor, and manage sessions with AI assistants like Claude Code and OpenAI Codex.

## Why Omniscribe?

When working on complex projects, you often need multiple AI assistants running in parallel — one refactoring the backend, another writing tests, a third updating documentation. Omniscribe makes this workflow seamless:

- **Up to 12 parallel sessions** in a resizable grid layout
- **Git worktree isolation** so each session works on its own branch without conflicts
- **Session history** with resume, fork, and continue-last for picking up where you left off
- **Real-time status tracking** — see at a glance which sessions are working, thinking, or waiting for input
- **Quick actions** for common git operations without leaving the app
- **41 UI themes and 12 terminal themes** to match your style
- **Plugin system** to add support for new AI providers

## Who is it for?

- **Developers** who use AI coding assistants daily and want to run multiple sessions efficiently
- **Teams** exploring different AI tools and want a unified interface
- **Plugin developers** who want to add new AI provider integrations

## Get Started

import Link from '@docusaurus/Link';

<div style={{display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem'}}>
  <Link className="button button--primary button--lg" to="/docs/getting-started/installation">
    Download Omniscribe
  </Link>
  <Link className="button button--secondary button--lg" to="/docs/getting-started/your-first-session">
    Quick Start Guide
  </Link>
</div>

## For Developers

- [Plugin SDK](/sdk/overview) — Build your own AI provider plugin
- [API Reference](/docs/api) — Auto-generated TypeScript API docs
- [Contributing](/docs/contributing/quickstart) — Set up the dev environment
