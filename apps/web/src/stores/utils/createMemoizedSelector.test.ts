import { describe, it, expect, vi } from 'vitest';
import { createMemoizedSelector } from './createMemoizedSelector';

interface State {
  items: { id: string; enabled: boolean }[];
  count: number;
}

const baseState: State = {
  items: [
    { id: 'a', enabled: true },
    { id: 'b', enabled: false },
    { id: 'c', enabled: true },
  ],
  count: 3,
};

describe('createMemoizedSelector', () => {
  it('returns the selector result on first call', () => {
    const select = createMemoizedSelector((s: State) => s.items.filter(i => i.enabled));
    const enabled = select(baseState);

    expect(enabled).toHaveLength(2);
    expect(enabled.map(i => i.id)).toEqual(['a', 'c']);
  });

  it('returns the same reference for shallowly-equal results', () => {
    const select = createMemoizedSelector((s: State) => s.items.filter(i => i.enabled));

    const first = select(baseState);
    // Same input shape, but a new top-level object — selector recomputes a
    // new array, but the memo should hand back the previous reference.
    const second = select({ ...baseState });

    expect(Object.is(first, second)).toBe(true);
  });

  it('returns the same reference when unrelated state changes', () => {
    const select = createMemoizedSelector((s: State) => s.items.filter(i => i.enabled));

    const first = select(baseState);
    const second = select({ ...baseState, count: 99 });

    expect(Object.is(first, second)).toBe(true);
  });

  it('returns a new reference when array contents change', () => {
    const select = createMemoizedSelector((s: State) => s.items.filter(i => i.enabled));

    const first = select(baseState);
    const second = select({
      ...baseState,
      items: [...baseState.items, { id: 'd', enabled: true }],
    });

    expect(Object.is(first, second)).toBe(false);
    expect(second).toHaveLength(3);
  });

  it('caches across many invocations as long as the result is shallow-equal', () => {
    const selectorFn = vi.fn((s: State) => s.items.filter(i => i.enabled));
    const select = createMemoizedSelector(selectorFn);

    const first = select(baseState);
    let last = first;
    for (let i = 0; i < 50; i++) {
      const next = select({ ...baseState });
      expect(Object.is(last, next)).toBe(true);
      last = next;
    }
    expect(Object.is(first, last)).toBe(true);
    // Selector runs every time the state ref changes (output comparison
    // can't be skipped), but the cached reference is returned when the
    // output is shallow-equal — that's the contract.
    expect(selectorFn).toHaveBeenCalledTimes(51);
  });

  it('memoizes object-shaped results too', () => {
    const select = createMemoizedSelector((s: State) => ({
      total: s.items.length,
      enabled: s.items.filter(i => i.enabled).length,
    }));

    const first = select(baseState);
    const second = select({ ...baseState });

    expect(Object.is(first, second)).toBe(true);
    expect(first).toEqual({ total: 3, enabled: 2 });
  });

  it('returns a new reference when an object field changes', () => {
    const select = createMemoizedSelector((s: State) => ({
      total: s.items.length,
      enabled: s.items.filter(i => i.enabled).length,
    }));

    const first = select(baseState);
    const second = select({
      ...baseState,
      items: [...baseState.items, { id: 'd', enabled: true }],
    });

    expect(Object.is(first, second)).toBe(false);
    expect(second.total).toBe(4);
    expect(second.enabled).toBe(3);
  });

  it('keeps independent caches for distinct selector instances', () => {
    const selectEnabled = createMemoizedSelector((s: State) => s.items.filter(i => i.enabled));
    const selectDisabled = createMemoizedSelector((s: State) => s.items.filter(i => !i.enabled));

    const enabled1 = selectEnabled(baseState);
    const disabled1 = selectDisabled(baseState);

    expect(Object.is(enabled1, disabled1)).toBe(false);

    // Each selector preserves its own reference across no-op updates.
    expect(Object.is(enabled1, selectEnabled({ ...baseState }))).toBe(true);
    expect(Object.is(disabled1, selectDisabled({ ...baseState }))).toBe(true);
  });
});
