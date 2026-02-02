import { Module } from '@nestjs/common';
import { GitService } from './git.service';
import { WorktreeService } from './worktree.service';
import { GitGateway } from './git.gateway';

@Module({
  providers: [GitService, WorktreeService, GitGateway],
  exports: [GitService, WorktreeService],
})
export class GitModule {}
