import { Module } from '@nestjs/common';
import { GitBaseService } from './git-base.service';
import { GitBranchService } from './git-branch.service';
import { GitStatusService } from './git-status.service';
import { GitCommitService } from './git-commit.service';
import { GitDiffService } from './git-diff.service';
import { GitRemoteService } from './git-remote.service';
import { GitRepoService } from './git-repo.service';
import { GitService } from './git.service';
import { ScmService } from './scm.service';
import { WorktreeService } from './worktree.service';
import { GithubService } from './github.service';
import { GitGateway } from './git.gateway';
import { ScmGateway } from './scm.gateway';
import { GithubGateway } from './github.gateway';

@Module({
  providers: [
    // Base service (shared dependency)
    GitBaseService,
    // Domain services
    GitBranchService,
    GitStatusService,
    GitCommitService,
    GitDiffService,
    GitRemoteService,
    GitRepoService,
    // Facade service
    GitService,
    // SCM (staging/commit/history) surface
    ScmService,
    // Other services
    WorktreeService,
    GithubService,
    GitGateway,
    ScmGateway,
    GithubGateway,
  ],
  exports: [
    GitBaseService,
    GitBranchService,
    GitStatusService,
    GitCommitService,
    GitDiffService,
    GitRemoteService,
    GitRepoService,
    GitService,
    ScmService,
    WorktreeService,
    GithubService,
  ],
})
export class GitModule {}
