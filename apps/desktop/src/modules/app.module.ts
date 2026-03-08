import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { TerminalModule } from './terminal';
import { WorkspaceModule } from './workspace';
import { SessionModule } from './session';
import { GitModule } from './git';
import { McpModule } from './mcp';
import { UsageModule } from './usage';
import { HealthModule } from './health';
import { PluginModule } from './plugin';
import { ClaudeProviderPlugin } from '@omniscribe/provider-claude';
import { CodexProviderPlugin } from '@omniscribe/provider-codex';

@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 second window
        limit: 100, // max 100 requests per second (desktop app — single user)
      },
      {
        name: 'medium',
        ttl: 10000, // 10 second window
        limit: 500, // max 500 requests per 10 seconds
      },
    ]),
    // PluginModule must be after ThrottlerModule but before domain modules
    // so PluginRegistryService is available for injection everywhere.
    PluginModule.forRoot([
      {
        manifest: {
          id: 'provider-claude',
          type: 'provider',
          displayName: 'Claude Code',
          description: "Anthropic's AI coding assistant via Claude Code CLI",
          version: '1.0.0',
          apiVersion: '1.0.0',
        },
        createPlugin: () => new ClaudeProviderPlugin(),
        autoEnable: true,
        autoActivate: true,
        builtIn: true,
      },
      {
        manifest: {
          id: 'provider-codex',
          type: 'provider',
          displayName: 'Codex',
          description: "OpenAI's Codex CLI for AI-assisted coding",
          version: '1.0.0',
          apiVersion: '1.0.0',
        },
        createPlugin: () => new CodexProviderPlugin(),
        autoEnable: true,
        autoActivate: true,
        builtIn: true,
      },
    ]),
    TerminalModule,
    WorkspaceModule,
    SessionModule,
    GitModule,
    McpModule,
    UsageModule,
    HealthModule,
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class AppModule {}
