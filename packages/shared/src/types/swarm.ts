// Swarm role types
export type SwarmRole = 'lead' | 'builder' | 'reviewer' | 'architect' | 'tester' | 'security';

// Swarm lifecycle states
export type SwarmStatus =
  | 'configuring' // User setting up roles/goal
  | 'starting' // Spawning lead session
  | 'planning' // Lead is decomposing the goal
  | 'active' // Agents working
  | 'completing' // Lead reviewing final results
  | 'done' // All work complete
  | 'error' // Something went wrong
  | 'cancelled'; // User cancelled

export type SwarmTaskStatus =
  | 'pending' // Not yet assigned
  | 'blocked' // Waiting on dependencies
  | 'assigned' // Given to an agent
  | 'completed' // Approved and done
  | 'failed'; // Failed, may need reassignment

export interface SwarmConfig {
  id: string;
  name: string;
  goal: string;
  projectPath: string;
  status: SwarmStatus;
  strategy: 'hierarchical'; // v1: only hierarchical (Lead + workers)
  roles: SwarmRoleConfig[];
  leadSessionId?: string;
  memberSessionIds: string[];
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface SwarmRoleConfig {
  role: SwarmRole;
  count: number;
  systemPrompt?: string; // Override default role prompt
  model?: string;
}

export interface SwarmAgent {
  id: string;
  swarmId: string;
  sessionId: string; // Links to existing Omniscribe session
  role: SwarmRole;
  status: 'pending' | 'spawning' | 'active' | 'idle' | 'error' | 'stopped';
  assignedTaskIds: string[];
  claimedFiles: string[];
}

export interface SwarmTask {
  id: string;
  swarmId: string;
  subject: string;
  description?: string;
  status: SwarmTaskStatus;
  assignedTo?: string; // SwarmAgent ID
  assignedRole?: SwarmRole;
  dependsOn: string[]; // Task IDs that must complete first
  result?: string; // Completion summary
  reviewFeedback?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SwarmMessage {
  id: string;
  swarmId: string;
  fromAgentId: string;
  toAgentId: string | 'all'; // 'all' = broadcast
  content: string;
  type: 'task_assignment' | 'result' | 'review' | 'info' | 'request';
  timestamp: string;
  read: boolean;
}

// Swarm templates
export interface SwarmTemplate {
  id: string;
  name: string;
  description: string;
  roles: SwarmRoleConfig[];
  isBuiltIn: boolean;
}

// MCP payloads for swarm tools
export interface SwarmGetAssignmentPayload {
  sessionId: string;
  instanceId: string;
  swarmId: string;
}

export interface SwarmReportResultPayload {
  sessionId: string;
  instanceId: string;
  swarmId: string;
  taskId: string;
  result: string;
  status: 'completed' | 'failed';
}

export interface SwarmClaimFilesPayload {
  sessionId: string;
  instanceId: string;
  swarmId: string;
  files: string[];
}

export interface SwarmReleaseFilesPayload {
  sessionId: string;
  instanceId: string;
  swarmId: string;
  files?: string[];
}

export interface SwarmSendMessagePayload {
  sessionId: string;
  instanceId: string;
  swarmId: string;
  toAgentId: string | 'all';
  content: string;
  type: SwarmMessage['type'];
}

export interface SwarmGetMessagesPayload {
  sessionId: string;
  instanceId: string;
  swarmId: string;
}

export interface SwarmGetContextPayload {
  sessionId: string;
  instanceId: string;
  swarmId: string;
}

export interface SwarmSpawnTeammatePayload {
  sessionId: string;
  instanceId: string;
  swarmId: string;
  role: SwarmRole;
  taskDescription?: string;
}

export interface SwarmCreateTaskPayload {
  sessionId: string;
  instanceId: string;
  swarmId: string;
  subject: string;
  description?: string;
  assignedRole?: SwarmRole;
  dependsOn?: string[];
}

// Response types for MCP tools
export interface SwarmContextResponse {
  swarm: SwarmConfig;
  agents: SwarmAgent[];
  tasks: SwarmTask[];
  recentMessages: SwarmMessage[];
}

export interface SwarmClaimFilesResponse {
  claimed: string[];
  denied: string[];
}

// WebSocket payloads
export interface CreateSwarmPayload {
  name: string;
  goal: string;
  projectPath: string;
  roles: SwarmRoleConfig[];
}

export interface SwarmStatusUpdate {
  swarmId: string;
  status: SwarmStatus;
  error?: string;
}

export interface SwarmAgentUpdate {
  swarmId: string;
  agent: SwarmAgent;
}

export interface SwarmTaskUpdate {
  swarmId: string;
  task: SwarmTask;
}

export interface SwarmMessageUpdate {
  swarmId: string;
  message: SwarmMessage;
}
