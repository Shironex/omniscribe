import { cn } from '@/lib/utils';

/**
 * Skeleton fallback rendered inside SettingsModalShell while the
 * SettingsModal content chunk loads. Shows pulsing placeholders
 * for the navigation sidebar and content panel.
 *
 * Intentionally lightweight — only cn() from utils.
 */

function PulseBar({ className }: { className?: string }) {
  return <div className={cn('rounded-md bg-muted-foreground/10 animate-pulse', className)} />;
}

function NavGroupSkeleton({ items }: { items: number }) {
  return (
    <div className="space-y-1">
      <PulseBar className="h-3 w-20 mx-3 my-2" />
      {Array.from({ length: items }).map((_, i) => (
        <PulseBar key={i} className="h-9 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function SettingsModalSkeleton() {
  return (
    <>
      {/* Sidebar nav skeleton */}
      <div className="w-56 shrink-0 border-r border-border/50 bg-muted/95 p-4 space-y-4">
        <NavGroupSkeleton items={3} />
        <NavGroupSkeleton items={3} />
        <NavGroupSkeleton items={3} />
      </div>

      {/* Content panel skeleton */}
      <div className="flex-1 p-8 space-y-6">
        <div className="max-w-2xl space-y-6">
          {/* Section title */}
          <PulseBar className="h-7 w-40" />

          {/* Description */}
          <PulseBar className="h-4 w-72" />

          {/* Setting rows */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <PulseBar className="h-4 w-32" />
              <PulseBar className="h-8 w-20 rounded-lg" />
            </div>
            <div className="flex items-center justify-between">
              <PulseBar className="h-4 w-44" />
              <PulseBar className="h-8 w-20 rounded-lg" />
            </div>
            <div className="flex items-center justify-between">
              <PulseBar className="h-4 w-36" />
              <PulseBar className="h-8 w-20 rounded-lg" />
            </div>
          </div>

          {/* Card block */}
          <PulseBar className="h-28 w-full rounded-xl" />

          {/* More rows */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <PulseBar className="h-4 w-48" />
              <PulseBar className="h-8 w-24 rounded-lg" />
            </div>
            <div className="flex items-center justify-between">
              <PulseBar className="h-4 w-28" />
              <PulseBar className="h-8 w-16 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
