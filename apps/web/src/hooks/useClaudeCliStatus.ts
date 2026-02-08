import { useEffect, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { createLogger } from '@omniscribe/shared';
import type {
  ClaudeCliStatus,
  ClaudeVersionCheckResult,
  ClaudeInstallCommand,
} from '@omniscribe/shared';
import { useSettingsStore } from '@/stores';

const logger = createLogger('ClaudeCliStatus');

export interface UseClaudeCliStatusReturn {
  claudeCliStatus: ClaudeCliStatus | null;
  isLoading: boolean;
  claudeVersionCheck: ClaudeVersionCheckResult | null;
  isVersionCheckLoading: boolean;
  availableVersions: string[];
  isVersionsLoading: boolean;
  showVersionPicker: boolean;
  installCommand: ClaudeInstallCommand | null;
  copiedCommand: boolean;
  refreshStatus: () => Promise<void>;
  checkVersion: () => Promise<void>;
  handleVersionPickerOpen: () => void;
  handleVersionSelect: (version: string) => void;
  handleInstallClick: () => void;
  copyCommand: () => Promise<void>;
  runInTerminal: () => Promise<void>;
  getInstallCommand: (isUpdate: boolean, version?: string) => Promise<void>;
}

/**
 * Hook that manages Claude CLI status checking, version management, and install commands.
 * Extracts all state, callbacks, and effects from IntegrationsSection for reuse.
 */
export function useClaudeCliStatus(): UseClaudeCliStatusReturn {
  // Store selectors
  const claudeCliStatus = useSettingsStore(state => state.claudeCliStatus);
  const isLoading = useSettingsStore(state => state.isClaudeCliLoading);
  const setClaudeCliStatus = useSettingsStore(state => state.setClaudeCliStatus);
  const setClaudeCliLoading = useSettingsStore(state => state.setClaudeCliLoading);

  const claudeVersionCheck = useSettingsStore(state => state.claudeVersionCheck);
  const isVersionCheckLoading = useSettingsStore(state => state.isVersionCheckLoading);
  const setClaudeVersionCheck = useSettingsStore(state => state.setClaudeVersionCheck);
  const setVersionCheckLoading = useSettingsStore(state => state.setVersionCheckLoading);

  const availableVersions = useSettingsStore(state => state.availableVersions);
  const isVersionsLoading = useSettingsStore(state => state.isVersionsLoading);
  const setAvailableVersions = useSettingsStore(state => state.setAvailableVersions);
  const setVersionsLoading = useSettingsStore(state => state.setVersionsLoading);

  // Local state
  const [showVersionPicker, setShowVersionPicker] = useState(false);
  const [installCommand, setInstallCommand] = useState<ClaudeInstallCommand | null>(null);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [versionCheckAttempted, setVersionCheckAttempted] = useState(false);

  // Callbacks
  const refreshStatus = useCallback(async () => {
    logger.debug('Fetching Claude CLI status');
    setClaudeCliLoading(true);
    try {
      if (window.electronAPI?.claude?.getStatus) {
        const status = await window.electronAPI.claude.getStatus();
        setClaudeCliStatus(status);
      } else {
        setClaudeCliStatus({
          installed: false,
          platform: 'web',
          arch: 'unknown',
          auth: { authenticated: false },
        });
      }
    } catch (error) {
      logger.error('Failed to get Claude CLI status:', error);
      setClaudeCliStatus(null);
    }
  }, [setClaudeCliStatus, setClaudeCliLoading]);

  const checkVersion = useCallback(async () => {
    logger.debug('Checking Claude CLI version');
    setVersionCheckLoading(true);
    setVersionCheckAttempted(true);
    try {
      if (window.electronAPI?.claude?.checkVersion) {
        const result = await window.electronAPI.claude.checkVersion();
        setClaudeVersionCheck(result);
      }
    } catch (error) {
      logger.error('Failed to check Claude CLI version:', error);
      setClaudeVersionCheck(null);
    }
  }, [setClaudeVersionCheck, setVersionCheckLoading]);

  const fetchVersions = useCallback(async () => {
    logger.debug('Fetching available versions');
    setVersionsLoading(true);
    try {
      if (window.electronAPI?.claude?.getVersions) {
        const result = await window.electronAPI.claude.getVersions();
        setAvailableVersions(result.versions);
      }
    } catch (error) {
      logger.error('Failed to fetch available versions:', error);
      setAvailableVersions([]);
    }
  }, [setAvailableVersions, setVersionsLoading]);

  const getInstallCommand = useCallback(async (isUpdate: boolean, version?: string) => {
    try {
      if (window.electronAPI?.claude?.getInstallCommand) {
        const result = await window.electronAPI.claude.getInstallCommand({
          isUpdate,
          version,
        });
        setInstallCommand(result);
      }
    } catch (error) {
      logger.error('Failed to get install command:', error);
    }
  }, []);

  const copyCommand = useCallback(async () => {
    if (installCommand?.command) {
      try {
        if (window.electronAPI?.app?.clipboardWrite) {
          await window.electronAPI.app.clipboardWrite(installCommand.command);
        } else {
          await navigator.clipboard.writeText(installCommand.command);
        }
        setCopiedCommand(true);
        toast.success('Command copied to clipboard');
        setTimeout(() => setCopiedCommand(false), 2000);
      } catch (error) {
        logger.error('Failed to copy command to clipboard:', error);
        toast.error('Failed to copy command to clipboard');
      }
    }
  }, [installCommand]);

  const runInTerminal = useCallback(async () => {
    if (installCommand?.command && window.electronAPI?.claude?.runInstall) {
      try {
        await window.electronAPI.claude.runInstall(installCommand.command);
        toast.success('Terminal opened with install command');
      } catch (error) {
        logger.error('Failed to open terminal:', error);
        toast.error('Failed to open terminal');
      }
    }
  }, [installCommand]);

  // Fetch status on mount
  useEffect(() => {
    if (!claudeCliStatus && !isLoading) {
      refreshStatus();
    }
  }, [claudeCliStatus, isLoading, refreshStatus]);

  // Check version after status is loaded (only once)
  useEffect(() => {
    if (
      claudeCliStatus?.installed &&
      !claudeVersionCheck &&
      !isVersionCheckLoading &&
      !versionCheckAttempted
    ) {
      checkVersion();
    }
  }, [
    claudeCliStatus,
    claudeVersionCheck,
    isVersionCheckLoading,
    versionCheckAttempted,
    checkVersion,
  ]);

  // Handlers
  const handleVersionPickerOpen = useCallback(() => {
    if (availableVersions.length === 0 && !isVersionsLoading) {
      fetchVersions();
    }
    setShowVersionPicker(prev => !prev);
  }, [availableVersions.length, isVersionsLoading, fetchVersions]);

  const handleVersionSelect = useCallback(
    (version: string) => {
      getInstallCommand(claudeCliStatus?.installed ?? false, version);
      setShowVersionPicker(false);
    },
    [getInstallCommand, claudeCliStatus?.installed]
  );

  const handleInstallClick = useCallback(() => {
    const isUpdate = claudeCliStatus?.installed ?? false;
    const version = claudeVersionCheck?.latestVersion;
    getInstallCommand(isUpdate, isUpdate ? version : undefined);
  }, [claudeCliStatus?.installed, claudeVersionCheck?.latestVersion, getInstallCommand]);

  return {
    claudeCliStatus,
    isLoading,
    claudeVersionCheck,
    isVersionCheckLoading,
    availableVersions,
    isVersionsLoading,
    showVersionPicker,
    installCommand,
    copiedCommand,
    refreshStatus,
    checkVersion,
    handleVersionPickerOpen,
    handleVersionSelect,
    handleInstallClick,
    copyCommand,
    runInTerminal,
    getInstallCommand,
  };
}
