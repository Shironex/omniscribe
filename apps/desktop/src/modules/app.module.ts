import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TerminalModule } from './terminal';

@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
    TerminalModule,
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class AppModule {}
