import { useState, useCallback } from 'react';
import { Palette, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { APP_NAME } from '@omniscribe/shared';
import type { Theme } from '@omniscribe/shared';
import { themeOptions, darkThemes, lightThemes } from '@/lib/theme';
import { useSettingsStore } from '@/stores';

type TabValue = 'dark' | 'light';

export function AppearanceSection() {
  const theme = useSettingsStore((state) => state.theme);
  const previewTheme = useSettingsStore((state) => state.previewTheme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setPreviewTheme = useSettingsStore((state) => state.setPreviewTheme);

  const effectiveTheme = previewTheme ?? theme;
  const currentTheme = themeOptions.find((t) => t.value === effectiveTheme);
  const [activeTab, setActiveTab] = useState<TabValue>(() => {
    return currentTheme?.isDark ? 'dark' : 'light';
  });

  const handleThemeChange = useCallback(
    (newTheme: Theme) => {
      setTheme(newTheme);
    },
    [setTheme]
  );

  const handlePreviewEnter = useCallback(
    (previewingTheme: Theme) => {
      setPreviewTheme(previewingTheme);
    },
    [setPreviewTheme]
  );

  const handlePreviewLeave = useCallback(() => {
    setPreviewTheme(null);
  }, [setPreviewTheme]);

  const themes = activeTab === 'dark' ? darkThemes : lightThemes;

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <div
          className={clsx(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            'bg-gradient-to-br from-primary/20 to-brand-600/10',
            'ring-1',
          )}
          style={{ '--tw-ring-color': 'color-mix(in oklch, var(--primary), transparent 80%)' } as React.CSSProperties}
        >
          <Palette className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Appearance</h2>
          <p className="text-sm text-muted-foreground">Customize how {APP_NAME} looks</p>
        </div>
      </div>

      {/* Theme Selection */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Theme</h3>

        {/* Dark/Light tabs */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            onClick={() => setActiveTab('dark')}
            className={clsx(
              'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200',
              activeTab === 'dark'
                ? 'bg-card shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Dark Themes
          </button>
          <button
            onClick={() => setActiveTab('light')}
            className={clsx(
              'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200',
              activeTab === 'light'
                ? 'bg-card shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Light Themes
          </button>
        </div>

        {/* Theme grid */}
        <div className="grid grid-cols-4 gap-2">
          {themes.map((themeOption) => {
            const Icon = themeOption.Icon;
            const isSelected = theme === themeOption.value;

            return (
              <button
                key={themeOption.value}
                onClick={() => handleThemeChange(themeOption.value)}
                onMouseEnter={() => handlePreviewEnter(themeOption.value)}
                onMouseLeave={handlePreviewLeave}
                data-testid={themeOption.testId}
                className={clsx(
                  'relative flex flex-col items-center gap-2 rounded-xl border p-4 transition-all duration-200',
                  isSelected
                    ? 'border-primary/50 bg-primary/10 ring-1 ring-primary/20'
                    : 'border-border hover:border-primary/30 hover:bg-muted/50',
                )}
              >
                {isSelected && (
                  <div className="absolute right-2 top-2">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                )}
                <Icon className="h-6 w-6" style={{ color: themeOption.color }} />
                <span className="text-xs font-medium text-foreground">
                  {themeOption.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
