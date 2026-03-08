import { memo, useRef, useEffect, useMemo, useState, useCallback } from 'react';
import type { SwarmAgent, SwarmMessage, SwarmTask, SwarmConfig } from '@omniscribe/shared';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Circle,
  Bot,
  ArrowRightLeft,
  ListTodo,
  Send,
  User,
} from 'lucide-react';

interface SwarmChatPanelProps {
  swarm: SwarmConfig;
  agents: SwarmAgent[];
  messages: SwarmMessage[];
  tasks: SwarmTask[];
  onSendMessage: (content: string, toAgentId?: string) => void;
}

type FeedItemType = 'message' | 'task_update';

interface FeedItem {
  id: string;
  type: FeedItemType;
  timestamp: string;
  message?: SwarmMessage;
  task?: SwarmTask;
}

/** Build a unified activity feed from messages and tasks */
function buildFeedItems(messages: SwarmMessage[], tasks: SwarmTask[]): FeedItem[] {
  const items: FeedItem[] = [];

  for (const msg of messages) {
    items.push({
      id: `msg-${msg.id}`,
      type: 'message',
      timestamp: msg.timestamp,
      message: msg,
    });
  }

  for (const task of tasks) {
    items.push({
      id: `task-${task.id}`,
      type: 'task_update',
      timestamp: task.updatedAt,
      task,
    });
  }

  items.sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));
  return items;
}

/** Resolve an agent ID to a display label */
function getAgentLabel(agentId: string, agents: SwarmAgent[]): string {
  if (agentId === 'operator') return 'You (Operator)';
  if (agentId === 'all') return 'Everyone';
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return agentId.slice(0, 6);
  const roleLabel = agent.role.charAt(0).toUpperCase() + agent.role.slice(1);
  return `${roleLabel} (${agent.sessionId.slice(0, 6)})`;
}

/** Message type badge color */
const MESSAGE_TYPE_COLORS: Record<SwarmMessage['type'], string> = {
  task_assignment: 'text-purple-400',
  result: 'text-green-400',
  review: 'text-amber-400',
  info: 'text-blue-400',
  request: 'text-cyan-400',
};

/** Task status icon */
function TaskStatusIcon({ status }: { status: SwarmTask['status'] }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 size={12} className="text-green-500 shrink-0" />;
    case 'failed':
      return <AlertTriangle size={12} className="text-destructive shrink-0" />;
    case 'assigned':
      return <Clock size={12} className="text-blue-400 shrink-0" />;
    case 'blocked':
      return <Circle size={12} className="text-yellow-400 shrink-0" />;
    default:
      return <Circle size={12} className="text-muted-foreground shrink-0" />;
  }
}

type TabType = 'feed' | 'messages' | 'tasks';

function SwarmChatPanelInner({
  swarm,
  agents,
  messages,
  tasks,
  onSendMessage,
}: SwarmChatPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('feed');
  const [inputValue, setInputValue] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const isTerminal =
    swarm.status === 'done' || swarm.status === 'cancelled' || swarm.status === 'error';

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onSendMessage(trimmed, selectedAgent === 'all' ? undefined : selectedAgent);
    setInputValue('');
  }, [inputValue, selectedAgent, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const feedItems = useMemo(() => buildFeedItems(messages, tasks), [messages, tasks]);

  // Auto-scroll to bottom when new items arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [feedItems.length, messages.length, tasks.length]);

  const togglePanel = useCallback(() => setIsOpen(prev => !prev), []);

  if (!isOpen) {
    return (
      <div className="absolute bottom-3 right-3 z-10">
        <Button
          variant="outline"
          size="sm"
          onClick={togglePanel}
          className="gap-1.5 bg-background/95 backdrop-blur-sm shadow-lg"
        >
          <MessageSquare size={14} />
          Activity
          {messages.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-primary/20 text-primary">
              {messages.length}
            </span>
          )}
          <ChevronLeft size={12} />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'absolute top-16 right-3 bottom-3 z-10',
        'flex flex-col',
        'rounded-xl border bg-background/95 backdrop-blur-sm shadow-lg',
        'w-[340px] text-xs overflow-hidden'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <MessageSquare size={14} className="text-primary shrink-0" />
        <span className="font-semibold text-sm text-foreground">Activity</span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="w-6 h-6"
          onClick={togglePanel}
          aria-label="Collapse panel"
        >
          <ChevronRight size={14} />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {(['feed', 'messages', 'tasks'] as const).map(tab => (
          <button
            key={tab}
            className={cn(
              'flex-1 px-2 py-1.5 text-[11px] font-medium capitalize transition-colors cursor-pointer',
              activeTab === tab
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
            {tab === 'messages' && messages.length > 0 && (
              <span className="ml-1 text-[9px] text-muted-foreground">({messages.length})</span>
            )}
            {tab === 'tasks' && tasks.length > 0 && (
              <span className="ml-1 text-[9px] text-muted-foreground">({tasks.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {activeTab === 'feed' && <FeedView items={feedItems} agents={agents} />}
        {activeTab === 'messages' && <MessagesView messages={messages} agents={agents} />}
        {activeTab === 'tasks' && <TasksView tasks={tasks} agents={agents} />}
      </div>

      {/* Message compose area */}
      {!isTerminal && (
        <div className="border-t border-border p-2 space-y-1.5">
          {/* Agent selector */}
          <div className="flex items-center gap-1.5">
            <User size={10} className="text-muted-foreground shrink-0" />
            <span className="text-[10px] text-muted-foreground">To:</span>
            <select
              value={selectedAgent}
              onChange={e => setSelectedAgent(e.target.value)}
              className={cn(
                'text-[10px] bg-muted/50 border border-border/50 rounded px-1.5 py-0.5',
                'text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50'
              )}
            >
              <option value="all">All Agents</option>
              {agents.map(agent => {
                const label = getAgentLabel(agent.id, agents);
                return (
                  <option key={agent.id} value={agent.id}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Message input */}
          <div className="flex items-end gap-1.5">
            <textarea
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message to agents..."
              rows={1}
              className={cn(
                'flex-1 resize-none text-xs bg-muted/30 border border-border/50 rounded-lg',
                'px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/50',
                'focus:outline-none focus:ring-1 focus:ring-primary/50',
                'max-h-[80px] min-h-[28px]'
              )}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="w-7 h-7 shrink-0"
              aria-label="Send message"
            >
              <Send size={12} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Unified feed view showing all activity */
function FeedView({ items, agents }: { items: FeedItem[]; agents: SwarmAgent[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <Bot size={24} className="opacity-40" />
        <p>No activity yet</p>
        <p className="text-[10px] opacity-60">Agent messages and task updates will appear here</p>
      </div>
    );
  }

  return (
    <>
      {items.map(item => (
        <div key={item.id}>
          {item.type === 'message' && item.message && (
            <MessageBubble message={item.message} agents={agents} />
          )}
          {item.type === 'task_update' && item.task && (
            <TaskCard task={item.task} agents={agents} />
          )}
        </div>
      ))}
    </>
  );
}

/** Messages-only view */
function MessagesView({ messages, agents }: { messages: SwarmMessage[]; agents: SwarmAgent[] }) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <ArrowRightLeft size={24} className="opacity-40" />
        <p>No messages yet</p>
      </div>
    );
  }

  return (
    <>
      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} agents={agents} />
      ))}
    </>
  );
}

/** Tasks-only view */
function TasksView({ tasks, agents }: { tasks: SwarmTask[]; agents: SwarmAgent[] }) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <ListTodo size={24} className="opacity-40" />
        <p>No tasks yet</p>
      </div>
    );
  }

  return (
    <>
      {tasks.map(task => (
        <TaskCard key={task.id} task={task} agents={agents} />
      ))}
    </>
  );
}

/** Single message bubble */
function MessageBubble({ message, agents }: { message: SwarmMessage; agents: SwarmAgent[] }) {
  const isOperator = message.fromAgentId === 'operator';
  const fromLabel = getAgentLabel(message.fromAgentId, agents);
  const toLabel = getAgentLabel(message.toAgentId, agents);
  const typeColor = MESSAGE_TYPE_COLORS[message.type] ?? 'text-muted-foreground';
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={cn(
        'rounded-lg border p-2 space-y-1',
        isOperator ? 'border-primary/30 bg-primary/5' : 'border-border/60 bg-card/50'
      )}
    >
      <div className="flex items-center gap-1.5">
        {isOperator ? (
          <User size={10} className="text-primary shrink-0" />
        ) : (
          <Bot size={10} className="text-primary shrink-0" />
        )}
        <span className="font-medium text-foreground truncate">{fromLabel}</span>
        <span className="text-muted-foreground">→</span>
        <span className="text-muted-foreground truncate">{toLabel}</span>
        <span className={cn('ml-auto text-[9px] capitalize', typeColor)}>
          {message.type.replace('_', ' ')}
        </span>
      </div>
      <div className="text-muted-foreground wrap-break-word swarm-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
          {message.content}
        </ReactMarkdown>
      </div>
      <div className="text-[9px] text-muted-foreground/60">{time}</div>
    </div>
  );
}

/** Single task card */
function TaskCard({ task, agents }: { task: SwarmTask; agents: SwarmAgent[] }) {
  const assigneeLabel = task.assignedTo ? getAgentLabel(task.assignedTo, agents) : 'Unassigned';
  const time = new Date(task.updatedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="rounded-lg border border-border/60 bg-card/50 p-2 space-y-1">
      <div className="flex items-center gap-1.5">
        <TaskStatusIcon status={task.status} />
        <span className="font-medium text-foreground truncate flex-1">{task.subject}</span>
        <span className="text-[9px] text-muted-foreground capitalize">{task.status}</span>
      </div>
      {task.description && <p className="text-muted-foreground pl-4">{task.description}</p>}
      <div className="flex items-center gap-2 text-[9px] text-muted-foreground/60 pl-4">
        <span>{assigneeLabel}</span>
        <span>•</span>
        <span>{time}</span>
      </div>
      {task.result && (
        <div className="mt-1 pl-4 border-l-2 border-green-500/30 swarm-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {task.result}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

export const SwarmChatPanel = memo(SwarmChatPanelInner);
