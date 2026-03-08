import { cn } from '@/lib/utils';
import { MoreVertical, Settings, X, SquareArrowOutUpRight, GitCompareArrows } from 'lucide-react';
import { ExtensionSlot } from '@/components/plugin/ExtensionSlot';

interface MoreMenuDropdownProps {
  isOpen: boolean;
  aiMode?: string;
  sessionId?: string;
  onToggle: () => void;
  onSettingsClick?: () => void;
  onOpenInEditor?: () => void;
  onViewChanges?: () => void;
  onClose: () => void;
}

export function MoreMenuDropdown({
  isOpen,
  aiMode,
  sessionId,
  onToggle,
  onSettingsClick,
  onOpenInEditor,
  onViewChanges,
  onClose,
}: MoreMenuDropdownProps) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'p-1 rounded',
          'text-muted-foreground hover:text-foreground',
          'hover:bg-card transition-colors',
          isOpen && 'bg-card text-foreground'
        )}
        aria-label="More options"
      >
        <MoreVertical size={12} />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[120px] bg-popover border border-border rounded-md shadow-lg py-1">
          {onSettingsClick && (
            <button
              type="button"
              onClick={() => {
                onSettingsClick();
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors flex items-center gap-2"
            >
              <Settings size={11} />
              Settings
            </button>
          )}
          {onOpenInEditor && (
            <button
              type="button"
              onClick={() => {
                onOpenInEditor();
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors flex items-center gap-2"
            >
              <SquareArrowOutUpRight size={11} />
              Open in Editor
            </button>
          )}
          {onViewChanges && (
            <button
              type="button"
              onClick={() => {
                onViewChanges();
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors flex items-center gap-2"
            >
              <GitCompareArrows size={11} />
              View Changes
            </button>
          )}

          {/* Plugin-contributed more menu items */}
          <ExtensionSlot name="more-menu" aiMode={aiMode} context={{ sessionId }} />

          <button
            type="button"
            onClick={onClose}
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-400/10 transition-colors flex items-center gap-2"
          >
            <X size={11} />
            Kill Session
          </button>
        </div>
      )}
    </>
  );
}
