import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { TerminalModule } from './terminal';
import { WorkspaceModule } from './workspace';
import { SessionModule } from './session';
import { GitModule } from './git';
import { McpModule } from './mcp';
import { UsageModule } from './usage';
import { HealthModule } from './health';
import { PluginModule } from './plugin';

@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 second window
        limit: 100, // max 100 requests per second (desktop app — single user)
      },
      {
        name: 'medium',
        ttl: 10000, // 10 second window
        limit: 500, // max 500 requests per 10 seconds
      },
    ]),
    // PluginModule must be after ThrottlerModule but before domain modules
    // so PluginRegistryService is available for injection everywhere.
    // Phase 12: empty plugin list. Phase 13 adds Claude plugin definition.
    PluginModule.forRoot([]),
    TerminalModule,
    WorkspaceModule,
    SessionModule,
    GitModule,
    McpModule,
    UsageModule,
    HealthModule,
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class AppModule {}
