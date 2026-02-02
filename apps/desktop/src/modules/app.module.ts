import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TerminalModule } from './terminal';
import { WorkspaceModule } from './workspace';

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
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class AppModule {}
