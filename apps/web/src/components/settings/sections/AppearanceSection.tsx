import { useState, useCallback, useMemo } from 'react';
import { Palette, Check, Puzzle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@omniscribe/shared';
import { SectionHeader } from '@/components/shared/SectionHeader';
import type { Theme } from '@omniscribe/shared';
import { themeOptions, darkThemes, lightThemes } from '@/lib/theme';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { usePluginStore } from '@/stores/usePluginStore';
import { getPluginTheme } from '@/stores/usePluginStore';
import type { ThemeRegistration } from '@omniscribe/plugin-api';

type TabValue = 'dark' | 'light';

/** Plugin theme option shape for rendering alongside built-in themes */
interface PluginThemeOption {
  id: string;
  label: string;
  isDark: boolean;
  color: string;
  icon?: ThemeRegistration['icon'];
  isPlugin: true;
}

export function AppearanceSection() {
  const theme = useSettingsStore(state => state.theme);
  const previewTheme = useSettingsStore(state => state.previewTheme);
  const setTheme = useSettingsStore(state => state.setTheme);
  const setPreviewTheme = useSettingsStore(state => state.setPreviewTheme);

  // Read plugin themes map (stable reference) and derive lists in useMemo
  const pluginThemesMap = usePluginStore(s => s.themes);

  // Split plugin themes into dark/light
  const { pluginDarkThemes, pluginLightThemes } = useMemo(() => {
    const dark: PluginThemeOption[] = [];
    const light: PluginThemeOption[] = [];

    for (const pt of pluginThemesMap.values()) {
      const option: PluginThemeOption = {
        id: pt.id,
        label: pt.label,
        isDark: pt.isDark,
        color: pt.color,
        icon: pt.icon,
        isPlugin: true,
      };
      if (pt.isDark) {
        dark.push(option);
      } else {
        light.push(option);
      }
    }

    return { pluginDarkThemes: dark, pluginLightThemes: light };
  }, [pluginThemesMap]);

  const effectiveTheme = previewTheme ?? theme;
  const currentTheme = themeOptions.find(t => t.value === effectiveTheme);
  const [activeTab, setActiveTab] = useState<TabValue>(() => {
    if (currentTheme) return currentTheme.isDark ? 'dark' : 'light';
    // Check if it's a plugin theme
    const pluginTheme = getPluginTheme(effectiveTheme);
    return pluginTheme?.isDark ? 'dark' : 'light';
  });

  const handleThemeChange = useCallback(
    (newTheme: string) => {
      // Cast to Theme -- plugin theme IDs are strings that work the same way
      // as built-in theme IDs (added as class to :root)
      setTheme(newTheme as Theme);
    },
    [setTheme]
  );

  const handlePreviewEnter = useCallback(
    (previewingTheme: string) => {
      setPreviewTheme(previewingTheme as Theme);
    },
    [setPreviewTheme]
  );

  const handlePreviewLeave = useCallback(() => {
    setPreviewTheme(null);
  }, [setPreviewTheme]);

  const builtinThemes = activeTab === 'dark' ? darkThemes : lightThemes;
  const pluginThemes = activeTab === 'dark' ? pluginDarkThemes : pluginLightThemes;

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Palette}
        title="Appearance"
        description={`Customize how ${APP_NAME} looks`}
      />

      {/* Theme Selection */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Theme</h3>

        {/* Dark/Light tabs */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            onClick={() => setActiveTab('dark')}
            className={cn(
              'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200',
              activeTab === 'dark'
                ? 'bg-card shadow-xs text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Dark Themes
          </button>
          <button
            onClick={() => setActiveTab('light')}
            className={cn(
              'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200',
              activeTab === 'light'
                ? 'bg-card shadow-xs text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Light Themes
          </button>
        </div>

        {/* Theme grid */}
        <div className="grid grid-cols-4 gap-2">
          {/* Built-in themes */}
          {builtinThemes.map(themeOption => {
            const Icon = themeOption.Icon;
            const isSelected = theme === themeOption.value;

            return (
              <button
                key={themeOption.value}
                onClick={() => handleThemeChange(themeOption.value)}
                onMouseEnter={() => handlePreviewEnter(themeOption.value)}
                onMouseLeave={handlePreviewLeave}
                data-testid={themeOption.testId}
                className={cn(
                  'relative flex flex-col items-center gap-2 rounded-xl border p-4 transition-all duration-200',
                  isSelected
                    ? 'border-primary/50 bg-primary/10 ring-1 ring-primary/20'
                    : 'border-border hover:border-primary/30 hover:bg-muted/50'
                )}
              >
                {isSelected && (
                  <div className="absolute right-2 top-2">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                )}
                <Icon className="h-6 w-6" style={{ color: themeOption.color }} />
                <span className="text-xs font-medium text-foreground">{themeOption.label}</span>
              </button>
            );
          })}

          {/* Plugin-contributed themes (rendered inline with built-in themes) */}
          {pluginThemes.map(pt => {
            const isSelected = theme === pt.id;

            return (
              <button
                key={pt.id}
                onClick={() => handleThemeChange(pt.id)}
                onMouseEnter={() => handlePreviewEnter(pt.id)}
                onMouseLeave={handlePreviewLeave}
                data-testid={`plugin-theme-${pt.id}`}
                className={cn(
                  'relative flex flex-col items-center gap-2 rounded-xl border p-4 transition-all duration-200',
                  isSelected
                    ? 'border-primary/50 bg-primary/10 ring-1 ring-primary/20'
                    : 'border-border hover:border-primary/30 hover:bg-muted/50'
                )}
              >
                {isSelected && (
                  <div className="absolute right-2 top-2">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                )}
                <Puzzle className="h-6 w-6" style={{ color: pt.color }} />
                <span className="text-xs font-medium text-foreground">{pt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
