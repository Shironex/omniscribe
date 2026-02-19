---
sidebar_position: 2
---

# Plugin Anatomy

Every provider plugin follows the same file structure. Here's what each file does.

## Directory Structure

```
packages/plugins/provider-<name>/
├── package.json              # Package manifest with omniscribe field
├── tsconfig.json             # TypeScript configuration
├── jest.config.js            # Test configuration
├── assets/                   # Static assets (icons, etc.)
│   └── <name>-icon.svg
├── src/
│   ├── index.ts              # Backend barrel export
│   ├── <name>-provider.plugin.ts  # Main plugin class
│   ├── types/
│   │   └── index.ts          # Provider-specific types
│   ├── services/
│   │   ├── cli-detection.service.ts    # CLI detection logic
│   │   ├── cli-command.service.ts      # Command building
│   │   ├── status-parser.service.ts    # Terminal output parsing
│   │   ├── usage-fetcher.service.ts    # Usage data fetching (optional)
│   │   └── usage-parser.service.ts     # Usage data parsing (optional)
│   ├── frontend/
│   │   ├── index.ts                    # Frontend barrel + frontendActivate()
│   │   ├── <Name>Icon.tsx              # Provider icon component
│   │   ├── <Name>SettingsSection.tsx   # Settings panel
│   │   ├── <Name>StatusRenderer.tsx    # Status icon renderer
│   │   └── <Name>UsagePanel.tsx        # Usage data display
│   └── __tests__/
│       ├── <name>-provider.plugin.spec.ts
│       ├── cli-detection.service.spec.ts
│       └── status-parser.service.spec.ts
```

## Key Files Explained

### `package.json` — Plugin Manifest

The `omniscribe` field declares the plugin's identity:

```json
{
  "name": "@omniscribe/provider-<name>",
  "version": "1.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "omniscribe": {
    "id": "provider-<name>",
    "type": "provider",
    "displayName": "My AI Tool",
    "description": "Integration for My AI Tool CLI"
  },
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:cov": "jest --coverage"
  },
  "devDependencies": {
    "@omniscribe/plugin-api": "workspace:*",
    "@omniscribe/shared": "workspace:*"
  }
}
```

### `src/index.ts` — Backend Barrel Export

Exports the plugin class, services, and types for the backend:

```typescript
export { MyProviderPlugin } from './my-provider.plugin';
export { MyCliDetectionService } from './services/cli-detection.service';
export { MyCliCommandService } from './services/cli-command.service';
export { MyStatusParserService } from './services/status-parser.service';
export * from './types';
```

### `src/<name>-provider.plugin.ts` — Main Plugin Class

The central plugin class extending `BaseProviderPlugin`. Instantiates services and delegates to them:

```typescript
import { BaseProviderPlugin } from '@omniscribe/plugin-api';

export class MyProviderPlugin extends BaseProviderPlugin {
  readonly id = 'my-provider';
  readonly displayName = 'My AI Tool';
  readonly aiMode = 'my-tool';

  private cliDetection = new MyCliDetectionService();
  private cliCommand = new MyCliCommandService();
  private statusParser = new MyStatusParserService();

  async detectCli() {
    return this.cliDetection.detect();
  }

  buildLaunchCommand(context) {
    return this.cliCommand.buildLaunch(context);
  }

  parseTerminalStatus(output) {
    return this.statusParser.parse(output);
  }
}
```

### `src/frontend/index.ts` — Frontend Activation

Registers all UI contributions when the plugin's frontend is loaded:

```typescript
import type { FrontendPluginContext } from '@omniscribe/plugin-api';
import { MyIcon } from './MyIcon';
import { MySettingsSection } from './MySettingsSection';
import { MyStatusRenderer } from './MyStatusRenderer';

export function frontendActivate(context: FrontendPluginContext): void {
  context.subscriptions.push(
    context.registerSettingsCategory({
      categoryId: 'my-tool',
      label: 'My AI Tool',
      sections: [
        {
          categoryId: 'my-tool',
          sectionId: 'my-tool-settings',
          label: 'My AI Tool',
          icon: MyIcon as any,
          component: MySettingsSection as any,
          order: 10,
        },
      ],
      order: 10,
    })
  );

  context.subscriptions.push(
    context.registerSessionStatusRenderer({
      id: 'my-tool-status',
      aiMode: 'my-tool',
      component: MyStatusRenderer as any,
    })
  );
}
```

:::note
The `as any` casts are required because `@omniscribe/plugin-api` is React-free (pure TypeScript), but the registration methods accept generic component types that are rendered by the React frontend.
:::

## Wiring a New Plugin

After creating the plugin package, three files in the monorepo need manual updates:

1. **`apps/desktop/src/modules/app.module.ts`** — Add a `PluginDefinition` entry
2. **`apps/web/vite.config.ts`** — Add a Vite alias for the frontend barrel
3. **`apps/web/src/hooks/usePluginInitialization.ts`** — Add to `BUNDLED_FRONTEND_ACTIVATORS`

See [Creating a Provider Plugin](/sdk/creating-a-provider) for the complete wiring guide.
