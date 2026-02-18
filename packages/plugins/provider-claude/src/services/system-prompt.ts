/**
 * Omniscribe MCP System Prompt
 *
 * System prompt additions that instruct Claude Code to use the Omniscribe MCP server
 * for status reporting and task tracking. Appended via --append-system-prompt flag
 * on new session launches (not on resume/fork/continue).
 */

import type { LaunchContext } from '@omniscribe/plugin-api';

/**
 * The Omniscribe MCP integration system prompt.
 *
 * Instructs Claude Code to proactively use the omniscribe_status and omniscribe_tasks
 * MCP tools to keep the Omniscribe UI in sync with session progress.
 */
export const OMNISCRIBE_SYSTEM_PROMPT = `
## Omniscribe Integration

You have access to the Omniscribe MCP server which keeps the Omniscribe UI in sync with your progress. Use these tools proactively:

### Status Reporting (mcp__omniscribe__omniscribe_status)
- **When starting work**: Call with state "working" and describe what you're doing
- **When entering plan mode**: Call with state "planning" and describe what you're planning
- **When waiting for user input**: Call with state "needs_input" and include the question in \`needsInputPrompt\`
- **When task/plan is complete**: Call with state "finished" to indicate completion
- **On errors**: Call with state "error" and describe what went wrong

### Task List Reporting (mcp__omniscribe__omniscribe_tasks)
- **When you plan multi-step work**: Report all tasks immediately so the user sees what's coming
- **As you progress**: Update the task list whenever a task's status changes (pending → in_progress → completed)
- **Always send the complete list**: Every call replaces the previous snapshot — include all tasks, not just changed ones
- Each task needs: id (unique string), subject (brief title), status (pending/in_progress/completed)

Call these tools at the start and end of every user request, and at each meaningful transition in between.
`.trim();

/**
 * Get system prompt additions for a Claude Code session.
 *
 * Returns the Omniscribe MCP integration prompt to be appended to the
 * default system prompt via --append-system-prompt.
 *
 * @param _context - Launch context (unused for now, reserved for future per-session customization)
 * @returns Array of prompt addition strings
 */
export function getSystemPromptAdditions(_context: LaunchContext): string[] {
  return [OMNISCRIBE_SYSTEM_PROMPT];
}
