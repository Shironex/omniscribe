import { Toaster as Sonner } from 'sonner';

import { getThemeOption } from '@/lib/theme';
import { useSettingsStore, selectEffectiveTheme } from '@/stores/useSettingsStore';
import { usePluginStore } from '@/stores/usePluginStore';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const effectiveTheme = useSettingsStore(selectEffectiveTheme);
  const themeOption = getThemeOption(effectiveTheme);
  // Subscribe to plugin themes for reactivity when plugins register/unregister themes
  const pluginThemes = usePluginStore(s => s.themes);

  // Check built-in themes first, then plugin themes, default to dark
  const pluginTheme = Array.from(pluginThemes.values()).find(t => t.id === effectiveTheme);
  const isDark = themeOption?.isDark ?? pluginTheme?.isDark ?? true;

  return (
    <Sonner
      theme={isDark ? 'dark' : 'light'}
      className="toaster group"
      position="bottom-right"
      style={
        {
          // Remap Sonner's internal CSS vars to our theme vars
          '--normal-bg': 'var(--background)',
          '--normal-border': 'var(--border)',
          '--normal-text': 'var(--foreground)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
