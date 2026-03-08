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
import { handleGatewayRequest } from '../shared/gateway-handler';
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
    // This handler doesn't follow the standard projectPath pattern
    this.logger.debug(`[github:status] refresh=${payload?.refresh ?? false}`);
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
    return handleGatewayRequest({
      logger: this.logger,
      action: '[github:repo-info]',
      payload,
      defaultResult: { repo: null },
      handler: async projectPath => {
        const repo = await this.githubService.getRepoInfo(projectPath);
        return { repo };
      },
    });
  }

  @SkipThrottle()
  @SubscribeMessage(GithubEvents.PRS)
  async handleGithubPRs(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubListPRsPayload
  ): Promise<GithubPRsResponse> {
    return handleGatewayRequest({
      logger: this.logger,
      action: '[github:prs]',
      payload,
      defaultResult: { pullRequests: [] },
      handler: async projectPath => {
        const { state, limit } = payload;
        const pullRequests = await this.githubService.listPullRequests(projectPath, {
          state,
          limit,
        });
        return { pullRequests };
      },
    });
  }

  @SkipThrottle()
  @SubscribeMessage(GithubEvents.PR)
  async handleGithubPR(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubGetPRPayload
  ): Promise<GithubPRResponse> {
    return handleGatewayRequest({
      logger: this.logger,
      action: '[github:pr]',
      payload,
      defaultResult: { pullRequest: null },
      handler: async projectPath => {
        const { prNumber } = payload;

        if (!prNumber || prNumber < 0) {
          return { pullRequest: null, error: 'PR number is required' };
        }

        const pullRequest = await this.githubService.getPullRequest(projectPath, prNumber);
        return { pullRequest };
      },
    });
  }

  @SubscribeMessage(GithubEvents.CREATE_PR)
  async handleGithubCreatePR(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubCreatePRPayload
  ): Promise<GithubCreatePRResponse> {
    return handleGatewayRequest({
      logger: this.logger,
      action: '[github:create-pr]',
      payload,
      defaultResult: { success: false },
      handler: async projectPath => {
        const { title, body, base, head, draft } = payload;

        if (!title) {
          return { success: false, error: 'Title is required' };
        }

        const pullRequest = await this.githubService.createPullRequest(projectPath, {
          title,
          body,
          base,
          head,
          draft,
        });

        return { success: true, pullRequest };
      },
    });
  }

  @SkipThrottle()
  @SubscribeMessage(GithubEvents.ISSUES)
  async handleGithubIssues(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubListIssuesPayload
  ): Promise<GithubIssuesResponse> {
    return handleGatewayRequest({
      logger: this.logger,
      action: '[github:issues]',
      payload,
      defaultResult: { issues: [] },
      handler: async projectPath => {
        const { state, limit, labels } = payload;
        const issues = await this.githubService.listIssues(projectPath, {
          state,
          limit,
          labels,
        });
        return { issues };
      },
    });
  }

  @SkipThrottle()
  @SubscribeMessage(GithubEvents.ISSUE)
  async handleGithubIssue(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: GithubGetIssuePayload
  ): Promise<GithubIssueResponse> {
    return handleGatewayRequest({
      logger: this.logger,
      action: '[github:issue]',
      payload,
      defaultResult: { issue: null },
      handler: async projectPath => {
        const { issueNumber } = payload;

        if (!issueNumber || issueNumber < 0) {
          return { issue: null, error: 'Issue number is required' };
        }

        const issue = await this.githubService.getIssue(projectPath, issueNumber);
        return { issue };
      },
    });
  }
}
