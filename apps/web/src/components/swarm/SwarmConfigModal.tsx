import { useState, useCallback, useEffect, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, Plus, Minus, Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { useSwarmStore } from '@/stores/useSwarmStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import type { SwarmRole, SwarmRoleConfig, SwarmTemplate } from '@omniscribe/shared';

/** Built-in templates for v1 */
const BUILT_IN_TEMPLATES: SwarmTemplate[] = [
  {
    id: 'feature-dev',
    name: 'Feature Development',
    description: 'Lead architect with builder and tester workers for new feature development.',
    roles: [
      { role: 'lead', count: 1 },
      { role: 'architect', count: 1 },
      { role: 'builder', count: 2 },
      { role: 'tester', count: 1 },
    ],
    isBuiltIn: true,
  },
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Lead reviewer with security and quality reviewers for thorough code review.',
    roles: [
      { role: 'lead', count: 1 },
      { role: 'reviewer', count: 2 },
      { role: 'security', count: 1 },
    ],
    isBuiltIn: true,
  },
  {
    id: 'refactoring',
    name: 'Refactoring',
    description: 'Lead architect with builders focused on systematic codebase refactoring.',
    roles: [
      { role: 'lead', count: 1 },
      { role: 'architect', count: 1 },
      { role: 'builder', count: 3 },
    ],
    isBuiltIn: true,
  },
];

/** All available roles */
const ALL_ROLES: { role: SwarmRole; label: string; color: string }[] = [
  { role: 'lead', label: 'Lead', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { role: 'builder', label: 'Builder', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  {
    role: 'reviewer',
    label: 'Reviewer',
    color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  },
  {
    role: 'architect',
    label: 'Architect',
    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
  { role: 'tester', label: 'Tester', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  { role: 'security', label: 'Security', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
];

interface SwarmConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SwarmConfigModal({ open, onOpenChange }: SwarmConfigModalProps) {
  const createSwarm = useSwarmStore(state => state.createSwarm);
  const activeProjectPath = useWorkspaceStore(state => {
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    return activeTab?.projectPath ?? null;
  });

  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(BUILT_IN_TEMPLATES[0].id);
  const [roles, setRoles] = useState<SwarmRoleConfig[]>(BUILT_IN_TEMPLATES[0].roles);

  const prevOpenRef = useRef(false);

  // Reset state when the modal opens
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setName('');
      setGoal('');
      setSelectedTemplateId(BUILT_IN_TEMPLATES[0].id);
      setRoles(BUILT_IN_TEMPLATES[0].roles);
    }
    prevOpenRef.current = open;
  }, [open]);

  const handleSelectTemplate = useCallback((template: SwarmTemplate) => {
    setSelectedTemplateId(template.id);
    setRoles(template.roles.map(r => ({ ...r })));
  }, []);

  const handleRoleCountChange = useCallback((role: SwarmRole, delta: number) => {
    setRoles(prev => {
      const existing = prev.find(r => r.role === role);
      if (existing) {
        const newCount = Math.max(0, existing.count + delta);
        if (newCount === 0) {
          // Cannot remove lead role
          if (role === 'lead') return prev;
          return prev.filter(r => r.role !== role);
        }
        // Lead can only have count 1
        if (role === 'lead') return prev;
        return prev.map(r => (r.role === role ? { ...r, count: Math.min(newCount, 6) } : r));
      } else if (delta > 0) {
        return [...prev, { role, count: 1 }];
      }
      return prev;
    });
    // Clear template selection when manually editing
    setSelectedTemplateId('');
  }, []);

  const totalAgents = roles.reduce((sum, r) => sum + r.count, 0);
  const hasLead = roles.some(r => r.role === 'lead' && r.count > 0);
  const canStart = name.trim().length > 0 && goal.trim().length > 0 && hasLead && activeProjectPath;

  const handleStart = useCallback(() => {
    if (!canStart || !activeProjectPath) return;
    createSwarm({
      name: name.trim(),
      goal: goal.trim(),
      projectPath: activeProjectPath,
      roles,
    });
    onOpenChange(false);
  }, [canStart, activeProjectPath, createSwarm, name, goal, roles, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/60 backdrop-blur-xs" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]',
            'w-full max-w-xl mx-4',
            'bg-background rounded-2xl shadow-2xl',
            'border border-border',
            'flex flex-col max-h-[85vh]',
            'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
            'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-2">
            <div className="flex items-center gap-2">
              <Network size={20} className="text-primary" />
              <div>
                <DialogTitle className="text-lg font-semibold text-foreground">
                  Create Team Swarm
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Configure agents to work on a shared goal
                </p>
              </div>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="w-4 h-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          {/* Content (scrollable) */}
          <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Swarm Name</label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Auth Feature Sprint"
                className="h-9"
              />
            </div>

            {/* Goal */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Goal</label>
              <textarea
                value={goal}
                onChange={e => setGoal(e.target.value)}
                placeholder="Describe what the swarm should accomplish..."
                rows={3}
                className={cn(
                  'flex w-full rounded-md border border-input bg-transparent px-3 py-2',
                  'text-sm shadow-sm placeholder:text-muted-foreground',
                  'focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring',
                  'resize-none'
                )}
              />
            </div>

            <Separator />

            {/* Template selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Template</label>
              <div className="grid grid-cols-3 gap-2">
                {BUILT_IN_TEMPLATES.map(template => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template)}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-all cursor-pointer',
                      'hover:border-primary/50 hover:bg-primary/5',
                      selectedTemplateId === template.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-card'
                    )}
                  >
                    <p className="text-xs font-medium text-foreground">{template.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                      {template.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Role configurator */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Roles</label>
                <span className="text-xs text-muted-foreground">{totalAgents} agents total</span>
              </div>
              <div className="space-y-1.5">
                {ALL_ROLES.map(({ role, label, color }) => {
                  const config = roles.find(r => r.role === role);
                  const count = config?.count ?? 0;
                  const isLead = role === 'lead';

                  return (
                    <div
                      key={role}
                      className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] px-1.5 py-0 h-5', color)}
                        >
                          {label}
                        </Badge>
                        {isLead && (
                          <span className="text-[10px] text-muted-foreground">(required)</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="icon"
                          className="w-6 h-6"
                          onClick={() => handleRoleCountChange(role, -1)}
                          disabled={isLead || count === 0}
                          aria-label={`Decrease ${label} count`}
                        >
                          <Minus size={12} />
                        </Button>
                        <span className="text-sm font-medium w-6 text-center tabular-nums">
                          {count}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="w-6 h-6"
                          onClick={() => handleRoleCountChange(role, 1)}
                          disabled={isLead && count >= 1}
                          aria-label={`Increase ${label} count`}
                        >
                          <Plus size={12} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 pb-6 pt-2">
            <p className="text-xs text-muted-foreground">
              {!activeProjectPath && 'Open a project first'}
            </p>
            <div className="flex gap-2">
              <DialogPrimitive.Close asChild>
                <Button variant="outline">Cancel</Button>
              </DialogPrimitive.Close>
              <Button variant="default" onClick={handleStart} disabled={!canStart}>
                Start Swarm ({totalAgents} agents)
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
