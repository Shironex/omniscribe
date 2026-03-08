import { Module, forwardRef } from '@nestjs/common';
import { SessionModule } from '../session';
import { SwarmService } from './swarm.service';
import { SwarmTaskService } from './swarm-task.service';
import { SwarmMessagingService } from './swarm-messaging.service';
import { SwarmFileService } from './swarm-file.service';
import { SwarmFileWatcherService } from './swarm-file-watcher.service';
import { SwarmGateway } from './swarm.gateway';

@Module({
  imports: [forwardRef(() => SessionModule)],
  providers: [
    SwarmService,
    SwarmTaskService,
    SwarmMessagingService,
    SwarmFileService,
    SwarmFileWatcherService,
    SwarmGateway,
  ],
  exports: [
    SwarmService,
    SwarmTaskService,
    SwarmMessagingService,
    SwarmFileService,
    SwarmFileWatcherService,
  ],
})
export class SwarmModule {}
