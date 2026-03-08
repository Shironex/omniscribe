// After migration to file-based swarm coordination (.omniscribe/swarm/),
// only spawn-teammate remains as an MCP tool (requires backend session creation).
// Other tools (get-assignment, report-result, claim-files, release-files,
// send-message, get-messages, get-context, create-task) are no longer needed —
// agents read/write coordination files directly.
export { SwarmSpawnTeammateTool } from './swarm-spawn-teammate.tool.js';
