import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';

/**
 * Eagerly-loaded shell for the settings modal.
 * Renders the Dialog, overlay, header, and layout frame immediately
 * so the entrance animation plays once. The lazy-loaded content
 * (nav + sections) is passed as children via Suspense.
 */

interface SettingsModalShellProps {
  children: ReactNode;
}

export function SettingsModalShell({ children }: SettingsModalShellProps) {
  const isOpen = useSettingsStore(state => state.isOpen);
  const closeSettings = useSettingsStore(state => state.closeSettings);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={open => {
        if (!open) closeSettings();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="bg-black/60 backdrop-blur-xs" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]',
            'w-full max-w-4xl max-h-[85vh] mx-4',
            'bg-background rounded-2xl shadow-2xl',
            'border border-border',
            'flex flex-col overflow-hidden',
            'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <DialogTitle className="text-xl font-semibold text-foreground">Settings</DialogTitle>
            <DialogPrimitive.Close
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close settings"
            >
              <X className="w-5 h-5" />
            </DialogPrimitive.Close>
          </div>

          {/* Content area — Suspense fallback and lazy content render here */}
          <div className="flex-1 flex overflow-hidden">{children}</div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
