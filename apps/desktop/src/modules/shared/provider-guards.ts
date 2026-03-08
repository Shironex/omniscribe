import type { AiProviderPlugin } from '@omniscribe/plugin-api';

/**
 * Check whether a provider plugin exposes a method by name.
 * Avoids repeating the `'method' in provider && typeof ... === 'function'` pattern.
 */
export function hasProviderMethod<K extends string>(
  provider: AiProviderPlugin,
  method: K
): provider is AiProviderPlugin & Record<K, () => unknown> {
  return (
    method in provider &&
    typeof (provider as unknown as Record<string, unknown>)[method] === 'function'
  );
}
