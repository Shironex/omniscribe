import { Module, Global } from '@nestjs/common';
import { UsageService } from './usage.service';
import { UsageGateway } from './usage.gateway';
import { ClaudeCliGuard } from '../../common/guards';

@Global()
@Module({
  providers: [UsageService, UsageGateway, ClaudeCliGuard],
  exports: [UsageService],
})
export class UsageModule {}
