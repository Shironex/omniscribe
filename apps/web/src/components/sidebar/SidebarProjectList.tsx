import { useCallback, useState } from 'react';
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
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SidebarProjectItem } from './SidebarProjectItem';
import { StatusDot } from '@/components/shared/StatusLegend';
import type { Tab } from '@/hooks/useWorkspaceTabs';
import { cn } from '@/lib/utils';

interface SidebarProjectListProps {
  tabs: Tab[];
  activeTabId: string | null;
  collapsed: boolean;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onReorderTabs?: (activeId: string, overId: string) => void;
}

export function SidebarProjectList({
  tabs,
  activeTabId,
  collapsed,
  onSelectTab,
  onCloseTab,
  onReorderTabs,
}: SidebarProjectListProps) {
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
    <div
      data-testid="project-tabs"
      className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-1 no-scrollbar"
    >
      {tabs.length === 0 ? (
        <div className="px-3 py-4 text-center">
          <p className="text-xs text-muted-foreground">No projects open</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={tabs.map(t => t.id)} strategy={verticalListSortingStrategy}>
            {tabs.map(tab => (
              <SidebarProjectItem
                key={tab.id}
                id={tab.id}
                label={tab.label}
                projectPath={tab.projectPath}
                status={tab.status}
                isActive={activeTabId === tab.id}
                collapsed={collapsed}
                onSelect={onSelectTab}
                onClose={onCloseTab}
              />
            ))}
          </SortableContext>

          <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
            {draggedTab ? (
              <div
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5',
                  'bg-card text-foreground border border-border rounded-lg shadow-lg',
                  collapsed ? 'w-10 justify-center' : ''
                )}
              >
                {draggedTab.status && <StatusDot status={draggedTab.status} />}
                {!collapsed && <span className="text-sm truncate">{draggedTab.label}</span>}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
