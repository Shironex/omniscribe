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
import { ClaudeSessionReaderService } from './claude-session-reader.service';
import { HookManagerService } from './hook-manager.service';

@Module({
  imports: [TerminalModule, McpModule, GitModule, forwardRef(() => WorkspaceModule)],
  providers: [
    CliCommandService,
    ClaudeSessionReaderService,
    HookManagerService,
    SessionService,
    ClaudeSessionTrackerService,
    SessionLauncherService,
    SessionGateway,
  ],
  exports: [
    SessionService,
    SessionLauncherService,
    ClaudeSessionTrackerService,
    CliCommandService,
    ClaudeSessionReaderService,
    HookManagerService,
  ],
})
export class SessionModule {}
