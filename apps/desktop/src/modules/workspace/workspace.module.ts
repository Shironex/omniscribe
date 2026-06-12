import { Module, forwardRef } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { WorkspaceGateway } from './workspace.gateway';
import { QuickActionService } from './quick-action.service';
import { CustomCommandService } from './custom-command.service';
import { CustomCommandGateway } from './custom-command.gateway';
import { FootprintService } from './footprint.service';
import { TerminalModule } from '../terminal';
import { GitModule } from '../git';
import { McpModule } from '../mcp';
import { SessionModule } from '../session';

@Module({
  imports: [
    TerminalModule,
    GitModule,
    forwardRef(() => McpModule),
    forwardRef(() => SessionModule),
  ],
  providers: [
    WorkspaceService,
    WorkspaceGateway,
    QuickActionService,
    CustomCommandService,
    CustomCommandGateway,
    FootprintService,
  ],
  exports: [WorkspaceService, QuickActionService, CustomCommandService, FootprintService],
})
export class WorkspaceModule {}
