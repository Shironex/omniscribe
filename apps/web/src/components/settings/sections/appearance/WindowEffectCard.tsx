import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { WindowEffect } from '@omniscribe/shared';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import { useAppearanceStore } from '@/stores/useAppearanceStore';
import { IS_ELECTRON, IS_MAC, IS_WINDOWS } from '@/lib/platform';

/**
 * Native effect for the current platform, or `null` when none is available
 * (Linux, or running outside Electron). macOS uses NSVisualEffectView
 * vibrancy; Windows 11 uses the acrylic material.
 */
const PLATFORM_EFFECT: WindowEffect | null = IS_MAC ? 'vibrancy' : IS_WINDOWS ? 'acrylic' : null;

/**
 * Native window effect card — a single "Enable window blur" toggle that maps
 * to the platform's effect (vibrancy on macOS, acrylic on Windows 11). On
 * unsupported platforms the toggle is disabled with an explanatory subtitle.
 *
 * Applying the effect to the BrowserWindow happens in {@link useWindowEffect},
 * which subscribes to the appearance store — this card only flips the store.
 */
export function WindowEffectCard() {
  const windowEffect = useAppearanceStore(state => state.windowEffect);
  const setWindowEffect = useAppearanceStore(state => state.setWindowEffect);

  // Confirm native support via IPC; until confirmed we fall back to the
  // platform guess so the control isn't briefly enabled where it shouldn't be.
  const [nativeSupported, setNativeSupported] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    async function checkSupport() {
      if (
        !IS_ELECTRON ||
        !PLATFORM_EFFECT ||
        !window.electronAPI?.window?.getBackgroundEffectSupport
      ) {
        return;
      }
      try {
        const support = await window.electronAPI.window.getBackgroundEffectSupport();
        if (cancelled) return;
        setNativeSupported(PLATFORM_EFFECT === 'vibrancy' ? support.vibrancy : support.acrylic);
      } catch {
        if (!cancelled) setNativeSupported(false);
      }
    }
    void checkSupport();
    return () => {
      cancelled = true;
    };
  }, []);

  const isSupported = nativeSupported && PLATFORM_EFFECT !== null;
  const enabled = isSupported && windowEffect !== 'none';

  const handleToggle = (next: boolean) => {
    if (!PLATFORM_EFFECT) return;
    setWindowEffect(next ? PLATFORM_EFFECT : 'none');
  };

  return (
    <SettingsCard
      icon={Sparkles}
      tone="muted"
      title="Window blur"
      subtitle={
        isSupported
          ? 'Let the desktop shine through with a native blur effect.'
          : 'Not available on this platform.'
      }
    >
      <SettingsToggleRow
        title="Enable window blur"
        description="Blur the desktop behind the window using your OS's native effect."
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={!isSupported}
      />
    </SettingsCard>
  );
}
