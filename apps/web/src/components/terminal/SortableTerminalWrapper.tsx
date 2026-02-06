import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableTerminalWrapperProps {
  id: string;
  children: React.ReactNode;
}

export function SortableTerminalWrapper({ id, children }: SortableTerminalWrapperProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {/* Drag handle on the header - listeners applied via context */}
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          return React.cloneElement(
            child as React.ReactElement<{ dragListeners?: Record<string, unknown> }>,
            {
              dragListeners: listeners,
            }
          );
        }
        return child;
      })}
    </div>
  );
}
