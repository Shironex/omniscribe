/**
 * DEV-only zustand devtools middleware.
 *
 * In production, returns a passthrough that mirrors the devtools()
 * signature — including the third action-name arg on `set` — but does
 * not pull in the redux-devtools shim. Saves ~3–5 KB gzip across the
 * 18 stores.
 *
 * Generic over the inner-mutator list so stores composed with
 * `devtools(persist(...))` still type-check.
 */
import { devtools as zustandDevtools } from 'zustand/middleware';
import type { StateCreator, StoreMutatorIdentifier } from 'zustand';

type DevtoolsOptions = Parameters<typeof zustandDevtools>[1];

export function devtools<
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  config: StateCreator<T, [...Mps, ['zustand/devtools', never]], Mcs>,
  options?: DevtoolsOptions
): StateCreator<T, Mps, [['zustand/devtools', never], ...Mcs]> {
  if (import.meta.env.DEV) {
    return zustandDevtools(config, options);
  }

  // Production passthrough: shim `set` so the (partial, replace, actionName)
  // form used by store callsites still works without the devtools shim.
  return ((set, get, api) => {
    const wrappedSet = ((partial: unknown, replace?: boolean, _actionName?: unknown) => {
      // The action-name arg is devtools-only; drop it on the floor.
      return (set as (...args: unknown[]) => unknown)(partial, replace);
    }) as typeof set;
    return (config as unknown as StateCreator<T, Mps, [['zustand/devtools', never], ...Mcs]>)(
      wrappedSet,
      get,
      api
    );
  }) as StateCreator<T, Mps, [['zustand/devtools', never], ...Mcs]>;
}
