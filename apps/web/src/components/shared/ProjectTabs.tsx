import { useCallback, useState } from 'react';
import { X, Plus } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { StatusDot, type SessionStatus } from './StatusLegend';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface Tab {
  id: string;
  label: string;
  status?: SessionStatus;
}

interface ProjectTabsProps {
  tabs: Tab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
  onReorderTabs?: (activeId: string, overId: string) => void;
  closeTabShortcut: string;
}

function SortableTab({
  tab,
  isActive,
  onSelectTab,
  onCloseTab,
  closeTabShortcut,
}: {
  tab: Tab;
  isActive: boolean;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  closeTabShortcut: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="tab"
      tabIndex={isActive ? 0 : -1}
      aria-selected={isActive}
      className={cn(
        'no-drag group flex items-center gap-2 px-3 h-full min-w-0',
        'cursor-pointer transition-colors border-r border-border',
        isActive
          ? 'bg-card text-foreground'
          : 'text-foreground-secondary hover:bg-card/50 hover:text-foreground'
      )}
      onClick={() => onSelectTab(tab.id)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectTab(tab.id);
        }
      }}
    >
      {tab.status && <StatusDot status={tab.status} />}
      <span className="text-sm truncate max-w-32">{tab.label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={e => {
              e.stopPropagation();
              onCloseTab(tab.id);
            }}
            className="p-0.5 h-auto w-auto opacity-0 group-hover:opacity-100"
            aria-label={`Close ${tab.label}`}
          >
            <X size={14} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Close tab
          <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-white/10 rounded">
            {closeTabShortcut}
          </kbd>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export function ProjectTabs({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onReorderTabs,
  closeTabShortcut,
}: ProjectTabsProps) {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      onReorderTabs?.(String(active.id), String(over.id));
    },
    [onReorderTabs]
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
  }, []);

  const draggedTab = activeDragId ? tabs.find(t => t.id === activeDragId) : null;

  return (
    <div className="flex items-center overflow-x-auto no-scrollbar shrink min-w-0" role="tablist">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={tabs.map(t => t.id)} strategy={horizontalListSortingStrategy}>
          {tabs.map(tab => (
            <SortableTab
              key={tab.id}
              tab={tab}
              isActive={activeTabId === tab.id}
              onSelectTab={onSelectTab}
              onCloseTab={onCloseTab}
              closeTabShortcut={closeTabShortcut}
            />
          ))}
        </SortableContext>

        <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
          {draggedTab ? (
            <div
              className={cn(
                'no-drag flex items-center gap-2 px-3 h-9 min-w-0',
                'bg-card text-foreground border border-border rounded shadow-lg'
              )}
            >
              {draggedTab.status && <StatusDot status={draggedTab.status} />}
              <span className="text-sm truncate max-w-32">{draggedTab.label}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            data-testid="new-tab-button"
            onClick={onNewTab}
            className="no-drag px-3 h-full"
            aria-label="New tab"
          >
            <Plus size={16} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">New tab</TooltipContent>
      </Tooltip>
    </div>
  );
}
