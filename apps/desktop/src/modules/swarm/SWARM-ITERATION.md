# Team Swarm — Iteration Plan

This document tracks remaining work for the Team Swarm feature (Issue #239).
It combines findings from the 3-agent code review, user feedback, and known bugs.

---

## High Priority — Fix Before Merge

### 1. Messages Never Marked as Read (Bug)

`markRead()` exists in `SwarmMessagingService` but is never called. Agents receive duplicate messages on every `getMessages()` poll.

- **Fix**: Call `markRead()` in the `handleSwarmGetMessages` handler after returning messages.

### 2. Missing Unit Tests for Core Services

No tests for `SwarmService`, `SwarmTaskService`, `SwarmMessagingService`, swarm HTTP routes in `mcp-status-server.service.ts`, or individual MCP swarm tools.

- **Fix**: Write test suites for all three services + HTTP route tests.

### 3. No Client-Side Role Guard on Lead-Only MCP Tools

`swarm-spawn-teammate` and `swarm-create-task` MCP tools check `swarmId` but never validate `swarmRole === 'lead'` client-side. Backend already enforces this (403), but defense-in-depth is missing.

- **Fix**: Add `swarmRole` check in the MCP tool handlers before making HTTP call.

### 4. Swarm Instructions Always Emitted for ALL Sessions

`server.ts` always includes swarm tool documentation even for non-swarm sessions, wasting AI context window.

- **Fix**: Conditionally include swarm instructions only when `config.swarmId` is set.

### 5. Spawn Schema Allows 'lead' Role

`SwarmSpawnTeammateTool` Zod enum includes `'lead'` — spawning a second lead breaks hierarchical strategy.

- **Fix**: Remove `'lead'` from the spawn-teammate and create-task Zod role enums.

### 6. No Total Agent Limit in Config UI

`SwarmConfigModal` caps individual roles at 6 but doesn't enforce `MAX_SWARM_AGENTS` total across all roles.

- **Fix**: Add total count validation in the modal, disable add when total >= MAX_SWARM_AGENTS.

### 7. No Tests for Swarm HTTP Routes

`mcp-status-server.service.spec.ts` doesn't test any `/swarm/*` endpoints.

- **Fix**: Add test cases for all 9 swarm HTTP route handlers.

---

## UI/UX Improvements — Next Iteration

### 8. Canvas: Agents Don't Show Connections Between Each Other

Currently edges only connect Lead → Workers. When agents communicate (send messages), there's no visual indication.

- **Fix**: Add edges between agents that have exchanged messages, or show communication activity indicators.

### 9. Canvas: Task Counts Don't Reflect Actual Work

The agent node task count (`assignedTaskIds.length`) doesn't match the number of tasks agents actually worked on. The count relies on agents calling `get-assignment`, but lead-created tasks may not be reflected.

- **Fix**: Review the task assignment flow — ensure task counts update accurately. Consider showing task details on hover/click.

### 10. Canvas: No Results Summary

Users must go to the terminal view to see agent results. The canvas should surface a summary panel or expandable results view.

- **Fix**: When swarm completes, show a results summary panel on the canvas. Pull from `SwarmTaskService` completed tasks with their `result` field. Consider a collapsible panel or modal with all agent reports.

### 11. Canvas: Node Positions Reset on Every Agent Status Update

`useEffect` sets nodes/edges from scratch on every agent array change, losing any user dragging.

- **Fix**: Diff incoming agents against current nodes — only add/remove/update changed nodes, preserve positions for unchanged ones.

### 12. React Flow `colorMode` Hardcoded to "dark"

Ignores the app's theme setting.

- **Fix**: Read theme from `useSettingsStore` and pass the correct colorMode.

### 13. Terminal Link Doesn't Navigate to Specific Session

Clicking an agent's "terminal" link should switch to that session's tab.

- **Fix**: Use `useWorkspaceStore` to activate the agent's session tab on click.

---

## Medium Priority — Fix Soon

### 14. Refactoring Template Has No Lead Role

Falls back to architect as first role. Should explicitly include lead.

- **Fix**: Add lead role to the "Refactoring Squad" template in `swarm-templates.ts`.

### 15. Initial Prompt Timing Fragile

Hardcoded `setTimeout(3000)` + `setTimeout(500)` for writing initial prompt to terminal. May fail on slow machines or fast ones.

- **Fix**: Watch for terminal readiness signal (e.g., detect Claude CLI prompt appearance) before writing.

### 16. No Task Dependency Cycle Detection

Creating circular dependencies (A depends on B, B depends on A) causes permanent blocking.

- **Fix**: Add cycle detection in `createTask()` before accepting dependencies.

### 17. Error State Recovery Impossible

`VALID_SWARM_TRANSITIONS` only allows `error → cancelled`. No way to retry.

- **Fix**: Consider adding `error → starting` transition, or at minimum a "retry" UI action.

### 18. Unused Task Statuses

`in_progress` and `review` statuses exist in the type but are never set by any code path.

- **Fix**: Either use them (agents call a tool to update status) or remove from the type.

### 19. Unbounded Message Accumulation

Messages grow without limit in both backend Map and frontend Zustand store.

- **Fix**: Add a cap (e.g., last 500 messages per swarm) with oldest-first eviction.

### 20. No Input Length Validation on Swarm Fields

Goal and task description fields accept unlimited text.

- **Fix**: Add maxlength validation in both frontend modal and backend `createTask`.

---

## Low Priority — Address Later

- `mcpReadySessions` Set in `McpStatusServerService` grows unboundedly (memory leak for long-running instances)
- Dead event constants (`SPAWN_TEAMMATE` in internal events, `SwarmEvents.ERROR`/`REMOVED` may be unused)
- Inline gateway response types should be moved to shared payloads
- No file lock timeout/expiry mechanism (stale locks from crashed agents persist)
- Missing keyboard shortcut for swarm view toggle
- React Flow attribution hidden — verify license compliance for Pro features
- Environment spec in MCP server doesn't test swarm fields
- Spawn timeout mismatch: client-side MCP tool has 10s timeout, server `waitForSessionMcpReady` uses 20s
- `reportResult()` doesn't verify the reporter is the assigned agent
- No cleanup/expiry for completed swarms (Maps never cleaned after done/cancelled)
- No rate limiting on MCP HTTP endpoints

---

## Completed (This Session)

- [x] Fixed `.mcp.json` race condition — spawn serialization via per-swarm Mutex + MCP readiness wait
- [x] Fixed variable shadowing in `handleSwarmSpawnTeammate` (`const agent` → `const teammate`)
- [x] Fixed `SwarmSummaryPanel` counting only `assigned` instead of `assigned || in_progress`
- [x] Fixed `[object Object]` in session ID capture logs (type guard returned object, not string)
- [x] Fixed initial prompt not reaching CLI args (added to `CliSessionContext` + `LaunchContext`)
- [x] Fixed terminal Enter key not submitting (separate text + `\r` writes with delay)
- [x] Fixed SwarmCanvas not updating (added `useEffect` to sync React Flow state)
- [x] Fixed task counts showing 0 (added `addTaskToAgent()` in `SwarmService`)
- [x] Added lead-only authorization for spawn-teammate and create-task (403 for non-lead)
- [x] Added role-filtered task assignment in `getAssignment()`
- [x] Added `planning → completing` state transition
- [x] Added file path normalization/validation in `claimFiles`/`releaseFiles`
- [x] Fixed reconnect response shape in `useSwarmStore` (`LIST` handler)
- [x] Rewrote all 6 role prompts with mandatory status reporting sections
- [x] Made Lead agent strictly orchestrator-only (no code review/coding)
- [x] Added `SwarmSummaryPanel` component on canvas
