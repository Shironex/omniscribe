import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { CORS_CONFIG } from '../shared/cors.config';
import { InternalPluginEvents } from '../shared/events';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginLoaderService } from './plugin-loader.service';
import { ALLOWED_PROVIDER_INVOKE_METHODS } from '@omniscribe/plugin-api';
import {
  PluginEvents,
  createLogger,
  extractErrorMessage,
  type PluginSetEnabledPayload,
  type PluginInvokePayload,
  type ProviderInfo,
} from '@omniscribe/shared';

@UseGuards(WsThrottlerGuard)
@WebSocketGateway({
  cors: CORS_CONFIG,
})
export class PluginGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  private readonly logger = createLogger('PluginGateway');

  constructor(
    private readonly registryService: PluginRegistryService,
    private readonly loaderService: PluginLoaderService
  ) {}

  afterInit(): void {
    this.logger.log('Initialized');
  }

  // ============================================
  // WebSocket Event Handlers (Client -> Server)
  // ============================================

  /**
   * List all registered providers.
   */
  @SkipThrottle()
  @SubscribeMessage(PluginEvents.LIST_PROVIDERS)
  handleListProviders(@ConnectedSocket() _client: Socket): { providers: ProviderInfo[] } {
    try {
      const providers = this.registryService.listProviders();
      return { providers };
    } catch (error) {
      const msg = extractErrorMessage(error);
      this.logger.error(`Failed to list providers: ${msg}`);
      return { providers: [] };
    }
  }

  /**
   * Enable or disable a provider by aiMode.
   */
  @SkipThrottle()
  @SubscribeMessage(PluginEvents.SET_ENABLED)
  async handleSetEnabled(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: PluginSetEnabledPayload
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { aiMode, enabled } = payload;
      const success = this.registryService.setEnabled(aiMode, enabled);
      if (!success) {
        return { success: false, error: `No provider registered for aiMode: ${aiMode}` };
      }

      // If enabling, also activate the provider if not already activated
      if (enabled) {
        const entry = this.registryService.getProviderEntry(aiMode);
        if (entry && !entry.activated) {
          await this.loaderService.activateProvider(aiMode);
        }
      } else {
        // Deactivate the provider when disabling (calls plugin.deactivate() + disposes context)
        await this.loaderService.deactivateProvider(aiMode);
      }

      // Broadcast the enabled state change to all clients
      this.server.emit(PluginEvents.PROVIDER_ENABLED, {
        aiMode,
        enabled,
      });

      return { success: true };
    } catch (error) {
      const msg = extractErrorMessage(error);
      this.logger.error(`Failed to set enabled for '${payload.aiMode}': ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Refresh CLI detection for all providers.
   */
  @SkipThrottle()
  @SubscribeMessage(PluginEvents.REFRESH_PROVIDERS)
  async handleRefreshProviders(
    @ConnectedSocket() _client: Socket
  ): Promise<{ providers: ProviderInfo[] }> {
    try {
      await this.loaderService.refreshCliDetection();
      const providers = this.registryService.listProviders();
      return { providers };
    } catch (error) {
      const msg = extractErrorMessage(error);
      this.logger.error(`Failed to refresh providers: ${msg}`);
      return { providers: this.registryService.listProviders() };
    }
  }

  /**
   * Invoke an allowed method on a plugin by its pluginId.
   * Used for ad-hoc plugin method calls from the frontend.
   */
  @SkipThrottle()
  @SubscribeMessage(PluginEvents.INVOKE)
  async handleInvoke(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: PluginInvokePayload
  ): Promise<{ result?: unknown; error?: string }> {
    try {
      const { pluginId, method } = payload;
      const args = Array.isArray(payload.args) ? payload.args : [];

      // Security: only allow methods defined on the AiProviderPlugin interface
      if (!ALLOWED_PROVIDER_INVOKE_METHODS.has(method)) {
        return { error: 'Method is not allowed for remote invocation' };
      }

      // Find the provider entry by plugin ID
      const entry = this.registryService.getProviderEntryByPluginId(pluginId);
      if (!entry) {
        return { error: 'No provider found for the given pluginId' };
      }
      if (!entry.activated) {
        return { error: 'Provider is not activated' };
      }

      // Invoke the allowed method on the plugin
      const plugin = entry.plugin as unknown as Record<string, unknown>;
      const fn = plugin[method];
      if (typeof fn !== 'function') {
        return { error: `Method '${method}' not found on plugin '${pluginId}'` };
      }

      const result = await fn.apply(entry.plugin, args);
      return { result };
    } catch (error) {
      const msg = extractErrorMessage(error);
      this.logger.error(`Plugin invoke failed: ${msg}`);
      return { error: msg };
    }
  }

  // ============================================
  // Internal Event Handlers (Backend -> WebSocket)
  // ============================================

  /**
   * Broadcast provider status updates (CLI detection results) to all clients.
   */
  @OnEvent(InternalPluginEvents.ALL)
  handlePluginEvent(eventPayload: { pluginId: string; cliStatus?: unknown; error?: string }): void {
    try {
      // Broadcast the updated provider list to all clients on any plugin event
      const providers = this.registryService.listProviders();
      this.server.emit(PluginEvents.PROVIDER_STATUS, { providers });

      // If it's an error event, also broadcast the specific error
      if (eventPayload.error) {
        this.server.emit(PluginEvents.PROVIDER_ERROR, {
          pluginId: eventPayload.pluginId,
          error: eventPayload.error,
        });
      }
    } catch (error) {
      const msg = extractErrorMessage(error);
      this.logger.warn(`Failed to broadcast plugin event: ${msg}`);
    }
  }
}
