import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockWriteToTerminal = vi.fn();
vi.mock('@/lib/terminal', () => ({
  writeToTerminal: (...args: unknown[]) => mockWriteToTerminal(...args),
}));

// Mock TerminalSession type re-export so the hook's import resolves
vi.mock('@/components/terminal/TerminalGrid', () => ({}));

// Store mock data — declared with `let` so individual tests can mutate them
let mockActions = [
  {
    id: 'git-commit',
    title: 'Git Commit',
    handler: 'terminal:execute',
    params: { command: '/commit' },
    enabled: true,
    category: 'git',
    icon: 'GitCommit',
    description: 'Commit changes',
  },
  {
    id: 'disabled-action',
    title: 'Disabled Action',
    handler: 'terminal:execute',
    params: { command: 'test' },
    enabled: false,
    category: 'ai',
    icon: 'X',
    description: 'A disabled action',
  },
  {
    id: 'script-action',
    title: 'Run Script',
    handler: 'script',
    params: { path: '/run.sh' },
    enabled: true,
    category: 'ai',
    icon: 'Play',
    description: 'Run a script',
  },
  {
    id: 'shell-action',
    title: 'Shell Command',
    handler: 'shell',
    params: { command: 'echo hello' },
    enabled: true,
    category: 'ai',
    icon: 'Terminal',
    description: 'A shell command',
  },
  {
    id: 'unknown-handler',
    title: 'Unknown Handler',
    handler: 'custom-handler',
    params: { command: 'custom-cmd' },
    enabled: true,
    category: 'ai',
    icon: 'HelpCircle',
    description: 'An unknown handler type',
  },
  {
    id: 'fallback-action',
    title: 'Fallback Action',
    handler: 'other',
    params: {},
    enabled: true,
    category: 'ai',
    icon: 'Zap',
    description: 'Falls back to action.id as command',
  },
  {
    id: 'script-alt',
    title: 'Script Alt',
    handler: 'script',
    params: { script: '/alt-script.sh' },
    enabled: true,
    category: 'ai',
    icon: 'FileCode',
    description: 'Script with params.script instead of params.path',
  },
  {
    id: 'shell-cmd-alt',
    title: 'Shell Cmd Alt',
    handler: 'terminal:execute',
    params: { cmd: 'ls -la' },
    enabled: true,
    category: 'git',
    icon: 'List',
    description: 'Uses params.cmd instead of params.command',
  },
  {
    id: 'empty-command',
    title: 'Empty Command',
    handler: 'terminal:execute',
    params: {},
    enabled: true,
    category: 'ai',
    icon: 'Circle',
    description: 'Action with no command in params',
  },
];

let mockPreferences: { session?: { quickActionMode?: 'paste-only' | 'execute' } } = {
  session: { quickActionMode: 'paste-only' },
};

vi.mock('@/stores', () => ({
  useQuickActionStore: (selector: (state: { actions: typeof mockActions }) => unknown) =>
    selector({ actions: mockActions }),
  useWorkspaceStore: (selector: (state: { preferences: typeof mockPreferences }) => unknown) =>
    selector({ preferences: mockPreferences }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { useQuickActionExecution } from '../useQuickActionExecution';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockTerminalSession {
  id: string;
  sessionNumber: number;
  aiMode: string;
  status: string;
  terminalSessionId?: number;
}

function createTerminalSession(overrides: Partial<MockTerminalSession> = {}): MockTerminalSession {
  return {
    id: 'session-1',
    sessionNumber: 1,
    aiMode: 'claude',
    status: 'idle',
    terminalSessionId: 42,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useQuickActionExecution', () => {
  beforeEach(() => {
    mockWriteToTerminal.mockClear();

    // Reset to default mock data
    mockActions = [
      {
        id: 'git-commit',
        title: 'Git Commit',
        handler: 'terminal:execute',
        params: { command: '/commit' },
        enabled: true,
        category: 'git',
        icon: 'GitCommit',
        description: 'Commit changes',
      },
      {
        id: 'disabled-action',
        title: 'Disabled Action',
        handler: 'terminal:execute',
        params: { command: 'test' },
        enabled: false,
        category: 'ai',
        icon: 'X',
        description: 'A disabled action',
      },
      {
        id: 'script-action',
        title: 'Run Script',
        handler: 'script',
        params: { path: '/run.sh' },
        enabled: true,
        category: 'ai',
        icon: 'Play',
        description: 'Run a script',
      },
      {
        id: 'shell-action',
        title: 'Shell Command',
        handler: 'shell',
        params: { command: 'echo hello' },
        enabled: true,
        category: 'ai',
        icon: 'Terminal',
        description: 'A shell command',
      },
      {
        id: 'unknown-handler',
        title: 'Unknown Handler',
        handler: 'custom-handler',
        params: { command: 'custom-cmd' },
        enabled: true,
        category: 'ai',
        icon: 'HelpCircle',
        description: 'An unknown handler type',
      },
      {
        id: 'fallback-action',
        title: 'Fallback Action',
        handler: 'other',
        params: {},
        enabled: true,
        category: 'ai',
        icon: 'Zap',
        description: 'Falls back to action.id as command',
      },
      {
        id: 'script-alt',
        title: 'Script Alt',
        handler: 'script',
        params: { script: '/alt-script.sh' },
        enabled: true,
        category: 'ai',
        icon: 'FileCode',
        description: 'Script with params.script instead of params.path',
      },
      {
        id: 'shell-cmd-alt',
        title: 'Shell Cmd Alt',
        handler: 'terminal:execute',
        params: { cmd: 'ls -la' },
        enabled: true,
        category: 'git',
        icon: 'List',
        description: 'Uses params.cmd instead of params.command',
      },
      {
        id: 'empty-command',
        title: 'Empty Command',
        handler: 'terminal:execute',
        params: {},
        enabled: true,
        category: 'ai',
        icon: 'Circle',
        description: 'Action with no command in params',
      },
    ];

    mockPreferences = { session: { quickActionMode: 'paste-only' } };
  });

  // -----------------------------------------------------------
  // 1. quickActionsForTerminal
  // -----------------------------------------------------------
  describe('quickActionsForTerminal', () => {
    it('filters out disabled actions', () => {
      const sessions = [createTerminalSession()] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      const ids = result.current.quickActionsForTerminal.map(a => a.id);
      expect(ids).not.toContain('disabled-action');
    });

    it('includes only enabled actions', () => {
      const sessions = [createTerminalSession()] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      // Total 9 actions, 1 disabled = 8 enabled
      expect(result.current.quickActionsForTerminal).toHaveLength(8);
    });

    it('maps actions to UI format with id, label, icon, category', () => {
      const sessions = [createTerminalSession()] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      const gitCommitAction = result.current.quickActionsForTerminal.find(
        a => a.id === 'git-commit'
      );
      expect(gitCommitAction).toEqual({
        id: 'git-commit',
        label: 'Git Commit',
        icon: 'GitCommit',
        category: 'git',
      });
    });

    it('uses title as label', () => {
      const sessions = [createTerminalSession()] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      for (const action of result.current.quickActionsForTerminal) {
        expect(action).toHaveProperty('label');
        expect(typeof action.label).toBe('string');
      }
    });

    it('does not include description or handler in mapped output', () => {
      const sessions = [createTerminalSession()] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      for (const action of result.current.quickActionsForTerminal) {
        expect(action).not.toHaveProperty('description');
        expect(action).not.toHaveProperty('handler');
        expect(action).not.toHaveProperty('params');
      }
    });

    it('returns empty array when all actions are disabled', () => {
      mockActions = mockActions.map(a => ({ ...a, enabled: false }));
      const sessions = [createTerminalSession()] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      expect(result.current.quickActionsForTerminal).toEqual([]);
    });

    it('returns empty array when no actions exist', () => {
      mockActions = [];
      const sessions = [createTerminalSession()] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      expect(result.current.quickActionsForTerminal).toEqual([]);
    });

    it('treats actions without explicit enabled field as enabled (enabled !== false)', () => {
      mockActions = [
        {
          id: 'no-enabled-field',
          title: 'Implicit Enabled',
          handler: 'terminal:execute',
          params: { command: 'test' },
          enabled: undefined as unknown as boolean,
          category: 'ai',
          icon: 'Check',
          description: 'No explicit enabled field',
        },
      ];
      const sessions = [createTerminalSession()] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      expect(result.current.quickActionsForTerminal).toHaveLength(1);
      expect(result.current.quickActionsForTerminal[0].id).toBe('no-enabled-field');
    });
  });

  // -----------------------------------------------------------
  // 2. handleQuickAction
  // -----------------------------------------------------------
  describe('handleQuickAction', () => {
    it('executes terminal:execute handler in paste-only mode (no \\r appended)', () => {
      const sessions = [createTerminalSession({ id: 'session-1', terminalSessionId: 42 })] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-1', 'git-commit');
      });

      expect(mockWriteToTerminal).toHaveBeenCalledOnce();
      expect(mockWriteToTerminal).toHaveBeenCalledWith(42, '/commit');
    });

    it('does nothing for unknown action ID', () => {
      const sessions = [createTerminalSession({ id: 'session-1', terminalSessionId: 42 })] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-1', 'non-existent-action');
      });

      expect(mockWriteToTerminal).not.toHaveBeenCalled();
    });

    it('does nothing for session without terminalSessionId', () => {
      const sessions = [
        createTerminalSession({ id: 'session-no-pty', terminalSessionId: undefined }),
      ] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-no-pty', 'git-commit');
      });

      expect(mockWriteToTerminal).not.toHaveBeenCalled();
    });

    it('does nothing for unknown session ID', () => {
      const sessions = [createTerminalSession({ id: 'session-1', terminalSessionId: 42 })] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-does-not-exist', 'git-commit');
      });

      expect(mockWriteToTerminal).not.toHaveBeenCalled();
    });

    it('does nothing for disabled actions (they are filtered out)', () => {
      const sessions = [createTerminalSession({ id: 'session-1', terminalSessionId: 42 })] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-1', 'disabled-action');
      });

      expect(mockWriteToTerminal).not.toHaveBeenCalled();
    });

    it('does nothing when command resolves to empty string', () => {
      const sessions = [createTerminalSession({ id: 'session-1', terminalSessionId: 42 })] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-1', 'empty-command');
      });

      expect(mockWriteToTerminal).not.toHaveBeenCalled();
    });

    it('writes to the correct terminal session ID', () => {
      const sessions = [
        createTerminalSession({ id: 'session-a', terminalSessionId: 100 }),
        createTerminalSession({ id: 'session-b', terminalSessionId: 200 }),
      ] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-b', 'git-commit');
      });

      expect(mockWriteToTerminal).toHaveBeenCalledOnce();
      expect(mockWriteToTerminal).toHaveBeenCalledWith(200, '/commit');
    });
  });

  // -----------------------------------------------------------
  // 3. Execution modes
  // -----------------------------------------------------------
  describe('execution modes', () => {
    it('paste-only mode writes command without \\r', () => {
      mockPreferences = { session: { quickActionMode: 'paste-only' } };
      const sessions = [createTerminalSession({ id: 'session-1', terminalSessionId: 42 })] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-1', 'git-commit');
      });

      expect(mockWriteToTerminal).toHaveBeenCalledWith(42, '/commit');
      // Verify no carriage return was appended
      const writtenData = mockWriteToTerminal.mock.calls[0][1] as string;
      expect(writtenData.endsWith('\r')).toBe(false);
    });

    it('execute mode writes command with \\r appended', () => {
      mockPreferences = { session: { quickActionMode: 'execute' } };
      const sessions = [createTerminalSession({ id: 'session-1', terminalSessionId: 42 })] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-1', 'git-commit');
      });

      expect(mockWriteToTerminal).toHaveBeenCalledWith(42, '/commit\r');
    });

    it('defaults to paste-only when quickActionMode is undefined', () => {
      mockPreferences = { session: {} };
      const sessions = [createTerminalSession({ id: 'session-1', terminalSessionId: 42 })] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-1', 'git-commit');
      });

      expect(mockWriteToTerminal).toHaveBeenCalledWith(42, '/commit');
      const writtenData = mockWriteToTerminal.mock.calls[0][1] as string;
      expect(writtenData.endsWith('\r')).toBe(false);
    });

    it('defaults to paste-only when session preferences are undefined', () => {
      mockPreferences = {};
      const sessions = [createTerminalSession({ id: 'session-1', terminalSessionId: 42 })] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-1', 'git-commit');
      });

      expect(mockWriteToTerminal).toHaveBeenCalledWith(42, '/commit');
      const writtenData = mockWriteToTerminal.mock.calls[0][1] as string;
      expect(writtenData.endsWith('\r')).toBe(false);
    });

    it('execute mode appends \\r to script commands too', () => {
      mockPreferences = { session: { quickActionMode: 'execute' } };
      const sessions = [createTerminalSession({ id: 'session-1', terminalSessionId: 42 })] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-1', 'script-action');
      });

      expect(mockWriteToTerminal).toHaveBeenCalledWith(42, '/run.sh\r');
    });
  });

  // -----------------------------------------------------------
  // 4. Handler types
  // -----------------------------------------------------------
  describe('handler types', () => {
    it('terminal:execute handler uses params.command', () => {
      const sessions = [createTerminalSession({ id: 'session-1', terminalSessionId: 42 })] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-1', 'git-commit');
      });

      expect(mockWriteToTerminal).toHaveBeenCalledWith(42, '/commit');
    });

    it('terminal:execute handler falls back to params.cmd', () => {
      const sessions = [createTerminalSession({ id: 'session-1', terminalSessionId: 42 })] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-1', 'shell-cmd-alt');
      });

      expect(mockWriteToTerminal).toHaveBeenCalledWith(42, 'ls -la');
    });

    it('shell handler uses params.command (same as terminal:execute)', () => {
      const sessions = [createTerminalSession({ id: 'session-1', terminalSessionId: 42 })] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-1', 'shell-action');
      });

      expect(mockWriteToTerminal).toHaveBeenCalledWith(42, 'echo hello');
    });

    it('script handler uses params.path', () => {
      const sessions = [createTerminalSession({ id: 'session-1', terminalSessionId: 42 })] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-1', 'script-action');
      });

      expect(mockWriteToTerminal).toHaveBeenCalledWith(42, '/run.sh');
    });

    it('script handler falls back to params.script', () => {
      const sessions = [createTerminalSession({ id: 'session-1', terminalSessionId: 42 })] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-1', 'script-alt');
      });

      expect(mockWriteToTerminal).toHaveBeenCalledWith(42, '/alt-script.sh');
    });

    it('unknown handler falls back to params.command', () => {
      const sessions = [createTerminalSession({ id: 'session-1', terminalSessionId: 42 })] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-1', 'unknown-handler');
      });

      expect(mockWriteToTerminal).toHaveBeenCalledWith(42, 'custom-cmd');
    });

    it('unknown handler with no params falls back to action.id', () => {
      const sessions = [createTerminalSession({ id: 'session-1', terminalSessionId: 42 })] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-1', 'fallback-action');
      });

      expect(mockWriteToTerminal).toHaveBeenCalledWith(42, 'fallback-action');
    });

    it('action with null params defaults to empty object', () => {
      mockActions = [
        {
          id: 'null-params',
          title: 'Null Params',
          handler: 'terminal:execute',
          params: null as unknown as Record<string, unknown>,
          enabled: true,
          category: 'ai',
          icon: 'X',
          description: 'Null params',
        },
      ];
      const sessions = [createTerminalSession({ id: 'session-1', terminalSessionId: 42 })] as any[];
      const { result } = renderHook(() => useQuickActionExecution(sessions));

      act(() => {
        result.current.handleQuickAction('session-1', 'null-params');
      });

      // params ?? {} handles null, command resolves to '' (empty), so nothing is written
      expect(mockWriteToTerminal).not.toHaveBeenCalled();
    });
  });
});
