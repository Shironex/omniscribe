import React, { useCallback } from 'react';
import { X, ImagePlus, ImageOff } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { StatusDot, type SessionStatus } from '@/components/shared/StatusLegend';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { cn } from '@/lib/utils';
import { createLogger, extractErrorMessage } from '@omniscribe/shared';
import { toast } from 'sonner';

const logger = createLogger('SidebarProjectItem');

interface SidebarProjectItemProps {
  id: string;
  label: string;
  projectPath: string;
  status?: SessionStatus;
  isActive: boolean;
  collapsed: boolean;
  thumbnailUrl?: string;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
}

export const SidebarProjectItem = React.memo(function SidebarProjectItem({
  id,
  label,
  status,
  isActive,
  collapsed,
  thumbnailUrl,
  onSelect,
  onClose,
}: SidebarProjectItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const handleClick = useCallback(() => {
    onSelect(id);
  }, [id, onSelect]);

  // The sidebar uses a PointerSensor only (no KeyboardSensor), so these tab divs
  // need their own keyboard activation to be reachable without a mouse.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(id);
      }
    },
    [id, onSelect]
  );

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClose(id);
    },
    [id, onClose]
  );

  const updateTabThumbnail = useWorkspaceStore(state => state.updateTabThumbnail);

  const handleSetThumbnail = useCallback(async () => {
    if (!window.electronAPI?.dialog || !window.electronAPI?.thumbnail) return;
    try {
      const imagePath = await window.electronAPI.dialog.openFile({
        title: 'Select Project Icon',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
      });
      if (!imagePath) return;

      const result = await window.electronAPI.thumbnail.set(id, imagePath);
      if (result?.fileName) {
        updateTabThumbnail(id, result.fileName);
      }
    } catch (error) {
      logger.error('Failed to set thumbnail:', error);
      toast.error(extractErrorMessage(error, 'Failed to set project icon'));
    }
  }, [id, updateTabThumbnail]);

  const handleRemoveThumbnail = useCallback(async () => {
    if (!window.electronAPI?.thumbnail) return;
    // Find current thumbnail from the store
    const tab = useWorkspaceStore.getState().tabs.find(t => t.id === id);
    if (tab?.thumbnailFileName) {
      try {
        await window.electronAPI.thumbnail.remove(id, tab.thumbnailFileName);
      } catch (error) {
        logger.debug('Failed to remove thumbnail file:', error);
      }
    }
    updateTabThumbnail(id, null);
  }, [id, updateTabThumbnail]);

  const initial = label.charAt(0).toUpperCase();

  /** Renders the project avatar: thumbnail image or fallback letter */
  const renderAvatar = (size: 'sm' | 'md') => {
    const sizeClasses = size === 'sm' ? 'w-8 h-8' : 'w-5 h-5';
    if (thumbnailUrl) {
      return (
        <img
          src={thumbnailUrl}
          alt={label}
          className={cn(sizeClasses, 'rounded-md object-contain')}
          draggable={false}
        />
      );
    }
    if (size === 'sm') {
      return <span className="text-xs font-semibold">{initial}</span>;
    }
    return null;
  };

  if (collapsed) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  ref={setNodeRef}
                  style={style}
                  {...attributes}
                  {...listeners}
                  role="tab"
                  aria-selected={isActive}
                  tabIndex={isActive ? 0 : -1}
                  onClick={handleClick}
                  onKeyDown={handleKeyDown}
                  aria-label={label}
                  className="no-drag relative w-8 h-8 mx-auto cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar"
                >
                  <div
                    className={cn(
                      'flex items-center justify-center w-full h-full rounded-lg',
                      'transition-[background-color,box-shadow,color] duration-150 ease-out',
                      thumbnailUrl
                        ? cn(
                            'overflow-hidden ring-2 ring-offset-2 ring-offset-sidebar',
                            isActive
                              ? 'ring-primary'
                              : 'ring-transparent hover:ring-muted-foreground/30'
                          )
                        : isActive
                          ? 'bg-sidebar-accent text-primary ring-1 ring-primary/60'
                          : 'text-foreground-secondary hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    )}
                  >
                    {renderAvatar('sm')}
                  </div>
                  {status && (
                    <StatusDot
                      status={status}
                      className="absolute -top-0.5 -right-0.5 w-2 h-2 ring-2 ring-sidebar"
                    />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-[12rem]">
          <ContextMenuItem onClick={handleSetThumbnail}>
            <ImagePlus size={14} className="mr-2" />
            Set Project Icon...
          </ContextMenuItem>
          {thumbnailUrl && (
            <ContextMenuItem onClick={handleRemoveThumbnail}>
              <ImageOff size={14} className="mr-2" />
              Remove Project Icon
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => onClose(id)}
            className="text-destructive focus:text-destructive"
          >
            <X size={14} className="mr-2" />
            Close Project
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
          <div
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className={cn(
              'no-drag group flex items-center gap-2 px-2 py-1.5 mx-1 rounded-lg cursor-pointer',
              'transition-colors duration-150 ease-out relative',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-foreground-secondary hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
          >
            {/* Active indicator rail */}
            {isActive && (
              <span
                aria-hidden
                className="absolute -left-1 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary"
              />
            )}

            {thumbnailUrl && renderAvatar('md')}
            {status && <StatusDot status={status} className="shrink-0" />}

            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'text-sm truncate flex-1',
                    isActive ? 'font-medium' : 'font-normal'
                  )}
                >
                  {label}
                </span>
              </TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="shrink-0 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:bg-sidebar-accent rounded transition-opacity duration-150 ease-out"
              aria-label={`Close ${label}`}
            >
              <X size={14} />
            </Button>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[12rem]">
        <ContextMenuItem onClick={handleSetThumbnail}>
          <ImagePlus size={14} className="mr-2" />
          Set Project Icon...
        </ContextMenuItem>
        {thumbnailUrl && (
          <ContextMenuItem onClick={handleRemoveThumbnail}>
            <ImageOff size={14} className="mr-2" />
            Remove Project Icon
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => onClose(id)}
          className="text-destructive focus:text-destructive"
        >
          <X size={14} className="mr-2" />
          Close Project
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
