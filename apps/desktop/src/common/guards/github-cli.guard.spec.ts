import { ExecutionContext, NotImplementedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GitHubCliGuard, REQUIRES_GH_CLI, SKIP_GH_CLI_CHECK } from './github-cli.guard';
import { GithubService } from '../../modules/git/github.service';

function createMockExecutionContext(): ExecutionContext {
  return {
    getHandler: jest.fn().mockReturnValue(jest.fn()),
    getClass: jest.fn().mockReturnValue(class {}),
  } as unknown as ExecutionContext;
}

describe('GitHubCliGuard', () => {
  let guard: GitHubCliGuard;
  let reflector: jest.Mocked<Reflector>;
  let githubService: jest.Mocked<Pick<GithubService, 'getStatus'>>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    githubService = {
      getStatus: jest.fn(),
    };

    guard = new GitHubCliGuard(reflector, githubService as unknown as GithubService);
  });

  it('should allow access when SKIP_GH_CLI_CHECK metadata is true', async () => {
    reflector.getAllAndOverride.mockImplementation((key: unknown) => {
      if (key === SKIP_GH_CLI_CHECK) return true;
      return false;
    });

    const context = createMockExecutionContext();
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(githubService.getStatus).not.toHaveBeenCalled();
  });

  it('should allow access when REQUIRES_GH_CLI metadata is absent', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);

    const context = createMockExecutionContext();
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(githubService.getStatus).not.toHaveBeenCalled();
  });

  it('should allow access when CLI is installed and authenticated', async () => {
    reflector.getAllAndOverride.mockImplementation((key: unknown) => {
      if (key === SKIP_GH_CLI_CHECK) return false;
      if (key === REQUIRES_GH_CLI) return true;
      return false;
    });

    githubService.getStatus.mockResolvedValue({
      installed: true,
      platform: 'win32',
      arch: 'x64',
      auth: { authenticated: true },
    });

    const context = createMockExecutionContext();
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(githubService.getStatus).toHaveBeenCalledTimes(1);
  });

  it('should throw NotImplementedException with GH_CLI_NOT_INSTALLED when CLI is not installed', async () => {
    reflector.getAllAndOverride.mockImplementation((key: unknown) => {
      if (key === SKIP_GH_CLI_CHECK) return false;
      if (key === REQUIRES_GH_CLI) return true;
      return false;
    });

    githubService.getStatus.mockResolvedValue({
      installed: false,
      platform: 'win32',
      arch: 'x64',
      auth: { authenticated: false },
    });

    const context = createMockExecutionContext();

    await expect(guard.canActivate(context)).rejects.toThrow(NotImplementedException);

    try {
      await guard.canActivate(context);
    } catch (error) {
      expect(error).toBeInstanceOf(NotImplementedException);
      const response = (error as NotImplementedException).getResponse();
      expect(response).toEqual(
        expect.objectContaining({
          error: 'GH_CLI_NOT_INSTALLED',
          statusCode: 501,
        })
      );
    }
  });

  it('should throw NotImplementedException with GH_CLI_NOT_AUTHENTICATED when CLI is not authenticated', async () => {
    reflector.getAllAndOverride.mockImplementation((key: unknown) => {
      if (key === SKIP_GH_CLI_CHECK) return false;
      if (key === REQUIRES_GH_CLI) return true;
      return false;
    });

    githubService.getStatus.mockResolvedValue({
      installed: true,
      platform: 'win32',
      arch: 'x64',
      auth: { authenticated: false },
    });

    const context = createMockExecutionContext();

    await expect(guard.canActivate(context)).rejects.toThrow(NotImplementedException);

    try {
      await guard.canActivate(context);
    } catch (error) {
      expect(error).toBeInstanceOf(NotImplementedException);
      const response = (error as NotImplementedException).getResponse();
      expect(response).toEqual(
        expect.objectContaining({
          error: 'GH_CLI_NOT_AUTHENTICATED',
          statusCode: 501,
        })
      );
    }
  });

  it('should pass handler and class to reflector.getAllAndOverride', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockExecutionContext();
    const handler = context.getHandler();
    const cls = context.getClass();

    await guard.canActivate(context);

    // First call checks SKIP_GH_CLI_CHECK
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(SKIP_GH_CLI_CHECK, [handler, cls]);

    // Second call checks REQUIRES_GH_CLI
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(REQUIRES_GH_CLI, [handler, cls]);
  });
});
