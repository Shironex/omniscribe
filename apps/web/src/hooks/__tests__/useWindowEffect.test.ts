import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ---- Mocks (declared before imports that use them) ----

// Control platform detection deterministically. `vi.hoisted` keeps the mutable
// mock object available inside the hoisted `vi.mock` factory.
const platformMock = vi.hoisted(() => ({
  IS_ELECTRON: true,
  IS_MAC: true,
  IS_WINDOWS: false,
  IS_LINUX: false,
}));
vi.mock('@/lib/platform', () => platformMock);

const setBackgroundEffect = vi.fn().mockResolvedValue({ ok: true });
const getBackgroundEffectSupport = vi.fn().mockResolvedValue({ vibrancy: true, acrylic: false });

import { useWindowEffect } from '../useWindowEffect';
import { useAppearanceStore } from '@/stores/useAppearanceStore';

function installElectronApi() {
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    window: { setBackgroundEffect, getBackgroundEffectSupport },
  };
}

describe('useWindowEffect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setBackgroundEffect.mockResolvedValue({ ok: true });
    getBackgroundEffectSupport.mockResolvedValue({ vibrancy: true, acrylic: false });
    platformMock.IS_ELECTRON = true;
    installElectronApi();
    // Reset persisted effect + document attribute between tests.
    useAppearanceStore.setState({ windowEffect: 'none' });
    delete document.documentElement.dataset.windowEffect;
    localStorage.clear();
  });

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
    delete document.documentElement.dataset.windowEffect;
  });

  it('applies the persisted effect on mount and sets the document attribute', async () => {
    useAppearanceStore.setState({ windowEffect: 'vibrancy' });

    renderHook(() => useWindowEffect());

    await waitFor(() => {
      expect(setBackgroundEffect).toHaveBeenCalledWith('vibrancy');
      expect(document.documentElement.dataset.windowEffect).toBe('vibrancy');
    });
  });

  it('leaves the attribute unset when the persisted effect is none', async () => {
    renderHook(() => useWindowEffect());

    await waitFor(() => {
      expect(setBackgroundEffect).toHaveBeenCalledWith('none');
    });
    expect(document.documentElement.dataset.windowEffect).toBeUndefined();
  });

  it('reacts to live store changes and toggles the attribute', async () => {
    renderHook(() => useWindowEffect());

    await waitFor(() => expect(setBackgroundEffect).toHaveBeenCalledWith('none'));

    act(() => {
      useAppearanceStore.getState().setWindowEffect('vibrancy');
    });

    await waitFor(() => {
      expect(setBackgroundEffect).toHaveBeenCalledWith('vibrancy');
      expect(document.documentElement.dataset.windowEffect).toBe('vibrancy');
    });

    act(() => {
      useAppearanceStore.getState().setWindowEffect('none');
    });

    await waitFor(() => {
      expect(document.documentElement.dataset.windowEffect).toBeUndefined();
    });
  });

  it('resets the store to none when the persisted effect is unsupported', async () => {
    getBackgroundEffectSupport.mockResolvedValue({ vibrancy: false, acrylic: false });
    useAppearanceStore.setState({ windowEffect: 'vibrancy' });

    renderHook(() => useWindowEffect());

    await waitFor(() => {
      expect(useAppearanceStore.getState().windowEffect).toBe('none');
      expect(document.documentElement.dataset.windowEffect).toBeUndefined();
    });
    expect(setBackgroundEffect).not.toHaveBeenCalledWith('vibrancy');
  });

  it('keeps the attribute cleared outside Electron', async () => {
    platformMock.IS_ELECTRON = false;
    useAppearanceStore.setState({ windowEffect: 'vibrancy' });

    renderHook(() => useWindowEffect());

    await waitFor(() => {
      expect(document.documentElement.dataset.windowEffect).toBeUndefined();
    });
    expect(setBackgroundEffect).not.toHaveBeenCalled();
  });
});
