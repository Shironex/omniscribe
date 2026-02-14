import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Socket } from 'socket.io';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { validatePath } from '../shared/validation';
import { GithubService } from './github.service';
import {
  GithubStatusPayload,
  GithubStatusResponse,
  GithubProjectPayload,
  GithubRepoInfoResponse,
  GithubListPRsPayload,
  GithubPRsResponse,
  GithubCreatePRPayload,
  GithubCreatePRResponse,
  GithubGetPRPayload,
  GithubPRResponse,
  GithubListIssuesPayload,
  GithubIssuesResponse,
  GithubGetIssuePayload,
  GithubIssueResponse,
  GithubEvents,
  createLogger,
  extractErrorMessage,
} from '@omniscribe/shared';
import { CORS_CONFIG } from '../shared/cors.config';

@UseGuards(WsThrottlerGuard)
@WebSocketGateway({
  cors: CORS_CONFIG,
})
export class GithubGateway implements OnGatewayInit {
  private readonly logger = createLogger('GithubGateway');

  constructor(private readonly githubService: GithubService) {}

  afterInit(): void {
    this.logger.log('Initialized');
  }

  @SkipThrottle()
  @SubscribeMessage(GithubEvents.STATUS)
  async handleGithubStatus(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubStatusPayload
  ): Promise<GithubStatusResponse> {
    try {
      if (payload?.refresh) {
        this.githubService.clearCache();
      }

      const status = await this.githubService.getStatus();

      return {
        status,
      };
    } catch (error) {
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error('Error getting GitHub CLI status', error);

      return {
        status: {
          installed: false,
          platform: process.platform,
          arch: process.arch,
          auth: { authenticated: false },
        },
        error: message,
      };
    }
  }

  @SkipThrottle()
  @SubscribeMessage(GithubEvents.REPO_INFO)
  async handleGithubRepoInfo(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubProjectPayload
  ): Promise<GithubRepoInfoResponse> {
    try {
      const { projectPath } = payload;
      const pathError = validatePath(projectPath);

      if (pathError) {
        return {
          repo: null,
          error: pathError,
        };
      }

      const repo = await this.githubService.getRepoInfo(projectPath);

      return {
        repo,
      };
    } catch (error) {
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error('Error getting repo info', error);

      return {
        repo: null,
        error: message,
      };
    }
  }

  @SkipThrottle()
  @SubscribeMessage(GithubEvents.PRS)
  async handleGithubPRs(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubListPRsPayload
  ): Promise<GithubPRsResponse> {
    try {
      const { projectPath, state, limit } = payload;
      const pathError = validatePath(projectPath);

      if (pathError) {
        return {
          pullRequests: [],
          error: pathError,
        };
      }

      const pullRequests = await this.githubService.listPullRequests(projectPath, { state, limit });

      return {
        pullRequests,
      };
    } catch (error) {
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error('Error listing pull requests', error);

      return {
        pullRequests: [],
        error: message,
      };
    }
  }

  @SkipThrottle()
  @SubscribeMessage(GithubEvents.PR)
  async handleGithubPR(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubGetPRPayload
  ): Promise<GithubPRResponse> {
    try {
      const { projectPath, prNumber } = payload;
      const pathError = validatePath(projectPath);

      if (pathError) {
        return { pullRequest: null, error: pathError };
      }

      if (!prNumber) {
        return {
          pullRequest: null,
          error: 'PR number is required',
        };
      }

      const pullRequest = await this.githubService.getPullRequest(projectPath, prNumber);

      return {
        pullRequest,
      };
    } catch (error) {
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error('Error getting pull request', error);

      return {
        pullRequest: null,
        error: message,
      };
    }
  }

  @SubscribeMessage(GithubEvents.CREATE_PR)
  async handleGithubCreatePR(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubCreatePRPayload
  ): Promise<GithubCreatePRResponse> {
    try {
      const { projectPath, title, body, base, head, draft } = payload;
      const pathError = validatePath(projectPath);

      if (pathError) {
        return { success: false, error: pathError };
      }

      if (!title) {
        return {
          success: false,
          error: 'Title is required',
        };
      }

      const pullRequest = await this.githubService.createPullRequest(projectPath, {
        title,
        body,
        base,
        head,
        draft,
      });

      return {
        success: true,
        pullRequest,
      };
    } catch (error) {
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error('Error creating pull request', error);

      return {
        success: false,
        error: message,
      };
    }
  }

  @SkipThrottle()
  @SubscribeMessage(GithubEvents.ISSUES)
  async handleGithubIssues(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubListIssuesPayload
  ): Promise<GithubIssuesResponse> {
    try {
      const { projectPath, state, limit, labels } = payload;
      const pathError = validatePath(projectPath);

      if (pathError) {
        return {
          issues: [],
          error: pathError,
        };
      }

      const issues = await this.githubService.listIssues(projectPath, {
        state,
        limit,
        labels,
      });

      return {
        issues,
      };
    } catch (error) {
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error('Error listing issues', error);

      return {
        issues: [],
        error: message,
      };
    }
  }

  @SkipThrottle()
  @SubscribeMessage(GithubEvents.ISSUE)
  async handleGithubIssue(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubGetIssuePayload
  ): Promise<GithubIssueResponse> {
    try {
      const { projectPath, issueNumber } = payload;
      const pathError = validatePath(projectPath);

      if (pathError) {
        return { issue: null, error: pathError };
      }

      if (!issueNumber) {
        return {
          issue: null,
          error: 'Issue number is required',
        };
      }

      const issue = await this.githubService.getIssue(projectPath, issueNumber);

      return {
        issue,
      };
    } catch (error) {
      const message = extractErrorMessage(error, 'Unknown error');
      this.logger.error('Error getting issue', error);

      return {
        issue: null,
        error: message,
      };
    }
  }
}
