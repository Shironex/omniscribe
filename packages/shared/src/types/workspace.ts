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
  category: 'git' | 'file' | 'session' | 'terminal' | 'ai' | 'navigation' | 'settings';

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
