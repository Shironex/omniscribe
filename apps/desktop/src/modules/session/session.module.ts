import { Module, forwardRef } from '@nestjs/common';
import { TerminalModule } from '../terminal/terminal.module';
import { McpModule } from '../mcp/mcp.module';
import { GitModule } from '../git/git.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { SessionService } from './session.service';
import { SessionGateway } from './session.gateway';

@Module({
  imports: [
    TerminalModule,
    McpModule,
    GitModule,
    forwardRef(() => WorkspaceModule),
  ],
  providers: [SessionService, SessionGateway],
  exports: [SessionService],
})
export class SessionModule {}
