import { Module, Global } from '@nestjs/common';
import { TerminalService } from './terminal.service';
import { TerminalGateway } from './terminal.gateway';
import { ShellIntegrationService } from './shell-integration.service';

@Global()
@Module({
  providers: [TerminalService, TerminalGateway, ShellIntegrationService],
  exports: [TerminalService, TerminalGateway],
})
export class TerminalModule {}
