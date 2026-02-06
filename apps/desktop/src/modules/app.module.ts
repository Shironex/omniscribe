import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { TerminalModule } from './terminal';
import { WorkspaceModule } from './workspace';
import { SessionModule } from './session/session.module';
import { GitModule } from './git/git.module';
import { McpModule } from './mcp/mcp.module';
import { UsageModule } from './usage';

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
        limit: 10, // max 10 requests per second
      },
      {
        name: 'medium',
        ttl: 10000, // 10 second window
        limit: 50, // max 50 requests per 10 seconds
      },
    ]),
    TerminalModule,
    WorkspaceModule,
    SessionModule,
    GitModule,
    McpModule,
    UsageModule,
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class AppModule {}
