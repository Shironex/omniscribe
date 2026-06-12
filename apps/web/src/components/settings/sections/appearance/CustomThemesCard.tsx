import { useCallback, useMemo, useRef, useState } from 'react';
import { Brush, Upload, Download, Trash2, FileJson } from 'lucide-react';
import { toast } from 'sonner';
import { createLogger } from '@omniscribe/shared';
import { cn } from '@/lib/utils';
import { customThemeToOption } from '@/lib/theme';
import { ThemeSwatchCard } from '@/components/shared/theme/ThemeSwatchCard';
import { SettingsCard } from '@/components/settings/SettingsCard';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/stores/useSettingsStore';
import {
  useCustomThemesStore,
  selectCustomThemes,
  downloadCustomTheme,
  MAX_CUSTOM_THEMES,
} from '@/lib/customThemes/store';
import { buildStarterTheme } from '@/lib/customThemes/probe';
import { customThemeId, type CustomTheme } from '@/lib/customThemes/schema';

const logger = createLogger('CustomThemesCard');

/** Max import file size — a theme JSON is tiny; reject anything suspicious. */
const MAX_IMPORT_BYTES = 256 * 1024;

/**
 * "Custom themes" card — import / apply / export / delete user-authored themes.
 *
 * Custom themes render in the same swatch grid as built-ins, but each tile is
 * wrapped with hover-revealed export + delete actions. Importing reads a `.json`
 * file, validates it via the custom-theme schema, and surfaces errors through a
 * toast. The "Start from current theme" button exports the *resolved* tokens of
 * the active theme as an editable starting point.
 */
export function CustomThemesCard() {
  const activeTheme = useSettingsStore(state => state.theme);
  const setTheme = useSettingsStore(state => state.setTheme);

  const customThemes = useCustomThemesStore(selectCustomThemes);
  const addFromObject = useCustomThemesStore(state => state.addFromObject);
  const removeTheme = useCustomThemesStore(state => state.removeTheme);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<CustomTheme | null>(null);

  const options = useMemo(() => customThemes.map(customThemeToOption), [customThemes]);
  const atCap = customThemes.length >= MAX_CUSTOM_THEMES;

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset so re-picking the same file fires onChange again.
      event.target.value = '';
      if (!file) return;

      if (file.size > MAX_IMPORT_BYTES) {
        toast.error('Theme file is too large.');
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        toast.error('Could not parse theme file — invalid JSON.');
        return;
      }

      const result = addFromObject(parsed);
      if (!result.ok) {
        // Surface the first few errors; collapse the rest to keep the toast readable.
        const shown = result.errors.slice(0, 3).join(' ');
        const more = result.errors.length > 3 ? ` (+${result.errors.length - 3} more)` : '';
        toast.error(`Theme import failed: ${shown}${more}`);
        return;
      }

      toast.success('Custom theme imported.');
    },
    [addFromObject]
  );

  const handleStarter = useCallback(() => {
    const stamp = Date.now().toString(36);
    const starter = buildStarterTheme(`my-theme-${stamp}`, 'My Theme');
    downloadCustomTheme(starter);
    toast.success('Starter theme downloaded — edit it, then import it back.');
  }, []);

  const handleExport = useCallback((theme: CustomTheme) => {
    downloadCustomTheme(theme);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    const removedRuntimeId = customThemeId(pendingDelete.id);
    removeTheme(pendingDelete.id);
    // If the deleted theme was active, fall back to the default built-in theme.
    if (activeTheme === removedRuntimeId) {
      setTheme('forge');
    }
    logger.debug('deleted custom theme', pendingDelete.id);
    setPendingDelete(null);
    toast.success('Custom theme deleted.');
  }, [pendingDelete, removeTheme, activeTheme, setTheme]);

  return (
    <SettingsCard
      icon={Brush}
      tone="primary"
      title="Custom themes"
      subtitle="Import your own palettes as JSON. They cascade over a dark or light base."
      headerAccessory={
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
          {customThemes.length}/{MAX_CUSTOM_THEMES}
        </span>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
      />

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleImportClick}
          disabled={atCap}
        >
          <Upload className="w-3.5 h-3.5" />
          Import JSON…
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={handleStarter}>
          <FileJson className="w-3.5 h-3.5" />
          Start from current theme
        </Button>
        {atCap && (
          <span className="text-[11px] text-muted-foreground/80">
            Limit reached — delete a theme to import more.
          </span>
        )}
      </div>

      {/* Theme grid (or empty hint) */}
      {options.length === 0 ? (
        <p className="text-[12px] text-muted-foreground/85 leading-snug pt-1">
          No custom themes yet. Download a starter, tweak its colors, then import it back here.
        </p>
      ) : (
        <div className="grid grid-cols-2 @md/settings:grid-cols-3 @2xl/settings:grid-cols-4 gap-3 pt-1">
          {options.map((opt, idx) => {
            const theme = customThemes[idx];
            return (
              <div key={opt.value} className="group/cell relative">
                <ThemeSwatchCard
                  option={opt}
                  isActive={activeTheme === opt.value}
                  onSelect={setTheme}
                />
                {/* Hover-revealed per-theme actions */}
                <div
                  className={cn(
                    'absolute top-2 right-2 flex items-center gap-1',
                    'opacity-0 group-hover/cell:opacity-100 focus-within:opacity-100 transition-opacity'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleExport(theme)}
                    aria-label={`Export ${theme.label}`}
                    title="Export theme"
                    className={cn(
                      'grid place-items-center size-6 rounded-md border border-border-glass',
                      'bg-background/70 backdrop-blur-sm text-muted-foreground',
                      'hover:text-foreground hover:bg-background',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    )}
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(theme)}
                    aria-label={`Delete ${theme.label}`}
                    title="Delete theme"
                    className={cn(
                      'grid place-items-center size-6 rounded-md border border-destructive/30',
                      'bg-background/70 backdrop-blur-sm text-destructive',
                      'hover:bg-destructive/15',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    )}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog open={pendingDelete !== null} onOpenChange={open => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete custom theme</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `“${pendingDelete.label}” will be removed. If it's the active theme, the app falls back to Forge.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmDelete}>
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}
