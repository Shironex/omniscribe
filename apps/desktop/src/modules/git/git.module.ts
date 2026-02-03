import { Module } from '@nestjs/common';
import { GitService } from './git.service';
import { WorktreeService } from './worktree.service';
import { GithubService } from './github.service';
import { GitGateway } from './git.gateway';

@Module({
  providers: [GitService, WorktreeService, GithubService, GitGateway],
  exports: [GitService, WorktreeService, GithubService],
})
export class GitModule {}
