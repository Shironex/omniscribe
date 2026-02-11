import { useState, useEffect, useRef } from 'react';
import { emitAsync } from '@/lib/socketHelpers';
import {
  GithubEvents,
  createLogger,
  type RepoInfo,
  type GithubProjectPayload,
  type GithubRepoInfoResponse,
} from '@omniscribe/shared';

const logger = createLogger('useGithubRepoInfo');

export function useGithubRepoInfo(projectPath: string | null, ghCliAvailable: boolean) {
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const fetchedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ghCliAvailable || !projectPath) {
      setRepoInfo(null);
      fetchedPathRef.current = null;
      return;
    }

    if (fetchedPathRef.current === projectPath) return;

    let cancelled = false;

    const fetchRepoInfo = async () => {
      let info: RepoInfo | null = null;
      try {
        const response = await emitAsync<GithubProjectPayload, GithubRepoInfoResponse>(
          GithubEvents.REPO_INFO,
          { projectPath }
        );
        if (response.repo && !response.error) {
          info = response.repo;
        }
      } catch (err) {
        if (!cancelled) {
          logger.warn('Failed to fetch repo info:', err);
        }
      }

      if (!cancelled) {
        setRepoInfo(info);
        fetchedPathRef.current = projectPath;
      }
    };

    fetchRepoInfo();

    return () => {
      cancelled = true;
    };
  }, [projectPath, ghCliAvailable]);

  return { repoInfo };
}
