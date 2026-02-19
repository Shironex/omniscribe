---
sidebar_position: 1
---

# Settings

Open Settings with `Cmd/Ctrl + ,` or by clicking the gear icon in the top bar. Omniscribe uses a Discord-style settings modal with sidebar navigation, organizing all configuration into logical sections.

## Opening Settings

- **Keyboard shortcut:** `Cmd + ,` (macOS) or `Ctrl + ,` (Windows/Linux)
- **Mouse:** Click the gear icon in the top bar

The modal displays a sidebar on the left with section names grouped into categories, and the active section's controls on the right.

## Settings Sections

Settings are organized into three groups:

### Integrations

| Section         | Description                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **GitHub CLI**  | Shows GitHub CLI detection status and authentication state. Omniscribe auto-detects the `gh` command and displays whether you are logged in.           |
| **MCP Servers** | Lists discovered MCP (Model Context Protocol) configurations for the current project. These are read from `.mcp.json` files in your project directory. |
| **Extensions**  | Manage plugins and AI providers. Enable or disable installed providers (e.g., Claude Code, OpenAI Codex) from this section.                            |

### Workflow

| Section           | Description                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sessions**      | Configure the default AI mode for new sessions, toggle the skip-permissions flag, and enable experimental auto-resume on restart.                                   |
| **Quick Actions** | Set the execution mode for quick actions: paste-only (pastes the command into the terminal) or paste-and-execute (pastes and runs immediately).                     |
| **Worktrees**     | Configure git worktree behavior: choose between "never", "always", or "branch" mode, set the worktree storage location, and toggle auto-cleanup of stale worktrees. |

### Interface

| Section           | Description                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Appearance**    | Select from 41 UI themes. Themes are applied instantly via CSS custom properties and persist per-project.                                                                 |
| **Terminal**      | Configure terminal font family, font size, cursor style, cursor blink, scrollback buffer size, terminal color theme (11 themes), and editor protocol for file path links. |
| **General/About** | View the current app version, switch between Stable and Beta update channels, and access diagnostics tools (open log files, open log folder).                             |

## Plugin-Registered Sections

Providers installed through the plugin system can register their own settings sections. These appear alongside the built-in sections under Integrations, giving each provider a dedicated place for its configuration UI.
