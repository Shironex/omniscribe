import type { BrowserWindow } from 'electron';

/**
 * Options for dialog:message handler
 */
export interface MessageDialogOptions {
  type?: 'none' | 'info' | 'error' | 'question' | 'warning';
  title?: string;
  message: string;
  detail?: string;
  buttons?: string[];
}

/**
 * Result of project validation
 */
export interface ProjectValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Handler module interface - each IPC handler module exports these functions
 */
export interface HandlerModule {
  register: (mainWindow?: BrowserWindow) => void;
  cleanup: () => void;
}
