import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Create a scoped event interface for a plugin.
 * Returns { emit, on, off } methods scoped to the plugin's namespace.
 */
export function createPluginEventInterface(
  eventEmitter: EventEmitter2,
  pluginId: string
): {
  emit: (event: string, payload?: unknown) => void;
  on: (event: string, handler: (data: unknown) => void) => () => void;
  off: (event: string, handler: (data: unknown) => void) => void;
} {
  const prefix = `plugin.${pluginId}`;

  return {
    emit: (event: string, payload?: unknown) => {
      eventEmitter.emit(`${prefix}.${event}`, { pluginId, event, data: payload });
    },
    on: (event: string, handler: (data: unknown) => void) => {
      const fullEvent = `${prefix}.${event}`;
      eventEmitter.on(fullEvent, handler);
      return () => eventEmitter.removeListener(fullEvent, handler);
    },
    off: (event: string, handler: (data: unknown) => void) => {
      eventEmitter.removeListener(`${prefix}.${event}`, handler);
    },
  };
}
