import { Module } from '@nestjs/common';
import { GitBaseService } from './git-base.service';
import { GitBranchService } from './git-branch.service';
import { GitStatusService } from './git-status.service';
import { GitCommitService } from './git-commit.service';
import { GitRemoteService } from './git-remote.service';
import { GitRepoService } from './git-repo.service';
import { GitService } from './git.service';
import { WorktreeService } from './worktree.service';
import { GithubService } from './github.service';
import { GitGateway } from './git.gateway';

@Module({
  providers: [
    // Base service (shared dependency)
    GitBaseService,
    // Domain services
    GitBranchService,
    GitStatusService,
    GitCommitService,
    GitRemoteService,
    GitRepoService,
    // Facade service
    GitService,
    // Other services
    WorktreeService,
    GithubService,
    GitGateway,
  ],
  exports: [
    GitBaseService,
    GitBranchService,
    GitStatusService,
    GitCommitService,
    GitRemoteService,
    GitRepoService,
    GitService,
    WorktreeService,
    GithubService,
  ],
})
export class GitModule {}
