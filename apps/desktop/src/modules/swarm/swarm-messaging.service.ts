import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'node:crypto';
import { MAX_SWARM_MESSAGES, SwarmMessage, createLogger } from '@omniscribe/shared';
import { InternalSwarmEvents } from '../shared/events';

@Injectable()
export class SwarmMessagingService {
  private readonly logger = createLogger('SwarmMessagingService');

  /** swarmId -> messages */
  private messages = new Map<string, SwarmMessage[]>();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Send a message between agents in a swarm.
   */
  sendMessage(
    swarmId: string,
    fromAgentId: string,
    toAgentId: string | 'all',
    content: string,
    type: SwarmMessage['type']
  ): SwarmMessage {
    const message: SwarmMessage = {
      id: crypto.randomUUID(),
      swarmId,
      fromAgentId,
      toAgentId,
      content,
      type,
      timestamp: new Date().toISOString(),
      read: false,
    };

    const swarmMessages = this.messages.get(swarmId) ?? [];
    swarmMessages.push(message);
    if (swarmMessages.length > MAX_SWARM_MESSAGES) {
      swarmMessages.splice(0, swarmMessages.length - MAX_SWARM_MESSAGES);
    }
    this.messages.set(swarmId, swarmMessages);

    this.logger.debug(
      `Message ${message.id} in swarm ${swarmId}: ${fromAgentId} -> ${toAgentId} (${type})`
    );

    this.eventEmitter.emit(InternalSwarmEvents.MESSAGE, { swarmId, message });

    return message;
  }

  /**
   * Get unread messages for an agent.
   * Returns messages where toAgentId matches the agent or is 'all'.
   */
  getMessages(swarmId: string, agentId: string): SwarmMessage[] {
    const swarmMessages = this.messages.get(swarmId) ?? [];

    return swarmMessages.filter(
      m =>
        !m.read && (m.toAgentId === agentId || m.toAgentId === 'all') && m.fromAgentId !== agentId
    );
  }

  /**
   * Mark messages as read.
   */
  markRead(swarmId: string, messageIds: string[]): void {
    const swarmMessages = this.messages.get(swarmId);
    if (!swarmMessages) return;

    const idSet = new Set(messageIds);
    for (const message of swarmMessages) {
      if (idSet.has(message.id)) {
        message.read = true;
      }
    }

    this.logger.debug(`Marked ${messageIds.length} messages as read in swarm ${swarmId}`);
  }

  /**
   * Get the most recent messages for a swarm.
   */
  getRecentMessages(swarmId: string, limit = 50): SwarmMessage[] {
    const swarmMessages = this.messages.get(swarmId) ?? [];

    return swarmMessages.slice(-limit);
  }

  /**
   * Remove all messages for a swarm.
   */
  cleanup(swarmId: string): void {
    this.messages.delete(swarmId);
    this.logger.info(`Cleaned up messages for swarm ${swarmId}`);
  }
}
