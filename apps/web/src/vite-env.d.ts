/// <reference types="vite/client" />

/**
 * Module declaration for bundled plugin frontend barrels.
 * Vite aliases resolve these to the actual plugin source at build time.
 * This declaration satisfies tsc without pulling plugin source into type-checking.
 */
declare module '@omniscribe/provider-claude/frontend' {
  import type { FrontendPluginContext } from '@omniscribe/plugin-api';
  export function frontendActivate(context: FrontendPluginContext): void;
}
