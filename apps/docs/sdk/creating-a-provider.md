---
sidebar_position: 3
---

# Creating a Provider Plugin

This guide walks through creating a minimal provider plugin from scratch. By the end, you'll have a working plugin that detects a CLI tool, launches sessions, and parses terminal output.

## Prerequisites

- Omniscribe development environment set up ([Quick Start](/docs/getting-started/quickstart))
- Familiarity with TypeScript and the plugin system ([Overview](/sdk/overview))

## Step 1: Create the Package

Create the directory structure:

```bash
mkdir -p packages/plugins/provider-mytool/src/{services,frontend,__tests__}
```

Create `packages/plugins/provider-mytool/package.json`:

```json
{
  "name": "@omniscribe/provider-mytool",
  "version": "1.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.js"
    }
  },
  "omniscribe": {
    "id": "provider-mytool",
    "type": "provider",
    "displayName": "My Tool",
    "description": "My AI coding assistant integration"
  },
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:cov": "jest --coverage"
  },
  "devDependencies": {
    "@omniscribe/plugin-api": "workspace:*",
    "@omniscribe/shared": "workspace:*",
    "@types/jest": "^30.0.0",
    "@types/node": "^25.2.1",
    "jest": "^30.0.0",
    "ts-jest": "^29.4.0",
    "typescript": "^5.5.0"
  }
}
```

Create `packages/plugins/provider-mytool/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "CommonJS",
    "moduleResolution": "node",
    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "src/**/*.spec.ts", "test", "src/frontend/**/*"]
}
```

:::note
Frontend files (`src/frontend/**/*`) are excluded from the plugin's own TypeScript compilation. They are compiled by the web app's Vite build which has the necessary React and alias configuration.
:::

## Step 2: Implement the Plugin Class

Create `packages/plugins/provider-mytool/src/mytool-provider.plugin.ts`:

```typescript
import {
  BaseProviderPlugin,
  CliDetectionResult,
  CliCommandConfig,
  LaunchContext,
  ProviderSessionStatus,
} from '@omniscribe/plugin-api';
import { execSync } from 'child_process';

export class MyToolProviderPlugin extends BaseProviderPlugin {
  readonly id = 'provider-mytool';
  readonly displayName = 'My Tool';
  readonly aiMode = 'mytool';

  async detectCli(): Promise<CliDetectionResult> {
    try {
      const version = execSync('mytool --version', {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();

      return {
        installed: true,
        version,
        path: execSync('which mytool', { encoding: 'utf-8' }).trim(),
      };
    } catch {
      return {
        installed: false,
        error: 'mytool CLI not found in PATH',
      };
    }
  }

  buildLaunchCommand(context: LaunchContext): CliCommandConfig {
    const args: string[] = ['chat'];

    if (context.model) {
      args.push('--model', context.model);
    }

    if (context.systemPrompt) {
      args.push('--system-prompt', context.systemPrompt);
    }

    return {
      command: 'mytool',
      args,
      cwd: context.workingDirectory,
    };
  }

  parseTerminalStatus(output: string): ProviderSessionStatus | null {
    // Detect the idle prompt
    if (output.includes('mytool> ')) return 'idle';
    // Detect thinking/working indicators
    if (output.includes('Thinking...') || output.includes('Generating...')) return 'working';
    // Detect input requests
    if (output.includes('? ')) return 'needs_input';
    // No status change detected
    return null;
  }
}
```

## Step 3: Create the Barrel Export

Create `packages/plugins/provider-mytool/src/index.ts`:

```typescript
export { MyToolProviderPlugin } from './mytool-provider.plugin';
```

## Step 4: Wire into Omniscribe

### 4a. Register in the backend

In `apps/desktop/src/modules/app.module.ts`, add your plugin definition:

```typescript
import { MyToolProviderPlugin } from '@omniscribe/provider-mytool';

// In the PluginModule.forRoot([...]) array:
{
  manifest: {
    id: 'provider-mytool',
    type: 'provider',
    displayName: 'My Tool',
    description: 'My AI coding assistant integration',
  },
  createPlugin: () => new MyToolProviderPlugin(),
  autoEnable: true,
  autoActivate: true,
},
```

### 4b. Add the build dependency

In the root `package.json`, update `build:packages` to include your plugin:

```bash
# Add to the concurrently group with other providers
concurrently "pnpm --filter @omniscribe/provider-claude build" "pnpm --filter @omniscribe/provider-codex build" "pnpm --filter @omniscribe/provider-mytool build"
```

### 4c. Install and build

```bash
pnpm install
pnpm build:packages
pnpm dev
```

Your provider should now appear in Omniscribe's settings under the provider list.

## Step 5: Add Frontend UI (Optional)

To add a custom settings section and status renderer, create the frontend files following the pattern in [Plugin Anatomy](/sdk/plugin-anatomy). Then wire the frontend:

### 5a. Add Vite alias

In `apps/web/vite.config.ts`, add an alias:

```typescript
'@omniscribe/provider-mytool/frontend': resolve(
  __dirname,
  '../../packages/plugins/provider-mytool/src/frontend/index.ts'
),
```

### 5b. Add to frontend activators

In `apps/web/src/hooks/usePluginInitialization.ts`, add to `BUNDLED_FRONTEND_ACTIVATORS`:

```typescript
'mytool': () => import('@omniscribe/provider-mytool/frontend'),
```

### 5c. Add frontend dependencies

If your frontend components use `lucide-react` or other UI libraries, add them as `devDependencies` in your plugin's `package.json`.

## Step 6: Add Tests

Create `packages/plugins/provider-mytool/src/__tests__/mytool-provider.plugin.spec.ts`:

```typescript
import { MyToolProviderPlugin } from '../mytool-provider.plugin';

describe('MyToolProviderPlugin', () => {
  let plugin: MyToolProviderPlugin;

  beforeEach(() => {
    plugin = new MyToolProviderPlugin();
  });

  it('should have correct metadata', () => {
    expect(plugin.id).toBe('provider-mytool');
    expect(plugin.aiMode).toBe('mytool');
    expect(plugin.type).toBe('provider');
  });

  describe('parseTerminalStatus', () => {
    it('should detect idle state', () => {
      expect(plugin.parseTerminalStatus('mytool> ')).toBe('idle');
    });

    it('should detect working state', () => {
      expect(plugin.parseTerminalStatus('Thinking...')).toBe('working');
    });

    it('should return null for unknown output', () => {
      expect(plugin.parseTerminalStatus('Hello world')).toBeNull();
    });
  });

  describe('buildLaunchCommand', () => {
    it('should build basic launch command', () => {
      const cmd = plugin.buildLaunchCommand({
        sessionId: 'test-123',
        workingDirectory: '/tmp/project',
        projectPath: '/tmp/project',
      } as any);

      expect(cmd.command).toBe('mytool');
      expect(cmd.args).toContain('chat');
      expect(cmd.cwd).toBe('/tmp/project');
    });
  });
});
```

## Next Steps

- Browse the [API Reference](/api) for the full `AiProviderPlugin` interface
- Study the [Claude provider](https://github.com/Shironex/omniscribe/tree/master/packages/plugins/provider-claude) for a full-featured reference implementation
- Add optional capabilities like usage tracking and session history
