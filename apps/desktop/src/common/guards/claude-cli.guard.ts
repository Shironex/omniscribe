import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotImplementedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UsageService } from '../../modules/usage/usage.service';

export const REQUIRES_CLAUDE_CLI = 'requiresClaudeCli';
export const SKIP_CLAUDE_CLI_CHECK = 'skipClaudeCliCheck';

/**
 * Decorator to mark a controller or endpoint as requiring Claude CLI
 */
export const RequiresClaudeCli = () => SetMetadata(REQUIRES_CLAUDE_CLI, true);

/**
 * Decorator to skip Claude CLI check for specific endpoints
 */
export const SkipClaudeCliCheck = () => SetMetadata(SKIP_CLAUDE_CLI_CHECK, true);

@Injectable()
export class ClaudeCliGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private usageService: UsageService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if this endpoint should skip the check
    const skipCheck = this.reflector.getAllAndOverride<boolean>(SKIP_CLAUDE_CLI_CHECK, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipCheck) {
      return true;
    }

    // Check if Claude CLI is required
    const requiresClaude = this.reflector.getAllAndOverride<boolean>(REQUIRES_CLAUDE_CLI, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiresClaude) {
      return true;
    }

    const status = await this.usageService.getStatus();

    if (!status.installed) {
      throw new NotImplementedException({
        statusCode: 501,
        message: 'Claude CLI not installed',
        error: 'CLAUDE_CLI_NOT_INSTALLED',
        details: 'Claude Code CLI is not installed. Please install it from https://claude.ai/code',
      });
    }

    if (!status.auth.authenticated) {
      throw new NotImplementedException({
        statusCode: 501,
        message: 'Claude CLI not authenticated',
        error: 'CLAUDE_CLI_NOT_AUTHENTICATED',
        details:
          'Claude CLI is installed but not authenticated. Please run `claude login` in your terminal.',
      });
    }

    return true;
  }
}
