/**
 * Workspace tab type
 */
export type WorkspaceTabType = 'session' | 'file' | 'terminal' | 'diff' | 'settings' | 'welcome';

/**
 * Workspace tab
 */
export interface WorkspaceTab {
  /** Unique tab identifier */
  id: string;

  /** Tab type */
  type: WorkspaceTabType;

  /** Tab title */
  title: string;

  /** Tab icon name (lucide icon) */
  icon?: string;

  /** Whether tab has unsaved changes */
  isDirty?: boolean;

  /** Whether tab is pinned */
  isPinned?: boolean;

  /** Associated data */
  data?: WorkspaceTabData;

  /** Tab creation timestamp */
  createdAt: Date;

  /** Last access timestamp */
  lastAccessedAt: Date;
}

/**
 * Tab-specific data
 */
export type WorkspaceTabData =
  | SessionTabData
  | FileTabData
  | TerminalTabData
  | DiffTabData
  | SettingsTabData;

/**
 * Session tab data
 */
export interface SessionTabData {
  type: 'session';
  sessionId: string;
}

/**
 * File tab data
 */
export interface FileTabData {
  type: 'file';
  filePath: string;
  language?: string;
  encoding?: string;
}

/**
 * Terminal tab data
 */
export interface TerminalTabData {
  type: 'terminal';
  terminalId: string;
  cwd?: string;
  shell?: string;
}

/**
 * Diff tab data
 */
export interface DiffTabData {
  type: 'diff';
  leftPath: string;
  rightPath: string;
  leftTitle?: string;
  rightTitle?: string;
}

/**
 * Settings tab data
 */
export interface SettingsTabData {
  type: 'settings';
  section?: string;
}

/**
 * Quick action category
 */
export type QuickActionCategory =
  | 'git'
  | 'file'
  | 'session'
  | 'terminal'
  | 'ai'
  | 'navigation'
  | 'settings';

/**
 * Quick action definition
 */
export interface QuickAction {
  /** Unique action identifier */
  id: string;

  /** Action title */
  title: string;

  /** Action description */
  description?: string;

  /** Action category */
  category: QuickActionCategory;

  /** Keyboard shortcut */
  shortcut?: string;

  /** Icon name (lucide icon) */
  icon?: string;

  /** Whether action is enabled */
  enabled?: boolean;

  /** Action handler name */
  handler: string;

  /** Action parameters */
  params?: Record<string, unknown>;
}

/**
 * Workspace panel type
 */
export type WorkspacePanelType = 'explorer' | 'search' | 'git' | 'sessions' | 'mcp' | 'output';

/**
 * Workspace panel state
 */
export interface WorkspacePanelState {
  /** Panel type */
  type: WorkspacePanelType;

  /** Whether panel is visible */
  isVisible: boolean;

  /** Panel width (for side panels) */
  width?: number;

  /** Panel height (for bottom panels) */
  height?: number;

  /** Panel-specific state */
  state?: Record<string, unknown>;
}

/**
 * Workspace layout
 */
export interface WorkspaceLayout {
  /** Left sidebar panels */
  leftSidebar: {
    isVisible: boolean;
    width: number;
    activePanel?: WorkspacePanelType;
    panels: WorkspacePanelState[];
  };

  /** Right sidebar panels */
  rightSidebar: {
    isVisible: boolean;
    width: number;
    activePanel?: WorkspacePanelType;
    panels: WorkspacePanelState[];
  };

  /** Bottom panel */
  bottomPanel: {
    isVisible: boolean;
    height: number;
    activePanel?: WorkspacePanelType;
    panels: WorkspacePanelState[];
  };

  /** Active tab groups */
  tabGroups: WorkspaceTabGroup[];
}

/**
 * Workspace tab group
 */
export interface WorkspaceTabGroup {
  /** Group identifier */
  id: string;

  /** Tabs in this group */
  tabs: WorkspaceTab[];

  /** Active tab ID */
  activeTabId?: string;

  /** Group split direction */
  splitDirection?: 'horizontal' | 'vertical';

  /** Group size ratio (0-1) */
  sizeRatio?: number;
}

/**
 * Recent workspace entry
 */
export interface RecentWorkspace {
  /** Workspace path */
  path: string;

  /** Workspace name */
  name: string;

  /** Last opened timestamp */
  lastOpenedAt: Date;

  /** Whether workspace is pinned */
  isPinned?: boolean;

  /** Git branch if available */
  gitBranch?: string;
}

/**
 * Workspace settings
 */
export interface WorkspaceSettings {
  /** Theme preference */
  theme: 'light' | 'dark' | 'system';

  /** Font size for editor */
  fontSize: number;

  /** Font family for editor */
  fontFamily: string;

  /** Tab size */
  tabSize: number;

  /** Use spaces for indentation */
  useSpaces: boolean;

  /** Word wrap setting */
  wordWrap: 'off' | 'on' | 'wordWrapColumn' | 'bounded';

  /** Show line numbers */
  showLineNumbers: boolean;

  /** Show minimap */
  showMinimap: boolean;

  /** Auto-save delay in milliseconds (0 to disable) */
  autoSaveDelay: number;

  /** Default terminal shell */
  defaultShell?: string;

  /** MCP servers to auto-connect */
  autoConnectMcpServers: string[];
}
