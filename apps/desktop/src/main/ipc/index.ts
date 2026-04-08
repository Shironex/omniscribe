// Types
export type { MessageDialogOptions, ProjectValidationResult, HandlerModule } from './types';

// Window handlers
export { registerWindowHandlers, cleanupWindowHandlers } from './window';

// Dialog handlers
export { registerDialogHandlers, cleanupDialogHandlers } from './dialog';

// Store handlers
export { registerStoreHandlers, cleanupStoreHandlers } from './store';

// App handlers
export { registerAppHandlers, cleanupAppHandlers } from './app';

// Claude CLI handlers
export { registerClaudeCliHandlers, cleanupClaudeCliHandlers } from './claude-cli';

// GitHub CLI handlers
export { registerGithubCliHandlers, cleanupGithubCliHandlers } from './github-cli';

// Updater handlers
export { registerUpdaterHandlers, cleanupUpdaterHandlers } from './updater';

// Plugin handlers
export { registerPluginIpc, cleanupPluginIpc } from './plugin';

// Notification handlers
export { registerNotificationHandlers, cleanupNotificationHandlers } from './notification';

// Thumbnail handlers
export {
  registerThumbnailHandlers,
  cleanupThumbnailHandlers,
  deleteThumbnailFile,
} from './thumbnail';
