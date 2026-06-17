import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { act } from 'react';

// Mock the IndexedDB image resolver so the component's async URL lookup is
// deterministic and synchronous-ish in tests.
const getBgImageUrl = vi.fn<(id: string) => Promise<string | null>>();
vi.mock('@/lib/background/bg-image-store', () => ({
  getBgImageUrl: (id: string) => getBgImageUrl(id),
}));

import { SurfaceLayer } from '../SurfaceLayer';
import { useAppearanceStore } from '@/stores/useAppearanceStore';
import { DEFAULT_APPEARANCE_BACKGROUND } from '@omniscribe/shared';

function resetAppearance() {
  useAppearanceStore.setState({
    background: { ...DEFAULT_APPEARANCE_BACKGROUND },
    windowEffect: 'none',
  });
}

/** The portaled overlay div, if present. */
function surfaceEl(): HTMLElement | null {
  return document.body.querySelector('[data-surface-layer]');
}

describe('SurfaceLayer', () => {
  beforeEach(() => {
    cleanup();
    resetAppearance();
    getBgImageUrl.mockReset();
    getBgImageUrl.mockResolvedValue('blob:img/1');
  });

  it('renders nothing when kind is none', async () => {
    render(<SurfaceLayer />);
    // Give any pending effects a tick.
    await Promise.resolve();
    expect(surfaceEl()).toBeNull();
    expect(getBgImageUrl).not.toHaveBeenCalled();
  });

  it('renders nothing when kind is image but imageId is null', async () => {
    act(() => {
      useAppearanceStore.setState({
        background: { kind: 'image', imageId: null, opacity: 0.5, blur: 0 },
      });
    });
    render(<SurfaceLayer />);
    await Promise.resolve();
    expect(surfaceEl()).toBeNull();
    expect(getBgImageUrl).not.toHaveBeenCalled();
  });

  it('renders nothing while the object URL has not resolved yet', async () => {
    // Never-resolving promise → URL stays null.
    getBgImageUrl.mockReturnValue(new Promise<string | null>(() => {}));
    act(() => {
      useAppearanceStore.setState({
        background: { kind: 'image', imageId: 'abc', opacity: 0.5, blur: 0 },
      });
    });
    render(<SurfaceLayer />);
    await Promise.resolve();
    expect(surfaceEl()).toBeNull();
    expect(getBgImageUrl).toHaveBeenCalledWith('abc');
  });

  it('renders the portaled overlay once the URL resolves, with capped opacity', async () => {
    act(() => {
      useAppearanceStore.setState({
        background: { kind: 'image', imageId: 'abc', opacity: 0.8, blur: 0 },
      });
    });
    render(<SurfaceLayer />);

    await waitFor(() => expect(surfaceEl()).not.toBeNull());

    const el = surfaceEl() as HTMLElement;
    expect(el.style.position).toBe('fixed');
    expect(el.style.pointerEvents).toBe('none');
    expect(el.style.backgroundImage).toContain('blob:img/1');
    // opacity 0.8 × BG_OPACITY_RENDER_FACTOR (0.5) = 0.4
    expect(Number(el.style.opacity)).toBeCloseTo(0.4, 5);
    // blur 0 → no filter applied
    expect(el.style.filter).toBe('');
  });

  it('applies the blur filter when blur > 0', async () => {
    act(() => {
      useAppearanceStore.setState({
        background: { kind: 'image', imageId: 'abc', opacity: 0.5, blur: 12 },
      });
    });
    render(<SurfaceLayer />);

    await waitFor(() => expect(surfaceEl()).not.toBeNull());
    expect((surfaceEl() as HTMLElement).style.filter).toBe('blur(12px)');
  });
});
