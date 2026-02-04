import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
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
