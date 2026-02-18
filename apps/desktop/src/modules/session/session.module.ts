import { Module, forwardRef } from '@nestjs/common';
import { TerminalModule } from '../terminal';
import { McpModule } from '../mcp';
import { GitModule } from '../git';
import { WorkspaceModule } from '../workspace';
import { SessionService } from './session.service';
import { SessionLauncherService } from './session-launcher.service';
import { ClaudeSessionTrackerService } from './claude-session-tracker.service';
import { SessionGateway } from './session.gateway';
import { CliCommandService } from './cli-command.service';

@Module({
  imports: [TerminalModule, McpModule, GitModule, forwardRef(() => WorkspaceModule)],
  providers: [
    CliCommandService,
    SessionService,
    ClaudeSessionTrackerService,
    SessionLauncherService,
    SessionGateway,
  ],
  exports: [SessionService, CliCommandService],
})
export class SessionModule {}
