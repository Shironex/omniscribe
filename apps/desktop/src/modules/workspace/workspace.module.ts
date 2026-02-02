import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { WorkspaceGateway } from './workspace.gateway';
import { QuickActionService } from './quick-action.service';
import { TerminalModule } from '../terminal/terminal.module';
import { GitModule } from '../git/git.module';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [TerminalModule, GitModule, SessionModule],
  providers: [WorkspaceService, WorkspaceGateway, QuickActionService],
  exports: [WorkspaceService, QuickActionService],
})
export class WorkspaceModule {}
