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
                  onClick={handleClick}
                  className="no-drag relative w-8 h-8 mx-auto cursor-pointer"
                >
                  <div
                    className={cn(
                      'flex items-center justify-center w-full h-full rounded-lg',
                      'transition-all duration-100',
                      thumbnailUrl
                        ? cn(
                            'overflow-hidden ring-1.5 ring-offset-1 ring-offset-background',
                            isActive
                              ? 'ring-primary'
                              : 'ring-transparent hover:ring-muted-foreground/30'
                          )
                        : isActive
                          ? 'bg-primary/15 text-primary'
                          : 'text-foreground-secondary hover:bg-muted-foreground/10 hover:text-foreground'
                    )}
                  >
                    {renderAvatar('sm')}
                  </div>
                  {status && (
                    <StatusDot
                      status={status}
                      className="absolute -top-0.5 -right-0.5 w-2 h-2 ring-1 ring-background"
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
            onClick={handleClick}
            className={cn(
              'no-drag group flex items-center gap-2 px-2 py-1.5 mx-1 rounded-lg cursor-pointer',
              'transition-colors duration-100 relative',
              isActive
                ? 'bg-primary/10 text-foreground'
                : 'text-foreground-secondary hover:bg-muted-foreground/10 hover:text-foreground'
            )}
          >
            {/* Active indicator bar */}
            {isActive && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-primary" />
            )}

            {thumbnailUrl && renderAvatar('md')}
            {status && <StatusDot status={status} className="shrink-0" />}

            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm truncate flex-1">{label}</span>
              </TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="p-0 h-auto w-auto opacity-0 group-hover:opacity-100 shrink-0 transition-opacity duration-100"
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
