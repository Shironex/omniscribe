import { EventEmitter2 } from '@nestjs/event-emitter';
import { MAX_SWARM_MESSAGES } from '@omniscribe/shared';
import { SwarmMessagingService } from './swarm-messaging.service';

describe('SwarmMessagingService', () => {
  let service: SwarmMessagingService;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(() => {
    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    service = new SwarmMessagingService(eventEmitter);
  });

  it('stores sent messages and emits swarm.message', () => {
    const message = service.sendMessage('swarm-1', 'agent-a', 'agent-b', 'hello', 'info');

    expect(message.swarmId).toBe('swarm-1');
    expect(message.fromAgentId).toBe('agent-a');
    expect(message.toAgentId).toBe('agent-b');
    expect(message.read).toBe(false);
    expect(service.getRecentMessages('swarm-1')).toHaveLength(1);
    expect(eventEmitter.emit).toHaveBeenCalledWith('swarm.message', {
      swarmId: 'swarm-1',
      message,
    });
  });

  it('returns only unread messages addressed to the agent or broadcast', () => {
    service.sendMessage('swarm-1', 'agent-a', 'agent-b', 'direct', 'info');
    service.sendMessage('swarm-1', 'agent-a', 'all', 'broadcast', 'info');
    service.sendMessage('swarm-1', 'agent-b', 'agent-a', 'reply', 'info');

    const messages = service.getMessages('swarm-1', 'agent-b');

    expect(messages.map(message => message.content)).toEqual(['direct', 'broadcast']);
  });

  it('marks messages as read so they are not returned again', () => {
    const first = service.sendMessage('swarm-1', 'agent-a', 'agent-b', 'one', 'info');
    const second = service.sendMessage('swarm-1', 'agent-a', 'agent-b', 'two', 'info');

    const unread = service.getMessages('swarm-1', 'agent-b');
    expect(unread.map(message => message.id)).toEqual([first.id, second.id]);

    service.markRead(
      'swarm-1',
      unread.map(message => message.id)
    );

    expect(service.getMessages('swarm-1', 'agent-b')).toEqual([]);
  });

  it('caps retained messages per swarm', () => {
    for (let index = 0; index < MAX_SWARM_MESSAGES + 5; index += 1) {
      service.sendMessage('swarm-1', 'agent-a', 'agent-b', `message-${index}`, 'info');
    }

    const recent = service.getRecentMessages('swarm-1', MAX_SWARM_MESSAGES + 10);

    expect(recent).toHaveLength(MAX_SWARM_MESSAGES);
    expect(recent[0]?.content).toBe('message-5');
    expect(recent.at(-1)?.content).toBe(`message-${MAX_SWARM_MESSAGES + 4}`);
  });

  it('cleans up messages for a swarm', () => {
    service.sendMessage('swarm-1', 'agent-a', 'agent-b', 'hello', 'info');

    service.cleanup('swarm-1');

    expect(service.getRecentMessages('swarm-1')).toEqual([]);
  });
});
