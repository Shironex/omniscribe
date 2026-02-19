/**
 * @omniscribe/provider-claude
 *
 * Claude Code provider plugin for Omniscribe.
 * Provides CLI detection, command building, usage fetching, session reading,
 * hook management, session tracking, and status parsing for Anthropic's
 * Claude Code CLI.
 *
 * @packageDocumentation
 */

// Plugin class
export { ClaudeProviderPlugin } from './claude-provider.plugin';

// Services
export { ClaudeCliDetectionService } from './services/cli-detection.service';
export { ClaudeCliCommandService } from './services/cli-command.service';
export { ClaudeSessionReaderService } from './services/session-reader.service';
export { ClaudeHookManagerService } from './services/hook-manager.service';
export { ClaudeSessionTrackerService } from './services/session-tracker.service';
export { ClaudeUsageFetcherService } from './services/usage-fetcher.service';
export { ClaudeUsageParserService } from './services/usage-parser.service';
export { ClaudeStatusParserService } from './services/status-parser.service';
export { OMNISCRIBE_SYSTEM_PROMPT, getSystemPromptAdditions } from './services/system-prompt';

// Types
export * from './types';

// Hook types
export type { HookEventData, HookEventCallback } from './services/hook-manager.service';
