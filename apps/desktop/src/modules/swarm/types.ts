import { SwarmConfig, SwarmAgent } from '@omniscribe/shared';

export interface BackendSwarmConfig extends SwarmConfig {
  // Backend-specific fields can be added here
}

export interface BackendSwarmAgent extends SwarmAgent {
  // Backend-specific fields
  spawnedAt?: Date;
  lastActivityAt?: Date;
}

export interface FileLock {
  agentId: string;
  claimedAt: Date;
}
