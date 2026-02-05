import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotImplementedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GithubService } from '../../modules/git/github.service';

export const REQUIRES_GH_CLI = 'requiresGhCli';
export const SKIP_GH_CLI_CHECK = 'skipGhCliCheck';

/**
 * Decorator to mark a controller or endpoint as requiring GitHub CLI
 */
export const RequiresGhCli = () => SetMetadata(REQUIRES_GH_CLI, true);

/**
 * Decorator to skip GitHub CLI check for specific endpoints
 */
export const SkipGhCliCheck = () => SetMetadata(SKIP_GH_CLI_CHECK, true);

@Injectable()
export class GitHubCliGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private githubService: GithubService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if this endpoint should skip the check
    const skipCheck = this.reflector.getAllAndOverride<boolean>(SKIP_GH_CLI_CHECK, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipCheck) {
      return true;
    }

    // Check if GitHub CLI is required
    const requiresGh = this.reflector.getAllAndOverride<boolean>(REQUIRES_GH_CLI, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiresGh) {
      return true;
    }

    const status = await this.githubService.getStatus();

    if (!status.installed) {
      throw new NotImplementedException({
        statusCode: 501,
        message: 'GitHub CLI not installed',
        error: 'GH_CLI_NOT_INSTALLED',
        details: 'GitHub CLI (gh) is not installed. Please install it from https://cli.github.com',
      });
    }

    if (!status.auth.authenticated) {
      throw new NotImplementedException({
        statusCode: 501,
        message: 'GitHub CLI not authenticated',
        error: 'GH_CLI_NOT_AUTHENTICATED',
        details:
          'GitHub CLI is installed but not authenticated. Please run `gh auth login` in your terminal.',
      });
    }

    return true;
  }
}
