import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { HTMLAttributes } from 'react';

export interface TerminalDragHandleProps {
  setNodeRef: (element: HTMLElement | null) => void;
  attributes: HTMLAttributes<HTMLElement>;
  listeners: HTMLAttributes<HTMLElement>;
}

interface SortableTerminalWrapperProps {
  id: string;
  children: React.ReactNode;
}

export function SortableTerminalWrapper({ id, children }: SortableTerminalWrapperProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    zIndex: isDragging ? 10 : undefined,
  };

  const dragHandleProps: TerminalDragHandleProps = {
    setNodeRef: setActivatorNodeRef,
    attributes: attributes as HTMLAttributes<HTMLElement>,
    listeners: listeners as HTMLAttributes<HTMLElement>,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {React.Children.map(children, child => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(
          child as React.ReactElement<{ dragHandleProps?: TerminalDragHandleProps }>,
          {
            dragHandleProps,
          }
        );
      })}
    </div>
  );
}
