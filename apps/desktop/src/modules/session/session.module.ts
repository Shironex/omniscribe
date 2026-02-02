import { Module } from '@nestjs/common';
import { TerminalModule } from '../terminal/terminal.module';
import { SessionService } from './session.service';
import { SessionGateway } from './session.gateway';

@Module({
  imports: [TerminalModule],
  providers: [SessionService, SessionGateway],
  exports: [SessionService],
})
export class SessionModule {}
