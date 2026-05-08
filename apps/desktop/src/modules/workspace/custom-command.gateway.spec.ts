import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { Server, Socket } from 'socket.io';
import { CustomCommandGateway } from './custom-command.gateway';
import { CustomCommandService } from './custom-command.service';
import { TerminalGateway } from '../terminal';
import { CustomCommandEvents, type CustomCommand } from '@omniscribe/shared';

function createMockSocket(): Socket {
  return {
    id: 'client-1',
    emit: jest.fn(),
    join: jest.fn(),
  } as unknown as Socket;
}

function createMockServer(): Server {
  return {
    emit: jest.fn(),
  } as unknown as Server;
}

function sample(id = 'cmd-1'): CustomCommand {
  return {
    id,
    label: 'List',
    icon: 'Folder',
    command: 'ls -la',
    createdAt: '2026-05-08T10:00:00.000Z',
    updatedAt: '2026-05-08T10:00:00.000Z',
  };
}

describe('CustomCommandGateway', () => {
  let gateway: CustomCommandGateway;
  let customCommandService: jest.Mocked<CustomCommandService>;
  let terminalGateway: jest.Mocked<TerminalGateway>;
  let mockServer: Server;

  beforeEach(async () => {
    customCommandService = {
      list: jest.fn().mockReturnValue([]),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      execute: jest.fn(),
    } as unknown as jest.Mocked<CustomCommandService>;

    terminalGateway = {
      registerClientSession: jest.fn(),
    } as unknown as jest.Mocked<TerminalGateway>;

    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      providers: [
        CustomCommandGateway,
        { provide: CustomCommandService, useValue: customCommandService },
        { provide: TerminalGateway, useValue: terminalGateway },
      ],
    }).compile();

    gateway = module.get<CustomCommandGateway>(CustomCommandGateway);
    mockServer = createMockServer();
    gateway.server = mockServer;
  });

  it('rejects list calls with invalid projectPath', () => {
    const result = gateway.handleList({ projectPath: '' as unknown as string }, createMockSocket());
    expect(result.error).toBeDefined();
    expect(customCommandService.list).not.toHaveBeenCalled();
  });

  it('returns commands on a valid list call', () => {
    customCommandService.list.mockReturnValue([sample()]);
    const result = gateway.handleList({ projectPath: '/abs/path' }, createMockSocket());
    expect(result.commands).toHaveLength(1);
    expect(result.error).toBeUndefined();
  });

  it('broadcasts CHANGED on create and returns new command + list', () => {
    const created = sample('new');
    customCommandService.create.mockReturnValue(created);
    customCommandService.list.mockReturnValue([created]);

    const result = gateway.handleCreate(
      {
        projectPath: '/abs/path',
        command: { label: 'List', icon: 'Folder', command: 'ls -la' },
      },
      createMockSocket()
    );

    expect(result.success).toBe(true);
    expect(result.command).toEqual(created);
    expect(result.commands).toEqual([created]);
    expect(mockServer.emit).toHaveBeenCalledWith(CustomCommandEvents.CHANGED, {
      projectPath: '/abs/path',
      commands: [created],
    });
  });

  it('returns the service error when create throws', () => {
    customCommandService.create.mockImplementation(() => {
      throw new Error('Label is required');
    });

    const result = gateway.handleCreate(
      {
        projectPath: '/abs/path',
        command: { label: '', icon: 'Folder', command: 'ls' },
      },
      createMockSocket()
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Label/);
    expect(mockServer.emit).not.toHaveBeenCalled();
  });

  it('reports not-found on update of an unknown id', () => {
    customCommandService.update.mockReturnValue(null);
    const result = gateway.handleUpdate(
      { projectPath: '/abs/path', id: 'nope', updates: { label: 'x' } },
      createMockSocket()
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('broadcasts CHANGED on delete', () => {
    customCommandService.remove.mockReturnValue(true);
    customCommandService.list.mockReturnValue([]);

    const result = gateway.handleDelete(
      { projectPath: '/abs/path', id: 'cmd-1' },
      createMockSocket()
    );

    expect(result.success).toBe(true);
    expect(mockServer.emit).toHaveBeenCalledWith(CustomCommandEvents.CHANGED, {
      projectPath: '/abs/path',
      commands: [],
    });
  });

  it('returns sessionId + terminalSessionId and joins room on successful execute', async () => {
    customCommandService.execute.mockResolvedValue({
      sessionId: 'session-7',
      terminalSessionId: 42,
    });
    const socket = createMockSocket();
    const result = await gateway.handleExecute({ projectPath: '/abs/path', id: 'cmd-1' }, socket);
    expect(result.success).toBe(true);
    expect(result.sessionId).toBe('session-7');
    expect(result.terminalSessionId).toBe(42);
    expect(socket.join).toHaveBeenCalledWith('terminal:42');
    expect(terminalGateway.registerClientSession).toHaveBeenCalledWith('client-1', 42);
  });

  it('returns error response when execute throws', async () => {
    customCommandService.execute.mockRejectedValue(new Error('boom'));
    const result = await gateway.handleExecute(
      { projectPath: '/abs/path', id: 'cmd-1' },
      createMockSocket()
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/boom/);
  });
});
