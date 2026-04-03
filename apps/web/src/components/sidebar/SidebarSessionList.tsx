import { AnimatePresence, motion } from 'motion/react';
import { SidebarSessionItem } from './SidebarSessionItem';
import type { SessionStatus } from '@/components/shared/StatusLegend';

interface SessionInfo {
  id: string;
  name: string;
  status: SessionStatus;
}

interface SidebarSessionListProps {
  sessions: SessionInfo[];
  isExpanded: boolean;
  collapsed: boolean;
}

export function SidebarSessionList({ sessions, isExpanded, collapsed }: SidebarSessionListProps) {
  if (collapsed || sessions.length === 0) return null;

  return (
    <AnimatePresence initial={false}>
      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
          className="overflow-hidden"
        >
          <div className="py-0.5">
            {sessions.map(session => (
              <SidebarSessionItem
                key={session.id}
                name={session.name}
                status={session.status}
                collapsed={collapsed}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
