import { Toaster as Sonner } from 'sonner';

import { getThemeOption } from '@/lib/theme';
import { useSettingsStore, selectEffectiveTheme } from '@/stores/useSettingsStore';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const effectiveTheme = useSettingsStore(selectEffectiveTheme);
  const isDark = getThemeOption(effectiveTheme)?.isDark ?? true;

  return (
    <Sonner
      theme={isDark ? 'dark' : 'light'}
      className="toaster group"
      position="bottom-right"
      style={
        {
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
