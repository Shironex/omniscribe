import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SessionModule } from '../session/session.module';
import { HealthService } from './health.service';

@Module({
  imports: [ScheduleModule.forRoot(), SessionModule],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
