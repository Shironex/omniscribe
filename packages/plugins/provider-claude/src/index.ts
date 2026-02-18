/**
 * @omniscribe/provider-claude
 *
 * Claude Code provider plugin for Omniscribe.
 * Handles CLI detection, command building, usage parsing, and status parsing
 * for Anthropic's Claude Code CLI.
 *
 * @packageDocumentation
 */

export * from './types';

// Services
export { ClaudeCliDetectionService } from './services/cli-detection.service';
export { ClaudeCliCommandService } from './services/cli-command.service';
export { ClaudeUsageParserService } from './services/usage-parser.service';
export { ClaudeStatusParserService } from './services/status-parser.service';
export { OMNISCRIBE_SYSTEM_PROMPT, getSystemPromptAdditions } from './services/system-prompt';

// Plugin class will be added in a subsequent plan
