import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Server } from 'socket.io';
import { PluginGateway } from '../plugin.gateway';
import { PluginRegistryService } from '../plugin-registry.service';
import { PluginLoaderService } from '../plugin-loader.service';
import { InternalPluginEvents } from '../../shared/events';
import type { ProviderInfo } from '../types';

/**
 * Regression coverage for the @OnEvent('plugin.**') multi-level wildcard route.
 *
 * The sibling plugin.gateway.spec.ts calls gateway.handlePluginEvent(...) directly,
 * which never exercises EventEmitter2 wildcard routing. This spec emits a real
 * 3-segment event (plugin.<id>.cli-detected) through the live EventEmitter2 — with
 * the same wildcard config app.module.ts uses — and asserts the @OnEvent handler
 * actually fires. It guards the @nestjs/event-emitter v2 -> v3 upgrade, where the
 * wildcard engine (eventemitter2@6.4.9) is unchanged but only an end-to-end emit
 * proves the routing survived.
 */

function createMockServer(): Server {
  return {
    emit: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
  } as unknown as Server;
}

function createMockProviderInfo(aiMode = 'test-mode'): ProviderInfo {
  return {
    id: 'test-provider',
    displayName: 'Test Provider',
    description: 'A test provider plugin',
    aiMode,
    enabled: true,
    activated: true,
    cliStatus: { installed: true },
  };
}

const mockRegistryService = {
  listProviders: jest.fn().mockReturnValue([]),
  setEnabled: jest.fn().mockReturnValue(true),
  getProviderEntry: jest.fn(),
  getProviderEntryByPluginId: jest.fn(),
  getProvider: jest.fn(),
};

const mockLoaderService = {
  activateProvider: jest.fn().mockResolvedValue(true),
  deactivateProvider: jest.fn().mockResolvedValue(true),
  refreshCliDetection: jest.fn().mockResolvedValue(undefined),
  persistEnabledState: jest.fn(),
};

describe('PluginGateway — plugin.** wildcard routing', () => {
  let app: INestApplication;
  let gateway: PluginGateway;
  let eventEmitter: EventEmitter2;
  let mockServer: Server;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([]),
        // Mirror app.module.ts: multi-level wildcard matching requires this config.
        EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
      ],
      providers: [
        PluginGateway,
        { provide: PluginRegistryService, useValue: mockRegistryService },
        { provide: PluginLoaderService, useValue: mockLoaderService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // init() binds @OnEvent subscribers via EventEmitterModule's bootstrap lifecycle.
    // Without it the plugin.** listener never registers and the emit asserts nothing.
    await app.init();

    gateway = app.get(PluginGateway);
    eventEmitter = app.get(EventEmitter2);
    mockServer = createMockServer();
    gateway.server = mockServer;
  });

  afterEach(async () => {
    await app.close();
  });

  it('routes a real plugin.<id>.cli-detected emit to handlePluginEvent', () => {
    const handlerSpy = jest.spyOn(gateway, 'handlePluginEvent');
    const cliStatus = { installed: true };

    eventEmitter.emit(InternalPluginEvents.CLI_DETECTED('test-provider'), {
      pluginId: 'test-provider',
      cliStatus,
    });

    expect(handlerSpy).toHaveBeenCalledTimes(1);
    expect(handlerSpy).toHaveBeenCalledWith({ pluginId: 'test-provider', cliStatus });
  });

  it('broadcasts provider-status to clients when a wildcard event fires', () => {
    const providers = [createMockProviderInfo()];
    mockRegistryService.listProviders.mockReturnValue(providers);

    eventEmitter.emit(InternalPluginEvents.CLI_DETECTED('test-provider'), {
      pluginId: 'test-provider',
      cliStatus: { installed: true },
    });

    expect(mockServer.emit).toHaveBeenCalledWith('plugin:provider-status', { providers });
  });

  it('broadcasts provider-error when a wildcard error event fires', () => {
    mockRegistryService.listProviders.mockReturnValue([]);

    eventEmitter.emit(InternalPluginEvents.ERROR('test-provider'), {
      pluginId: 'test-provider',
      error: 'activation failed',
    });

    expect(mockServer.emit).toHaveBeenCalledWith('plugin:provider-error', {
      pluginId: 'test-provider',
      error: 'activation failed',
    });
  });

  it('routes every 3-segment plugin event variant through plugin.**', () => {
    const handlerSpy = jest.spyOn(gateway, 'handlePluginEvent');

    eventEmitter.emit(InternalPluginEvents.CLI_DETECTED('p1'), { pluginId: 'p1' });
    eventEmitter.emit(InternalPluginEvents.ACTIVATED('p2'), { pluginId: 'p2' });
    eventEmitter.emit(InternalPluginEvents.DEACTIVATED('p3'), { pluginId: 'p3' });
    eventEmitter.emit(InternalPluginEvents.ERROR('p4'), { pluginId: 'p4', error: 'boom' });

    expect(handlerSpy).toHaveBeenCalledTimes(4);
  });
});
