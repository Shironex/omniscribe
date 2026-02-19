---
sidebar_position: 4
---

# Your First Session

Walk through launching and interacting with your first AI coding session.

## Launch a Session

1. **Open a project** -- Click the open button and select a folder (or pick one from recent projects)
2. **Select an AI mode** -- In the pre-launch slot, choose **Claude Code** from the mode dropdown (or another provider if preferred)
3. **Click Launch** -- Press the launch button or hit the slot's shortcut key (`1`-`9`)

The terminal opens and the AI assistant starts up. You will see it initialize and enter an idle state.

## Session States

The terminal header shows the current session state:

| State           | Meaning                                                     |
| --------------- | ----------------------------------------------------------- |
| **Idle**        | Assistant is ready and waiting for a prompt                 |
| **Working**     | Assistant is executing, writing code, or reading files      |
| **Thinking**    | Assistant is reasoning about the task                       |
| **Needs Input** | Assistant asked a question and is waiting for your response |
| **Finished**    | Session completed (assistant exited)                        |
| **Error**       | Something went wrong                                        |

## Interacting with the Session

Type directly in the terminal to give the assistant prompts or answer its questions. This is the same experience as using the CLI in a regular terminal -- Omniscribe just wraps it with status tracking and management features.

## Quick Actions

The terminal header includes a dropdown menu with quick actions for common git operations (commit, push, create branch, etc.) so you can manage code without leaving the session.

## Stopping Sessions

- **All sessions** -- Press `Cmd+K` (macOS) or `Ctrl+K` (Windows/Linux) to kill every running session
- **Single session** -- Use the terminal header menu to stop an individual session

:::warning
Killing a session terminates the underlying process immediately. The AI assistant will not get a chance to finish or clean up.
:::

## Next Steps

Now that you have a single session running, try launching multiple sessions in parallel to work on different tasks simultaneously.

- [Multi-Session Grid](/docs/features/multi-session-grid) -- Run up to 12 sessions side by side
- [Git Worktrees](/docs/features/git-worktrees) -- Give each session its own isolated branch
- [Session History](/docs/features/session-history) -- Resume, fork, or continue past sessions
