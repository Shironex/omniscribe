import { Module, Global } from '@nestjs/common';
import { TerminalService } from './terminal.service';
import { TerminalGateway } from './terminal.gateway';

@Global()
@Module({
  providers: [TerminalService, TerminalGateway],
  exports: [TerminalService, TerminalGateway],
})
export class TerminalModule {}
