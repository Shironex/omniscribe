import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  Theme,
  SettingsSectionId,
  ClaudeCliStatus,
  GhCliStatus,
  ClaudeVersionCheckResult,
} from '@omniscribe/shared';

vi.mock('@/lib/theme', () => ({
  themeOptions: [
    { value: 'forge', label: 'Forge', isDark: true },
    { value: 'paper', label: 'Paper', isDark: false },
    { value: 'dracula', label: 'Dracula', isDark: true },
  ],
}));

vi.mock('@/lib/theme-persistence', () => ({
  persistTheme: vi.fn(),
  getPersistedTheme: vi.fn(() => 'forge'),
}));

import {
  useSettingsStore,
  selectIsSettingsOpen,
  selectActiveSection,
  selectTheme,
  selectPreviewTheme,
  selectEffectiveTheme,
  selectClaudeCliStatus,
  selectClaudeCliLoading,
  selectClaudeVersionCheck,
  selectVersionCheckLoading,
  selectAvailableVersions,
  selectVersionsLoading,
  selectGithubCliStatus,
  selectGithubCliLoading,
} from '../useSettingsStore';
import { persistTheme } from '@/lib/theme-persistence';

const initialState = {
  isOpen: false,
  activeSection: 'appearance' as const,
  theme: 'forge' as const,
  claudeCliStatus: null,
  isClaudeCliLoading: false,
  claudeVersionCheck: null,
  isVersionCheckLoading: false,
  availableVersions: [],
  isVersionsLoading: false,
  githubCliStatus: null,
  isGithubCliLoading: false,
  previewTheme: null,
  chrome: {
    showStatusBar: true,
  },
  lastSavedAt: null,
};

describe('useSettingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState(initialState);
    vi.mocked(persistTheme).mockClear();
    // Reset DOM classes
    document.documentElement.className = '';
  });

  describe('initial state', () => {
    it('has isOpen set to false', () => {
      expect(useSettingsStore.getState().isOpen).toBe(false);
    });

    it('has activeSection set to appearance', () => {
      expect(useSettingsStore.getState().activeSection).toBe('appearance');
    });

    it('has theme from getPersistedTheme', () => {
      expect(useSettingsStore.getState().theme).toBe('forge');
    });

    it('has null claudeCliStatus', () => {
      expect(useSettingsStore.getState().claudeCliStatus).toBeNull();
    });

    it('has isClaudeCliLoading set to false', () => {
      expect(useSettingsStore.getState().isClaudeCliLoading).toBe(false);
    });

    it('has null claudeVersionCheck', () => {
      expect(useSettingsStore.getState().claudeVersionCheck).toBeNull();
    });

    it('has isVersionCheckLoading set to false', () => {
      expect(useSettingsStore.getState().isVersionCheckLoading).toBe(false);
    });

    it('has empty availableVersions', () => {
      expect(useSettingsStore.getState().availableVersions).toEqual([]);
    });

    it('has isVersionsLoading set to false', () => {
      expect(useSettingsStore.getState().isVersionsLoading).toBe(false);
    });

    it('has null githubCliStatus', () => {
      expect(useSettingsStore.getState().githubCliStatus).toBeNull();
    });

    it('has isGithubCliLoading set to false', () => {
      expect(useSettingsStore.getState().isGithubCliLoading).toBe(false);
    });

    it('has null previewTheme', () => {
      expect(useSettingsStore.getState().previewTheme).toBeNull();
    });
  });

  describe('openSettings', () => {
    it('opens with the current activeSection when no section specified', () => {
      useSettingsStore.getState().openSettings();

      const state = useSettingsStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.activeSection).toBe('appearance');
    });

    it('opens with a specific section', () => {
      useSettingsStore.getState().openSettings('integrations');

      const state = useSettingsStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.activeSection).toBe('integrations');
    });

    it('preserves previously navigated section when no section specified', () => {
      useSettingsStore.getState().navigateToSection('github');
      useSettingsStore.getState().openSettings();

      expect(useSettingsStore.getState().activeSection).toBe('github');
    });

    it('overrides previously navigated section when section specified', () => {
      useSettingsStore.getState().navigateToSection('github');
      useSettingsStore.getState().openSettings('terminal');

      expect(useSettingsStore.getState().activeSection).toBe('terminal');
    });
  });

  describe('closeSettings', () => {
    it('sets isOpen to false', () => {
      useSettingsStore.setState({ isOpen: true });
      useSettingsStore.getState().closeSettings();

      expect(useSettingsStore.getState().isOpen).toBe(false);
    });

    it('clears previewTheme', () => {
      useSettingsStore.setState({ isOpen: true, previewTheme: 'dracula' as Theme });
      useSettingsStore.getState().closeSettings();

      expect(useSettingsStore.getState().previewTheme).toBeNull();
    });

    it('restores actual theme to DOM when a preview was active', () => {
      useSettingsStore.setState({
        isOpen: true,
        theme: 'forge' as Theme,
        previewTheme: 'dracula' as Theme,
      });
      // Simulate that the DOM has the preview theme
      document.documentElement.classList.add('dracula');

      useSettingsStore.getState().closeSettings();

      expect(document.documentElement.classList.contains('forge')).toBe(true);
      expect(document.documentElement.classList.contains('dracula')).toBe(false);
    });

    it('does not re-apply theme to DOM when no preview was active', () => {
      useSettingsStore.setState({
        isOpen: true,
        theme: 'forge' as Theme,
        previewTheme: null,
      });
      // DOM already has the correct theme
      document.documentElement.classList.add('forge');

      useSettingsStore.getState().closeSettings();

      // Theme should still be dark, no unnecessary DOM manipulation issues
      expect(document.documentElement.classList.contains('forge')).toBe(true);
    });
  });

  describe('navigateToSection', () => {
    it('changes activeSection', () => {
      useSettingsStore.getState().navigateToSection('mcp');

      expect(useSettingsStore.getState().activeSection).toBe('mcp');
    });

    it('changes to each valid section', () => {
      const sections: SettingsSectionId[] = [
        'appearance',
        'integrations',
        'github',
        'mcp',
        'general',
        'worktrees',
        'sessions',
        'terminal',
        'quickActions',
      ];

      for (const section of sections) {
        useSettingsStore.getState().navigateToSection(section);
        expect(useSettingsStore.getState().activeSection).toBe(section);
      }
    });
  });

  describe('setTheme', () => {
    it('sets the theme in state', () => {
      useSettingsStore.getState().setTheme('dracula');

      expect(useSettingsStore.getState().theme).toBe('dracula');
    });

    it('applies the theme to the DOM', () => {
      useSettingsStore.getState().setTheme('dracula');

      expect(document.documentElement.classList.contains('dracula')).toBe(true);
    });

    it('removes previous theme classes from the DOM', () => {
      document.documentElement.classList.add('forge');

      useSettingsStore.getState().setTheme('dracula');

      expect(document.documentElement.classList.contains('forge')).toBe(false);
      expect(document.documentElement.classList.contains('dracula')).toBe(true);
    });

    it('calls persistTheme', () => {
      useSettingsStore.getState().setTheme('dracula');

      expect(persistTheme).toHaveBeenCalledWith('dracula');
    });

    it('clears previewTheme', () => {
      useSettingsStore.setState({ previewTheme: 'paper' as Theme });

      useSettingsStore.getState().setTheme('dracula');

      expect(useSettingsStore.getState().previewTheme).toBeNull();
    });

    it('persists and applies when switching between themes', () => {
      useSettingsStore.getState().setTheme('paper');
      expect(document.documentElement.classList.contains('paper')).toBe(true);
      expect(persistTheme).toHaveBeenCalledWith('paper');

      useSettingsStore.getState().setTheme('dracula');
      expect(document.documentElement.classList.contains('paper')).toBe(false);
      expect(document.documentElement.classList.contains('dracula')).toBe(true);
      expect(persistTheme).toHaveBeenCalledWith('dracula');
    });
  });

  describe('setPreviewTheme', () => {
    it('sets the preview theme in state', () => {
      useSettingsStore.getState().setPreviewTheme('dracula');

      expect(useSettingsStore.getState().previewTheme).toBe('dracula');
    });

    it('applies the preview theme to the DOM', () => {
      useSettingsStore.getState().setPreviewTheme('dracula');

      expect(document.documentElement.classList.contains('dracula')).toBe(true);
    });

    it('does not call persistTheme', () => {
      useSettingsStore.getState().setPreviewTheme('dracula');

      expect(persistTheme).not.toHaveBeenCalled();
    });

    it('does not change the actual theme', () => {
      useSettingsStore.getState().setPreviewTheme('dracula');

      expect(useSettingsStore.getState().theme).toBe('forge');
    });

    it('restores actual theme to DOM when set to null', () => {
      useSettingsStore.setState({ theme: 'forge' as Theme });
      document.documentElement.classList.add('forge');

      // Apply preview
      useSettingsStore.getState().setPreviewTheme('dracula');
      expect(document.documentElement.classList.contains('dracula')).toBe(true);
      expect(document.documentElement.classList.contains('forge')).toBe(false);

      // Clear preview
      useSettingsStore.getState().setPreviewTheme(null);
      expect(document.documentElement.classList.contains('forge')).toBe(true);
      expect(document.documentElement.classList.contains('dracula')).toBe(false);
    });

    it('sets previewTheme to null in state when cleared', () => {
      useSettingsStore.getState().setPreviewTheme('dracula');
      useSettingsStore.getState().setPreviewTheme(null);

      expect(useSettingsStore.getState().previewTheme).toBeNull();
    });
  });

  describe('applyTheme', () => {
    it('applies the given theme to the DOM', () => {
      useSettingsStore.getState().applyTheme('paper');

      expect(document.documentElement.classList.contains('paper')).toBe(true);
    });

    it('removes other theme classes from the DOM', () => {
      document.documentElement.classList.add('forge');

      useSettingsStore.getState().applyTheme('paper');

      expect(document.documentElement.classList.contains('forge')).toBe(false);
      expect(document.documentElement.classList.contains('paper')).toBe(true);
    });

    it('does not change store state', () => {
      const stateBefore = useSettingsStore.getState().theme;

      useSettingsStore.getState().applyTheme('dracula');

      expect(useSettingsStore.getState().theme).toBe(stateBefore);
    });
  });

  describe('CLI status setters', () => {
    describe('setClaudeCliStatus', () => {
      it('sets claudeCliStatus', () => {
        const status: ClaudeCliStatus = {
          installed: true,
          version: '1.0.0',
          path: '/usr/bin/claude',
          platform: 'darwin',
          arch: 'arm64',
          auth: { authenticated: true },
        };

        useSettingsStore.getState().setClaudeCliStatus(status);

        expect(useSettingsStore.getState().claudeCliStatus).toEqual(status);
      });

      it('sets isClaudeCliLoading to false', () => {
        useSettingsStore.setState({ isClaudeCliLoading: true });

        useSettingsStore.getState().setClaudeCliStatus(null);

        expect(useSettingsStore.getState().isClaudeCliLoading).toBe(false);
      });

      it('can set status to null', () => {
        useSettingsStore.setState({
          claudeCliStatus: {
            installed: true,
            platform: 'darwin',
            arch: 'arm64',
            auth: { authenticated: false },
          },
        });

        useSettingsStore.getState().setClaudeCliStatus(null);

        expect(useSettingsStore.getState().claudeCliStatus).toBeNull();
      });
    });

    describe('setClaudeCliLoading', () => {
      it('sets isClaudeCliLoading to true', () => {
        useSettingsStore.getState().setClaudeCliLoading(true);

        expect(useSettingsStore.getState().isClaudeCliLoading).toBe(true);
      });

      it('sets isClaudeCliLoading to false', () => {
        useSettingsStore.setState({ isClaudeCliLoading: true });

        useSettingsStore.getState().setClaudeCliLoading(false);

        expect(useSettingsStore.getState().isClaudeCliLoading).toBe(false);
      });
    });

    describe('setClaudeVersionCheck', () => {
      it('sets claudeVersionCheck', () => {
        const result: ClaudeVersionCheckResult = {
          installedVersion: '1.0.0',
          latestVersion: '1.1.0',
          isOutdated: true,
          lastChecked: '2026-01-01T00:00:00Z',
        };

        useSettingsStore.getState().setClaudeVersionCheck(result);

        expect(useSettingsStore.getState().claudeVersionCheck).toEqual(result);
      });

      it('sets isVersionCheckLoading to false', () => {
        useSettingsStore.setState({ isVersionCheckLoading: true });

        useSettingsStore.getState().setClaudeVersionCheck(null);

        expect(useSettingsStore.getState().isVersionCheckLoading).toBe(false);
      });

      it('can set result to null', () => {
        useSettingsStore.setState({
          claudeVersionCheck: {
            latestVersion: '1.0.0',
            isOutdated: false,
            lastChecked: '2026-01-01T00:00:00Z',
          },
        });

        useSettingsStore.getState().setClaudeVersionCheck(null);

        expect(useSettingsStore.getState().claudeVersionCheck).toBeNull();
      });
    });

    describe('setVersionCheckLoading', () => {
      it('sets isVersionCheckLoading to true', () => {
        useSettingsStore.getState().setVersionCheckLoading(true);

        expect(useSettingsStore.getState().isVersionCheckLoading).toBe(true);
      });

      it('sets isVersionCheckLoading to false', () => {
        useSettingsStore.setState({ isVersionCheckLoading: true });

        useSettingsStore.getState().setVersionCheckLoading(false);

        expect(useSettingsStore.getState().isVersionCheckLoading).toBe(false);
      });
    });

    describe('setAvailableVersions', () => {
      it('sets availableVersions', () => {
        const versions = ['1.0.0', '1.1.0', '1.2.0'];

        useSettingsStore.getState().setAvailableVersions(versions);

        expect(useSettingsStore.getState().availableVersions).toEqual(versions);
      });

      it('sets isVersionsLoading to false', () => {
        useSettingsStore.setState({ isVersionsLoading: true });

        useSettingsStore.getState().setAvailableVersions([]);

        expect(useSettingsStore.getState().isVersionsLoading).toBe(false);
      });

      it('can set to empty array', () => {
        useSettingsStore.setState({ availableVersions: ['1.0.0'] });

        useSettingsStore.getState().setAvailableVersions([]);

        expect(useSettingsStore.getState().availableVersions).toEqual([]);
      });
    });

    describe('setVersionsLoading', () => {
      it('sets isVersionsLoading to true', () => {
        useSettingsStore.getState().setVersionsLoading(true);

        expect(useSettingsStore.getState().isVersionsLoading).toBe(true);
      });

      it('sets isVersionsLoading to false', () => {
        useSettingsStore.setState({ isVersionsLoading: true });

        useSettingsStore.getState().setVersionsLoading(false);

        expect(useSettingsStore.getState().isVersionsLoading).toBe(false);
      });
    });

    describe('setGithubCliStatus', () => {
      it('sets githubCliStatus', () => {
        const status: GhCliStatus = {
          installed: true,
          version: '2.40.0',
          path: '/usr/bin/gh',
          platform: 'darwin',
          arch: 'arm64',
          auth: { authenticated: true, username: 'testuser' },
        };

        useSettingsStore.getState().setGithubCliStatus(status);

        expect(useSettingsStore.getState().githubCliStatus).toEqual(status);
      });

      it('sets isGithubCliLoading to false', () => {
        useSettingsStore.setState({ isGithubCliLoading: true });

        useSettingsStore.getState().setGithubCliStatus(null);

        expect(useSettingsStore.getState().isGithubCliLoading).toBe(false);
      });

      it('can set status to null', () => {
        useSettingsStore.setState({
          githubCliStatus: {
            installed: false,
            platform: 'darwin',
            arch: 'arm64',
            auth: { authenticated: false },
          },
        });

        useSettingsStore.getState().setGithubCliStatus(null);

        expect(useSettingsStore.getState().githubCliStatus).toBeNull();
      });
    });

    describe('setGithubCliLoading', () => {
      it('sets isGithubCliLoading to true', () => {
        useSettingsStore.getState().setGithubCliLoading(true);

        expect(useSettingsStore.getState().isGithubCliLoading).toBe(true);
      });

      it('sets isGithubCliLoading to false', () => {
        useSettingsStore.setState({ isGithubCliLoading: true });

        useSettingsStore.getState().setGithubCliLoading(false);

        expect(useSettingsStore.getState().isGithubCliLoading).toBe(false);
      });
    });
  });

  describe('selectors', () => {
    it('selectIsSettingsOpen returns isOpen', () => {
      useSettingsStore.setState({ isOpen: true });

      expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(true);
    });

    it('selectActiveSection returns activeSection', () => {
      useSettingsStore.setState({ activeSection: 'mcp' });

      expect(selectActiveSection(useSettingsStore.getState())).toBe('mcp');
    });

    it('selectTheme returns theme', () => {
      useSettingsStore.setState({ theme: 'dracula' as Theme });

      expect(selectTheme(useSettingsStore.getState())).toBe('dracula');
    });

    it('selectPreviewTheme returns previewTheme', () => {
      useSettingsStore.setState({ previewTheme: 'paper' as Theme });

      expect(selectPreviewTheme(useSettingsStore.getState())).toBe('paper');
    });

    it('selectPreviewTheme returns null when no preview is set', () => {
      expect(selectPreviewTheme(useSettingsStore.getState())).toBeNull();
    });

    it('selectEffectiveTheme returns previewTheme when set', () => {
      useSettingsStore.setState({
        theme: 'forge' as Theme,
        previewTheme: 'dracula' as Theme,
      });

      expect(selectEffectiveTheme(useSettingsStore.getState())).toBe('dracula');
    });

    it('selectEffectiveTheme returns actual theme when no preview is set', () => {
      useSettingsStore.setState({
        theme: 'forge' as Theme,
        previewTheme: null,
      });

      expect(selectEffectiveTheme(useSettingsStore.getState())).toBe('forge');
    });

    it('selectClaudeCliStatus returns claudeCliStatus', () => {
      const status: ClaudeCliStatus = {
        installed: true,
        platform: 'darwin',
        arch: 'arm64',
        auth: { authenticated: true },
      };
      useSettingsStore.setState({ claudeCliStatus: status });

      expect(selectClaudeCliStatus(useSettingsStore.getState())).toEqual(status);
    });

    it('selectClaudeCliLoading returns isClaudeCliLoading', () => {
      useSettingsStore.setState({ isClaudeCliLoading: true });

      expect(selectClaudeCliLoading(useSettingsStore.getState())).toBe(true);
    });

    it('selectClaudeVersionCheck returns claudeVersionCheck', () => {
      const result: ClaudeVersionCheckResult = {
        latestVersion: '1.1.0',
        isOutdated: true,
        lastChecked: '2026-01-01T00:00:00Z',
      };
      useSettingsStore.setState({ claudeVersionCheck: result });

      expect(selectClaudeVersionCheck(useSettingsStore.getState())).toEqual(result);
    });

    it('selectVersionCheckLoading returns isVersionCheckLoading', () => {
      useSettingsStore.setState({ isVersionCheckLoading: true });

      expect(selectVersionCheckLoading(useSettingsStore.getState())).toBe(true);
    });

    it('selectAvailableVersions returns availableVersions', () => {
      const versions = ['1.0.0', '1.1.0'];
      useSettingsStore.setState({ availableVersions: versions });

      expect(selectAvailableVersions(useSettingsStore.getState())).toEqual(versions);
    });

    it('selectVersionsLoading returns isVersionsLoading', () => {
      useSettingsStore.setState({ isVersionsLoading: true });

      expect(selectVersionsLoading(useSettingsStore.getState())).toBe(true);
    });

    it('selectGithubCliStatus returns githubCliStatus', () => {
      const status: GhCliStatus = {
        installed: true,
        platform: 'linux',
        arch: 'x64',
        auth: { authenticated: false },
      };
      useSettingsStore.setState({ githubCliStatus: status });

      expect(selectGithubCliStatus(useSettingsStore.getState())).toEqual(status);
    });

    it('selectGithubCliLoading returns isGithubCliLoading', () => {
      useSettingsStore.setState({ isGithubCliLoading: true });

      expect(selectGithubCliLoading(useSettingsStore.getState())).toBe(true);
    });
  });
});
