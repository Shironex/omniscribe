import { Module } from '@nestjs/common';
import { SessionModule } from '../session';
import { WorkspaceModule } from '../workspace';
import { NotificationService } from './notification.service';

@Module({
  imports: [SessionModule, WorkspaceModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
