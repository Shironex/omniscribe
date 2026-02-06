import { useTerminalStore, type CursorStyle } from '@/stores/useTerminalStore';
import { terminalThemes, type TerminalThemeName } from '@/lib/terminal-themes';

const CURSOR_STYLES: { value: CursorStyle; label: string }[] = [
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
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Terminal</h2>
        <p className="text-sm text-muted-foreground">
          Customize the terminal appearance and behavior.
        </p>
      </div>

      {/* Font Size */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Font Size: {fontSize}px</label>
        <input
          type="range"
          min={8}
          max={24}
          value={fontSize}
          onChange={e => setFontSize(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>8px</span>
          <span>24px</span>
        </div>
      </div>

      {/* Line Height */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Line Height: {lineHeight.toFixed(1)}
        </label>
        <input
          type="range"
          min={1}
          max={2}
          step={0.1}
          value={lineHeight}
          onChange={e => setLineHeight(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>1.0</span>
          <span>2.0</span>
        </div>
      </div>

      {/* Cursor Style */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Cursor Style</label>
        <div className="flex gap-2">
          {CURSOR_STYLES.map(opt => (
            <button
              key={opt.value}
              onClick={() => setCursorStyle(opt.value)}
              className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                cursorStyle === opt.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-foreground hover:bg-muted'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cursor Blink */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">Cursor Blink</label>
        <button
          role="switch"
          aria-checked={cursorBlink}
          onClick={() => setCursorBlink(!cursorBlink)}
          className={`relative w-10 h-5 rounded-full transition-colors ${
            cursorBlink ? 'bg-primary' : 'bg-muted-foreground/30'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              cursorBlink ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>

      {/* Scrollback */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Scrollback: {scrollback.toLocaleString()} lines
        </label>
        <input
          type="range"
          min={1000}
          max={100000}
          step={1000}
          value={scrollback}
          onChange={e => setScrollback(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>1,000</span>
          <span>100,000</span>
        </div>
      </div>

      {/* Terminal Theme */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">Terminal Theme</label>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(terminalThemes) as TerminalThemeName[]).map(key => {
            const theme = terminalThemes[key];
            const isSelected = themeName === key;
            return (
              <button
                key={key}
                onClick={() => setTerminalThemeName(key)}
                className={`flex items-center gap-2 p-2 rounded-md border text-sm transition-colors ${
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card hover:bg-muted'
                }`}
              >
                <div className="flex gap-0.5">
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
      </div>

      {/* Reset */}
      <button
        onClick={resetToDefaults}
        className="px-4 py-2 text-sm rounded-md border border-border bg-card text-foreground hover:bg-muted transition-colors"
      >
        Reset to Defaults
      </button>
    </div>
  );
}
