/**
 * Socket Payload/Response Types - Common patterns for WebSocket communication
 */

import type { ProjectTabDTO, UserPreferences } from './project-tab';
import type { QuickAction } from './workspace';

// ============================================
// Generic Response Types
// ============================================

/**
 * Generic success/error response
 */
export interface SuccessResponse {
  success: boolean;
  error?: string;
}

/**
 * Response with project path
 */
export interface ProjectPathPayload {
  projectPath: string;
}

// ============================================
// Tab Payloads
// ============================================

/**
 * Payload for adding a tab
 */
export interface AddTabPayload {
  id: string;
  projectPath: string;
  name: string;
  theme?: string;
}

/**
 * Payload for updating a tab's theme
 */
export interface UpdateTabThemePayload {
  tabId: string;
  theme: string;
}

/**
 * Payload for removing a tab
 */
export interface RemoveTabPayload {
  tabId: string;
}

/**
 * Payload for selecting a tab
 */
export interface SelectTabPayload {
  tabId: string;
}

// ============================================
// Tab Responses
// ============================================

/**
 * Response with tabs and active tab
 */
export interface TabsResponse extends SuccessResponse {
  tabs: ProjectTabDTO[];
  activeTabId: string | null;
}

/**
 * Response with just tabs (no activeTabId change)
 */
export interface TabsOnlyResponse extends SuccessResponse {
  tabs: ProjectTabDTO[];
}

// ============================================
// Workspace State Payloads
// ============================================

/**
 * Payload for saving workspace state
 */
export interface SaveStatePayload {
  tabs?: ProjectTabDTO[];
  activeTabId?: string | null;
  preferences?: UserPreferences;
}

/**
 * Backend workspace state response
 */
export interface WorkspaceStateResponse {
  tabs: ProjectTabDTO[];
  activeTabId: string | null;
  preferences: UserPreferences;
  quickActions: QuickAction[];
}

// ============================================
// Preferences Payloads
// ============================================

/**
 * Payload for updating a preference
 */
export interface UpdatePreferencePayload {
  key: string;
  value: unknown;
}

/**
 * Response with preferences
 */
export interface PreferencesResponse extends SuccessResponse {
  preferences: UserPreferences;
}

// ============================================
// Quick Action Payloads
// ============================================

/**
 * Payload for executing a quick action
 */
export interface ExecuteQuickActionPayload {
  /** The session ID context (AI session or identifier) */
  sessionId: string;
  /** The quick action to execute */
  action: QuickAction;
  /** Additional context */
  context?: {
    projectPath?: string;
    terminalSessionId?: number;
  };
}

/**
 * Payload for getting quick actions
 */
export interface GetQuickActionsPayload {
  /** Optional filter by category */
  category?: string;
  /** Only return enabled actions */
  enabledOnly?: boolean;
}

/**
 * Payload for updating quick actions
 */
export interface UpdateQuickActionsPayload {
  actions: QuickAction[];
}

/**
 * Response with quick actions
 */
export interface QuickActionsResponse extends SuccessResponse {
  actions: QuickAction[];
}

// ============================================
// Broadcast Events
// ============================================

/**
 * Tabs updated broadcast event
 */
export interface TabsUpdatedEvent {
  tabs: ProjectTabDTO[];
  activeTabId: string | null;
}

/**
 * Preferences updated broadcast event
 */
export interface PreferencesUpdatedEvent {
  preferences: UserPreferences;
}

/**
 * Quick actions updated broadcast event
 */
export interface QuickActionsUpdatedEvent {
  actions: QuickAction[];
}
