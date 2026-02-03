import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Play, Trash2, Bot, Sparkles, ChevronDown, Server, Check } from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { BranchSelector, Branch } from '../shared/BranchSelector';
import { useMcpStore, selectServers } from '../../stores/useMcpStore';
import { useGitStore, selectBranches, selectCurrentBranch } from '../../stores/useGitStore';

export type AIMode = 'claude' | 'gemini' | 'codex' | 'plain';

export interface PreLaunchSlot {
  id: string;
  aiMode: AIMode;
  branch: string;
  mcpServers?: string[];
}

interface PreLaunchCardProps {
  slot: PreLaunchSlot;
  branches?: Branch[];
  onUpdate: (slotId: string, updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch' | 'mcpServers'>>) => void;
  onLaunch: (slotId: string) => void;
  onRemove: (slotId: string) => void;
  className?: string;
}

const aiModeOptions: { value: AIMode; label: string; icon: typeof Bot; color: string }[] = [
  { value: 'claude', label: 'Claude', icon: Bot, color: 'text-orange-400' },
  { value: 'gemini', label: 'Gemini', icon: Sparkles, color: 'text-blue-400' },
  { value: 'codex', label: 'Codex', icon: Sparkles, color: 'text-green-400' },
  { value: 'plain', label: 'Plain', icon: Bot, color: 'text-muted-foreground' },
];

export function PreLaunchCard({
  slot,
  branches: propBranches,
  onUpdate,
  onLaunch,
  onRemove,
  className,
}: PreLaunchCardProps) {
  const [isAIModeOpen, setIsAIModeOpen] = useState(false);
  const [isMcpOpen, setIsMcpOpen] = useState(false);
  const aiModeRef = useRef<HTMLDivElement>(null);
  const mcpRef = useRef<HTMLDivElement>(null);

  // Connect to MCP store for server selection
  const allMcpServers = useMcpStore(selectServers);
  const enabledServers = useMcpStore((state) => state.enabledServers);

  // Filter out internal omniscribe MCP - it's always included and cannot be disabled
  const mcpServers = useMemo(() =>
    allMcpServers.filter(
      (server) => server.id !== 'omniscribe' && server.name !== 'omniscribe'
    ),
    [allMcpServers]
  );

  // Connect to Git store for branches (fallback if not provided via props)
  const gitBranches = useGitStore(selectBranches);
  const currentGitBranch = useGitStore(selectCurrentBranch);
  const gitProjectPath = useGitStore((state) => state.projectPath);
  const fetchBranches = useGitStore((state) => state.fetchBranches);

  // Use prop branches or fall back to store branches
  const branches: Branch[] = useMemo(() => {
    if (propBranches && propBranches.length > 0) {
      return propBranches;
    }
    return gitBranches.map((b) => ({
      name: b.name,
      isRemote: b.isRemote,
      isCurrent: currentGitBranch?.name === b.name,
    }));
  }, [propBranches, gitBranches, currentGitBranch]);

  // Fetch branches if empty and we have a project path
  useEffect(() => {
    if (branches.length === 0 && gitProjectPath) {
      fetchBranches(gitProjectPath);
    }
  }, [branches.length, gitProjectPath, fetchBranches]);

  // Get selected MCP servers (default to enabled servers if not set)
  // Filter out internal omniscribe MCP from selection tracking
  const selectedMcpServers = useMemo(() => {
    const servers = slot.mcpServers ?? Array.from(enabledServers);
    return servers.filter((id) => id !== 'omniscribe');
  }, [slot.mcpServers, enabledServers]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (aiModeRef.current && !aiModeRef.current.contains(event.target as Node)) {
        setIsAIModeOpen(false);
      }
      if (mcpRef.current && !mcpRef.current.contains(event.target as Node)) {
        setIsMcpOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Toggle MCP server selection
  const handleToggleMcpServer = (serverId: string) => {
    const newServers = selectedMcpServers.includes(serverId)
      ? selectedMcpServers.filter((id) => id !== serverId)
      : [...selectedMcpServers, serverId];
    onUpdate(slot.id, { mcpServers: newServers });
  };

  const selectedMode = aiModeOptions.find((m) => m.value === slot.aiMode) || aiModeOptions[0];
  const SelectedIcon = selectedMode.icon;

  return (
    <div
      className={twMerge(
        clsx(
          'flex flex-col h-full',
          'bg-card border border-border rounded-lg',
          'overflow-hidden',
          className
        )
      )}
    >
      {/* Card header */}
      <div className="h-7 bg-muted border-b border-border flex items-center justify-between px-2">
        <span className="text-xs font-medium text-foreground-secondary">
          New Session
        </span>
        <button
          onClick={() => onRemove(slot.id)}
          className={clsx(
            'p-1 rounded',
            'text-muted-foreground hover:text-red-400',
            'hover:bg-red-400/10 transition-colors'
          )}
          aria-label="Remove slot"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Card content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
        {/* AI Mode selector */}
        <div ref={aiModeRef} className="relative w-full max-w-48">
          <label className="block text-2xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
            AI Mode
          </label>
          <button
            onClick={() => setIsAIModeOpen(!isAIModeOpen)}
            className={clsx(
              'w-full flex items-center justify-between gap-2 px-3 py-2 rounded',
              'bg-muted border border-border',
              'text-sm text-foreground',
              'hover:bg-muted hover:border-muted-foreground',
              'transition-colors'
            )}
          >
            <div className="flex items-center gap-2">
              <SelectedIcon size={16} className={selectedMode.color} />
              <span>{selectedMode.label}</span>
            </div>
            <ChevronDown
              size={14}
              className={clsx(
                'text-muted-foreground transition-transform',
                isAIModeOpen && 'rotate-180'
              )}
            />
          </button>

          {/* AI Mode dropdown */}
          {isAIModeOpen && (
            <div
              className={clsx(
                'absolute top-full left-0 right-0 mt-1 z-50',
                'bg-muted border border-border rounded-lg shadow-xl',
                'overflow-hidden animate-fade-in'
              )}
            >
              {aiModeOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    onClick={() => {
                      onUpdate(slot.id, { aiMode: option.value });
                      setIsAIModeOpen(false);
                    }}
                    className={clsx(
                      'w-full flex items-center gap-2 px-3 py-2',
                      'text-sm text-left transition-colors',
                      option.value === slot.aiMode
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-card'
                    )}
                  >
                    <Icon size={16} className={option.color} />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Branch selector */}
        <div className="w-full max-w-48">
          <label className="block text-2xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
            Branch
          </label>
          <BranchSelector
            branches={branches}
            currentBranch={slot.branch}
            onSelect={(branchName) => onUpdate(slot.id, { branch: branchName })}
            className="w-full"
          />
        </div>

        {/* MCP Server selector */}
        {mcpServers.length > 0 && (
          <div ref={mcpRef} className="relative w-full max-w-48">
            <label className="block text-2xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              MCP Servers
            </label>
            <button
              onClick={() => setIsMcpOpen(!isMcpOpen)}
              className={clsx(
                'w-full flex items-center justify-between gap-2 px-3 py-2 rounded',
                'bg-muted border border-border',
                'text-sm text-foreground',
                'hover:bg-muted hover:border-muted-foreground',
                'transition-colors'
              )}
            >
              <div className="flex items-center gap-2">
                <Server size={16} className="text-foreground-secondary" />
                <span>
                  {selectedMcpServers.length === 0
                    ? 'None'
                    : `${selectedMcpServers.length} selected`}
                </span>
              </div>
              <ChevronDown
                size={14}
                className={clsx(
                  'text-muted-foreground transition-transform',
                  isMcpOpen && 'rotate-180'
                )}
              />
            </button>

            {/* MCP Server dropdown */}
            {isMcpOpen && (
              <div
                className={clsx(
                  'absolute top-full left-0 right-0 mt-1 z-50',
                  'bg-muted border border-border rounded-lg shadow-xl',
                  'overflow-hidden animate-fade-in max-h-40 overflow-y-auto'
                )}
              >
                {mcpServers.map((server) => {
                  const isSelected = selectedMcpServers.includes(server.id);
                  return (
                    <button
                      key={server.id}
                      onClick={() => handleToggleMcpServer(server.id)}
                      className={clsx(
                        'w-full flex items-center gap-2 px-3 py-2',
                        'text-sm text-left transition-colors',
                        isSelected
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground hover:bg-card'
                      )}
                    >
                      <div
                        className={clsx(
                          'w-4 h-4 rounded border flex items-center justify-center',
                          isSelected
                            ? 'bg-primary border-primary'
                            : 'border-border'
                        )}
                      >
                        {isSelected && <Check size={10} className="text-white" />}
                      </div>
                      <Server size={14} className="text-muted-foreground" />
                      <span className="truncate">{server.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Launch button */}
        <button
          onClick={() => onLaunch(slot.id)}
          className={clsx(
            'flex items-center justify-center gap-2 px-6 py-2 rounded-lg',
            'bg-primary hover:bg-primary/80',
            'text-sm font-medium text-white',
            'transition-colors shadow-lg shadow-primary/20',
            'hover:shadow-xl hover:shadow-primary/30'
          )}
        >
          <Play size={16} fill="currentColor" />
          <span>Launch</span>
        </button>
      </div>
    </div>
  );
}
