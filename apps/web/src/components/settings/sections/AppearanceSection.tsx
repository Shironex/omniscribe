import { useCallback, useMemo } from 'react';
import { Palette, LayoutGrid, Puzzle, Eye } from 'lucide-react';
import { APP_NAME } from '@omniscribe/shared';
import type { ChromeSettings } from '@omniscribe/shared';
import { themeOptions, type ThemeOption } from '@/lib/theme';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { usePluginStore } from '@/stores/usePluginStore';
import { ThemeGrid } from '@/components/shared/theme/ThemeGrid';
import { ThemeSwatchCard } from '@/components/shared/theme/ThemeSwatchCard';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import { AppearancePreview } from '@/components/settings/previews/AppearancePreview';
import { BackgroundCard } from '@/components/settings/sections/appearance/BackgroundCard';
import { WindowEffectCard } from '@/components/settings/sections/appearance/WindowEffectCard';
import { CustomThemesCard } from '@/components/settings/sections/appearance/CustomThemesCard';

function pluginThemeToOption(plugin: {
  id: string;
  label: string;
  isDark: boolean;
  color: string;
}): ThemeOption {
  const bg = plugin.isDark ? '#0e0e0e' : '#f8f8f8';
  const surface = plugin.isDark ? '#1a1a1a' : '#eeeeee';
  return {
    // Plugin id is an arbitrary string — `ThemeOption.value` is widened to
    // `Theme | (string & {})` so we don't have to launder it as `Theme`.
    value: plugin.id,
    label: plugin.label,
    Icon: Puzzle,
    testId: `plugin-theme-${plugin.id}`,
    isDark: plugin.isDark,
    color: plugin.color,
    swatch: { bg, surface, primary: plugin.color, accent: plugin.color },
  };
}

interface ChromeOption {
  key: keyof ChromeSettings;
  title: string;
  description: string;
}

const CHROME_OPTIONS: readonly ChromeOption[] = [
  {
    key: 'showStatusBar',
    title: 'Show status bar',
    description: 'Display the saved-state strip at the bottom of Settings.',
  },
];

export function AppearanceSection() {
  const theme = useSettingsStore(state => state.theme);
  const setTheme = useSettingsStore(state => state.setTheme);
  const chrome = useSettingsStore(state => state.chrome);
  const setChromeToggle = useSettingsStore(state => state.setChromeToggle);

  const pluginThemesMap = usePluginStore(s => s.themes);
  const pluginThemeOptions: ThemeOption[] = useMemo(
    () => Array.from(pluginThemesMap.values(), pluginThemeToOption),
    [pluginThemesMap]
  );

  const handleThemeChange = useCallback(
    (newTheme: string) => {
      setTheme(newTheme);
    },
    [setTheme]
  );

  return (
    <div className="space-y-6">
      <SettingsCard
        icon={Eye}
        tone="blue"
        title="Preview"
        subtitle="Mini workspace shell tinted with the active theme."
      >
        <AppearancePreview />
      </SettingsCard>

      <SettingsCard
        icon={Palette}
        tone="orange"
        title="Themes"
        subtitle={`Choose how ${APP_NAME} looks. Click a swatch to apply.`}
      >
        <ThemeGrid themes={themeOptions} activeTheme={theme} onSelect={handleThemeChange} />

        {pluginThemeOptions.length > 0 && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] font-semibold">
                <Puzzle className="w-3 h-3" aria-hidden="true" />
                Plugin themes
                <span className="tabular-nums text-muted-foreground/60">
                  · {pluginThemeOptions.length}
                </span>
              </span>
              <span className="flex-1 h-px bg-border-glass" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {pluginThemeOptions.map(opt => (
                <ThemeSwatchCard
                  key={opt.value}
                  option={opt}
                  isActive={theme === opt.value}
                  onSelect={handleThemeChange}
                />
              ))}
            </div>
          </div>
        )}
      </SettingsCard>

      <CustomThemesCard />

      <BackgroundCard />

      <WindowEffectCard />

      <SettingsCard
        icon={LayoutGrid}
        tone="muted"
        title="Chrome"
        subtitle="Toggle structural elements of the workspace shell."
      >
        {CHROME_OPTIONS.map((opt, idx) => (
          <SettingsToggleRow
            key={opt.key}
            title={opt.title}
            description={opt.description}
            checked={chrome[opt.key]}
            onCheckedChange={value => setChromeToggle(opt.key, value)}
            divider={idx > 0}
          />
        ))}
      </SettingsCard>
    </div>
  );
}
