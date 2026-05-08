import { useMemo } from 'react';
import { BUILT_IN_THEMES } from '@omniscribe/shared';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { usePluginStore } from '@/stores/usePluginStore';

/**
 * Miniature workspace-shell mock that paints itself with the active theme's
 * swatch tokens (bg / surface / primary / accent). Lets users see how the
 * chosen theme will tint the actual app chrome — sidebar accent, card surface,
 * primary highlight — without having to apply it first.
 */
export function AppearancePreview() {
  const themeId = useSettingsStore(s => s.theme);
  const pluginThemes = usePluginStore(s => s.themes);

  const swatch = useMemo(() => {
    const builtIn = BUILT_IN_THEMES.find(t => t.value === themeId);
    if (builtIn) return builtIn.swatch;
    const plugin = pluginThemes.get(themeId);
    if (plugin) {
      const bg = plugin.isDark ? '#0e0e0e' : '#f8f8f8';
      const surface = plugin.isDark ? '#1a1a1a' : '#eeeeee';
      return { bg, surface, primary: plugin.color, accent: plugin.color };
    }
    return { bg: '#0f0e0d', surface: '#1a1714', primary: '#e89143', accent: '#5b9cf2' };
  }, [themeId, pluginThemes]);

  return (
    <div
      className="rounded-lg border border-border-glass overflow-hidden select-none"
      style={{ backgroundColor: swatch.bg, minHeight: 132 }}
      role="img"
      aria-label="Appearance preview"
    >
      {/* Window chrome */}
      <div
        className="flex items-center gap-1.5 px-3 py-2 border-b"
        style={{ backgroundColor: swatch.surface, borderColor: 'rgba(255,255,255,0.05)' }}
      >
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: swatch.accent, opacity: 0.8 }}
        />
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: swatch.primary, opacity: 0.7 }}
        />
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: '#ffffff', opacity: 0.18 }}
        />
      </div>
      {/* Body: sidebar + main */}
      <div className="flex" style={{ minHeight: 96 }}>
        <div
          className="w-[34%] p-2 space-y-1.5 border-r"
          style={{ backgroundColor: swatch.surface, borderColor: 'rgba(255,255,255,0.05)' }}
        >
          <div className="h-2 rounded" style={{ backgroundColor: swatch.primary, width: '70%' }} />
          <div
            className="h-1.5 rounded"
            style={{ backgroundColor: '#ffffff', opacity: 0.12, width: '85%' }}
          />
          <div
            className="h-1.5 rounded"
            style={{ backgroundColor: '#ffffff', opacity: 0.12, width: '55%' }}
          />
          <div
            className="h-1.5 rounded"
            style={{ backgroundColor: '#ffffff', opacity: 0.12, width: '70%' }}
          />
        </div>
        <div className="flex-1 p-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 rounded" style={{ backgroundColor: swatch.accent, width: 28 }} />
            <span
              className="h-1.5 rounded"
              style={{ backgroundColor: '#ffffff', opacity: 0.18, width: 18 }}
            />
          </div>
          <div className="rounded p-2 space-y-1" style={{ backgroundColor: swatch.surface }}>
            <div
              className="h-1.5 rounded"
              style={{ backgroundColor: '#ffffff', opacity: 0.18, width: '90%' }}
            />
            <div
              className="h-1.5 rounded"
              style={{ backgroundColor: '#ffffff', opacity: 0.12, width: '70%' }}
            />
            <div
              className="h-1.5 rounded"
              style={{ backgroundColor: swatch.primary, width: '40%' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
