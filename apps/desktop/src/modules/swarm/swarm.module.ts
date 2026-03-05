import { Module, forwardRef } from '@nestjs/common';
import { SessionModule } from '../session';
import { McpModule } from '../mcp';
import { SwarmService } from './swarm.service';
import { SwarmTaskService } from './swarm-task.service';
import { SwarmMessagingService } from './swarm-messaging.service';
import { SwarmGateway } from './swarm.gateway';

@Module({
  imports: [forwardRef(() => SessionModule), forwardRef(() => McpModule)],
  providers: [SwarmService, SwarmTaskService, SwarmMessagingService, SwarmGateway],
  exports: [SwarmService, SwarmTaskService, SwarmMessagingService],
})
export class SwarmModule {}
