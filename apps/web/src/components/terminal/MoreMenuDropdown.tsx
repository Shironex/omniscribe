import { clsx } from 'clsx';
import { MoreVertical, Settings, X } from 'lucide-react';

interface MoreMenuDropdownProps {
  isOpen: boolean;
  onToggle: () => void;
  onSettingsClick?: () => void;
  onClose: () => void;
}

export function MoreMenuDropdown({
  isOpen,
  onToggle,
  onSettingsClick,
  onClose,
}: MoreMenuDropdownProps) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className={clsx(
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
