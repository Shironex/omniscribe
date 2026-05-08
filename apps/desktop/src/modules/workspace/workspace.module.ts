import { Module, forwardRef } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { WorkspaceGateway } from './workspace.gateway';
import { QuickActionService } from './quick-action.service';
import { CustomCommandService } from './custom-command.service';
import { CustomCommandGateway } from './custom-command.gateway';
import { TerminalModule } from '../terminal';
import { GitModule } from '../git';
import { SessionModule } from '../session';

@Module({
  imports: [TerminalModule, GitModule, forwardRef(() => SessionModule)],
  providers: [
    WorkspaceService,
    WorkspaceGateway,
    QuickActionService,
    CustomCommandService,
    CustomCommandGateway,
  ],
  exports: [WorkspaceService, QuickActionService, CustomCommandService],
})
export class WorkspaceModule {}
