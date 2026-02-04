import { Module, Global } from '@nestjs/common';
import { UsageService } from './usage.service';
import { UsageGateway } from './usage.gateway';

@Global()
@Module({
  providers: [UsageService, UsageGateway],
  exports: [UsageService],
})
export class UsageModule {}
