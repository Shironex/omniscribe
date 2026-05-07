import { Module } from '@nestjs/common';
import { ClaudeChangelogService } from './claude-changelog.service';
import { ClaudeChangelogGateway } from './claude-changelog.gateway';

@Module({
  providers: [ClaudeChangelogService, ClaudeChangelogGateway],
  exports: [ClaudeChangelogService],
})
export class ClaudeChangelogModule {}
