import { Module, forwardRef } from '@nestjs/common';
import { TerminalModule } from '../terminal/terminal.module';
import { McpModule } from '../mcp/mcp.module';
import { GitModule } from '../git/git.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { SessionService } from './session.service';
import { SessionGateway } from './session.gateway';
import { CliCommandService } from './cli-command.service';
import { ClaudeSessionReaderService } from './claude-session-reader.service';
import { HookManagerService } from './hook-manager.service';

@Module({
  imports: [TerminalModule, McpModule, GitModule, forwardRef(() => WorkspaceModule)],
  providers: [
    CliCommandService,
    SessionService,
    SessionGateway,
    ClaudeSessionReaderService,
    HookManagerService,
  ],
  exports: [SessionService, CliCommandService, ClaudeSessionReaderService, HookManagerService],
})
export class SessionModule {}
