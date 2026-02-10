import { shallow } from 'zustand/shallow';

/**
 * Creates a memoized selector that returns a stable reference when the result
 * is shallowly equal to the previous result. This prevents unnecessary
 * re-renders when selectors return new array/object references with the
 * same contents (e.g., from .filter() or .map()).
 *
 * @example
 * export const selectEnabledActions = createMemoizedSelector(
 *   (state: QuickActionStore) => state.actions.filter(a => a.enabled !== false)
 * );
 */
export function createMemoizedSelector<S, R>(selector: (state: S) => R): (state: S) => R {
  let lastResult: R | undefined;

  return (state: S) => {
    const result = selector(state);
    if (lastResult !== undefined && shallow(lastResult, result)) {
      return lastResult;
    }
    lastResult = result;
    return result;
  };
}
