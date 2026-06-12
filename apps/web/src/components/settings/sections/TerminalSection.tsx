import { TerminalSquare, RotateCcw, Eye } from 'lucide-react';
import { useTerminalStore, type CursorStyle } from '@/stores/useTerminalStore';
import { terminalThemes, type TerminalThemeName } from '@/lib/terminal-themes';
import { cn } from '@/lib/utils';
import {
  SettingsCard,
  SettingsRow,
  SettingsRowLabel,
  SettingsToggleRow,
} from '@/components/settings/SettingsCard';
import { ButtonGroup } from '@/components/shared/ButtonGroup';
import { TerminalPreview } from '@/components/settings/previews/TerminalPreview';

const CURSOR_STYLES: ReadonlyArray<{ value: CursorStyle; label: string }> = [
  { value: 'block', label: 'Block' },
  { value: 'underline', label: 'Underline' },
  { value: 'bar', label: 'Bar' },
];

export function TerminalSection() {
  const fontSize = useTerminalStore(s => s.fontSize);
  const cursorStyle = useTerminalStore(s => s.cursorStyle);
  const cursorBlink = useTerminalStore(s => s.cursorBlink);
  const scrollback = useTerminalStore(s => s.scrollback);
  const lineHeight = useTerminalStore(s => s.lineHeight);
  const themeName = useTerminalStore(s => s.terminalThemeName);

  const setFontSize = useTerminalStore(s => s.setFontSize);
  const setCursorStyle = useTerminalStore(s => s.setCursorStyle);
  const setCursorBlink = useTerminalStore(s => s.setCursorBlink);
  const setScrollback = useTerminalStore(s => s.setScrollback);
  const setLineHeight = useTerminalStore(s => s.setLineHeight);
  const setTerminalThemeName = useTerminalStore(s => s.setTerminalThemeName);
  const resetToDefaults = useTerminalStore(s => s.resetToDefaults);

  return (
    <div className="@container/settings space-y-4">
      <SettingsCard
        icon={Eye}
        tone="blue"
        title="Preview"
        subtitle="Live preview reflecting your current settings."
      >
        <TerminalPreview />
      </SettingsCard>

      <SettingsCard
        icon={TerminalSquare}
        tone="muted"
        title="Terminal"
        subtitle="Customize the terminal appearance and behavior."
      >
        <SettingsRow stacked>
          <SettingsRowLabel
            title={`Font size — ${fontSize}px`}
            description="Adjust the terminal font size."
          />
          <input
            id="terminal-font-size"
            type="range"
            min={8}
            max={24}
            value={fontSize}
            onChange={e => setFontSize(Number(e.target.value))}
            className="w-full accent-primary"
            aria-label="Terminal font size"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>8px</span>
            <span>24px</span>
          </div>
        </SettingsRow>

        <SettingsRow stacked divider>
          <SettingsRowLabel
            title={`Line height — ${lineHeight.toFixed(1)}`}
            description="Vertical spacing between rows."
          />
          <input
            id="terminal-line-height"
            type="range"
            min={1}
            max={2}
            step={0.1}
            value={lineHeight}
            onChange={e => setLineHeight(Number(e.target.value))}
            className="w-full accent-primary"
            aria-label="Terminal line height"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1.0</span>
            <span>2.0</span>
          </div>
        </SettingsRow>

        <SettingsRow divider>
          <SettingsRowLabel title="Cursor style" description="How the caret is drawn." />
          <ButtonGroup
            ariaLabel="Cursor style"
            value={cursorStyle}
            onChange={setCursorStyle}
            options={CURSOR_STYLES}
          />
        </SettingsRow>

        <SettingsToggleRow
          divider
          title="Cursor blink"
          description="Blink the caret while idle."
          checked={cursorBlink}
          onCheckedChange={setCursorBlink}
        />

        <SettingsRow stacked divider>
          <SettingsRowLabel
            title={`Scrollback — ${scrollback.toLocaleString()} lines`}
            description="Maximum lines retained in scrollback buffer."
          />
          <input
            id="terminal-scrollback"
            type="range"
            min={1000}
            max={100000}
            step={1000}
            value={scrollback}
            onChange={e => setScrollback(Number(e.target.value))}
            className="w-full accent-primary"
            aria-label="Terminal scrollback lines"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1,000</span>
            <span>100,000</span>
          </div>
        </SettingsRow>

        <SettingsRow stacked divider>
          <SettingsRowLabel
            title="Terminal theme"
            description="Pick a color scheme for terminal output."
          />
          <div
            role="radiogroup"
            aria-label="Terminal theme"
            className="grid grid-cols-2 @lg/settings:grid-cols-3 gap-2"
          >
            {(Object.keys(terminalThemes) as TerminalThemeName[]).map(key => {
              const theme = terminalThemes[key];
              const isSelected = themeName === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={theme.name}
                  onClick={() => setTerminalThemeName(key)}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded-md border text-sm transition-colors',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    isSelected
                      ? 'border-primary/35 bg-primary/15'
                      : 'border-border-glass bg-background/30 hover:bg-accent/40'
                  )}
                >
                  <div className="flex gap-0.5 shrink-0">
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: theme.background }}
                    />
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: theme.foreground }}
                    />
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: theme.blue as string }}
                    />
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: theme.green as string }}
                    />
                  </div>
                  <span className="text-foreground truncate text-xs">{theme.name}</span>
                </button>
              );
            })}
          </div>
        </SettingsRow>

        <SettingsRow divider>
          <SettingsRowLabel
            title="Reset to defaults"
            description="Restore terminal settings to their factory values."
          />
          <button
            type="button"
            onClick={resetToDefaults}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
              'border border-border-glass bg-background/30 text-muted-foreground',
              'hover:bg-accent/40 hover:text-foreground transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
            )}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}
