import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthService } from './health.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
