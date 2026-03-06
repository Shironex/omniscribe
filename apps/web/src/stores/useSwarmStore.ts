import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  MAX_SWARM_MESSAGES,
  createLogger,
  SwarmEvents,
  type SwarmConfig,
  type SwarmAgent,
  type SwarmTask,
  type SwarmMessage,
  type CreateSwarmPayload,
  type SwarmStatusUpdate,
  type SwarmAgentUpdate,
  type SwarmTaskUpdate,
  type SwarmMessageUpdate,
} from '@omniscribe/shared';
import { getSocket } from '@/lib/socket';
import { useAppUIStore } from './useAppUIStore';
import {
  SocketStoreState,
  SocketStoreActions,
  initialSocketState,
  createSocketActions,
  createSocketListeners,
} from './utils';

const logger = createLogger('SwarmStore');

/**
 * Swarm store state (extends common socket state)
 */
interface SwarmState extends SocketStoreState {
  /** All swarm configurations */
  swarms: SwarmConfig[];
  /** Currently active/selected swarm ID */
  activeSwarmId: string | null;
  /** Agents indexed by swarm ID */
  agents: Record<string, SwarmAgent[]>;
  /** Tasks indexed by swarm ID */
  tasks: Record<string, SwarmTask[]>;
  /** Messages indexed by swarm ID */
  messages: Record<string, SwarmMessage[]>;
}

/**
 * Swarm store actions (extends common socket actions)
 */
interface SwarmActions extends SocketStoreActions {
  /** Create a new swarm */
  createSwarm: (payload: CreateSwarmPayload) => void;
  /** Cancel a running swarm */
  cancelSwarm: (swarmId: string) => void;
  /** Retry an errored swarm by creating a new swarm from the same config */
  retrySwarm: (swarmId: string) => void;
  /** Stop a specific agent in a swarm */
  stopAgent: (swarmId: string, agentId: string) => void;
  /** Set the active/selected swarm */
  setActiveSwarm: (swarmId: string | null) => void;
  /** Add a new swarm (used by listeners) */
  addSwarm: (swarm: SwarmConfig) => void;
  /** Update swarm status (used by listeners) */
  updateSwarmStatus: (update: SwarmStatusUpdate) => void;
  /** Update an agent (used by listeners) */
  updateAgent: (update: SwarmAgentUpdate) => void;
  /** Update a task (used by listeners) */
  updateTask: (update: SwarmTaskUpdate) => void;
  /** Add a message (used by listeners) */
  addMessage: (update: SwarmMessageUpdate) => void;
  /** Remove a swarm (used by listeners) */
  removeSwarm: (swarmId: string) => void;
  /** Initialize socket listeners */
  initListeners: () => void;
  /** Clean up socket listeners */
  cleanupListeners: () => void;
}

/**
 * Combined store type
 */
type SwarmStore = SwarmState & SwarmActions;

/**
 * Swarm store using Zustand — manages swarm configurations,
 * agents, tasks, and inter-agent messages.
 */
export const useSwarmStore = create<SwarmStore>()(
  devtools(
    (set, get) => {
      // Create common socket actions
      const socketActions = createSocketActions<SwarmState>(set, 'swarm');

      // Create socket listeners
      const { initListeners, cleanupListeners } = createSocketListeners<SwarmStore>(
        get,
        set,
        'swarm',
        {
          listeners: [
            {
              event: SwarmEvents.CREATED,
              handler: (data, get) => {
                const swarm = data as SwarmConfig;
                logger.debug(SwarmEvents.CREATED, swarm.id);
                get().addSwarm(swarm);
                // Auto-open the swarm view when a new swarm is created
                useAppUIStore.getState().openSwarmView();
              },
            },
            {
              event: SwarmEvents.STATUS,
              handler: (data, get) => {
                const update = data as SwarmStatusUpdate;
                logger.debug(SwarmEvents.STATUS, update.swarmId, update.status);
                get().updateSwarmStatus(update);
              },
            },
            {
              event: SwarmEvents.AGENT_UPDATED,
              handler: (data, get) => {
                const update = data as SwarmAgentUpdate;
                logger.debug(SwarmEvents.AGENT_UPDATED, update.swarmId, update.agent.id);
                get().updateAgent(update);
              },
            },
            {
              event: SwarmEvents.TASK_UPDATED,
              handler: (data, get) => {
                const update = data as SwarmTaskUpdate;
                logger.debug(SwarmEvents.TASK_UPDATED, update.swarmId, update.task.id);
                get().updateTask(update);
              },
            },
            {
              event: SwarmEvents.MESSAGE,
              handler: (data, get) => {
                const update = data as SwarmMessageUpdate;
                logger.debug(SwarmEvents.MESSAGE, update.swarmId, update.message.id);
                get().addMessage(update);
              },
            },
            {
              event: SwarmEvents.COMPLETED,
              handler: (data, get) => {
                const update = data as SwarmStatusUpdate;
                logger.debug(SwarmEvents.COMPLETED, update.swarmId);
                get().updateSwarmStatus({ ...update, status: 'done' });
              },
            },
            {
              event: SwarmEvents.ERROR,
              handler: (data, get) => {
                const update = data as SwarmStatusUpdate;
                logger.debug(SwarmEvents.ERROR, update.swarmId, update.error);
                get().updateSwarmStatus({ ...update, status: 'error' });
              },
            },
            {
              event: SwarmEvents.REMOVED,
              handler: (data, get) => {
                const { swarmId } = data as { swarmId: string };
                logger.debug(SwarmEvents.REMOVED, swarmId);
                get().removeSwarm(swarmId);
              },
            },
          ],
          onConnect: _get => {
            // Request fresh swarm list on reconnect
            logger.info('Refreshing swarm list on reconnect');
            getSocket().emit(
              SwarmEvents.LIST,
              {},
              (response: SwarmConfig[] | { swarms: SwarmConfig[] }) => {
                const swarms = Array.isArray(response) ? response : response?.swarms;
                if (Array.isArray(swarms)) {
                  set({ swarms }, undefined, 'swarm/setSwarmsOnReconnect');
                }
              }
            );
          },
        }
      );

      return {
        // Initial state (spread common state + custom state)
        ...initialSocketState,
        swarms: [],
        activeSwarmId: null,
        agents: {},
        tasks: {},
        messages: {},

        // Common socket actions
        ...socketActions,

        // Socket listeners
        initListeners,
        cleanupListeners,

        // Emit actions
        createSwarm: (payload: CreateSwarmPayload) => {
          logger.debug('createSwarm', payload.name);
          getSocket().emit(SwarmEvents.CREATE, payload);
        },

        cancelSwarm: (swarmId: string) => {
          logger.debug('cancelSwarm', swarmId);
          getSocket().emit(SwarmEvents.CANCEL, { swarmId });
        },

        retrySwarm: (swarmId: string) => {
          const swarm = get().swarms.find(entry => entry.id === swarmId);
          if (!swarm) return;
          logger.debug('retrySwarm', swarmId);
          get().createSwarm({
            name: swarm.name,
            goal: swarm.goal,
            projectPath: swarm.projectPath,
            roles: swarm.roles,
          });
        },

        stopAgent: (swarmId: string, agentId: string) => {
          logger.debug('stopAgent', swarmId, agentId);
          getSocket().emit(SwarmEvents.STOP_AGENT, { swarmId, agentId });
        },

        // State actions
        setActiveSwarm: (swarmId: string | null) => {
          set({ activeSwarmId: swarmId }, undefined, 'swarm/setActiveSwarm');
        },

        addSwarm: (swarm: SwarmConfig) => {
          set(
            state => {
              const exists = state.swarms.some(s => s.id === swarm.id);
              if (exists) {
                return state;
              }
              return {
                swarms: [...state.swarms, swarm],
                activeSwarmId: swarm.id,
              };
            },
            undefined,
            'swarm/addSwarm'
          );
        },

        updateSwarmStatus: (update: SwarmStatusUpdate) => {
          set(
            state => ({
              swarms: state.swarms.map(swarm =>
                swarm.id === update.swarmId
                  ? {
                      ...swarm,
                      status: update.status,
                      ...(update.error !== undefined && { error: update.error }),
                      updatedAt: new Date().toISOString(),
                    }
                  : swarm
              ),
            }),
            undefined,
            'swarm/updateSwarmStatus'
          );
        },

        updateAgent: (update: SwarmAgentUpdate) => {
          set(
            state => {
              const currentAgents = state.agents[update.swarmId] ?? [];
              const agentIndex = currentAgents.findIndex(a => a.id === update.agent.id);
              let updatedAgents: SwarmAgent[];
              if (agentIndex >= 0) {
                updatedAgents = [...currentAgents];
                updatedAgents[agentIndex] = update.agent;
              } else {
                updatedAgents = [...currentAgents, update.agent];
              }
              return {
                agents: { ...state.agents, [update.swarmId]: updatedAgents },
              };
            },
            undefined,
            'swarm/updateAgent'
          );
        },

        updateTask: (update: SwarmTaskUpdate) => {
          set(
            state => {
              const currentTasks = state.tasks[update.swarmId] ?? [];
              const taskIndex = currentTasks.findIndex(t => t.id === update.task.id);
              let updatedTasks: SwarmTask[];
              if (taskIndex >= 0) {
                updatedTasks = [...currentTasks];
                updatedTasks[taskIndex] = update.task;
              } else {
                updatedTasks = [...currentTasks, update.task];
              }
              return {
                tasks: { ...state.tasks, [update.swarmId]: updatedTasks },
              };
            },
            undefined,
            'swarm/updateTask'
          );
        },

        addMessage: (update: SwarmMessageUpdate) => {
          set(
            state => {
              const currentMessages = state.messages[update.swarmId] ?? [];
              const nextMessages = [...currentMessages, update.message].slice(-MAX_SWARM_MESSAGES);
              return {
                messages: {
                  ...state.messages,
                  [update.swarmId]: nextMessages,
                },
              };
            },
            undefined,
            'swarm/addMessage'
          );
        },

        removeSwarm: (swarmId: string) => {
          set(
            state => {
              const { [swarmId]: _agents, ...restAgents } = state.agents;
              const { [swarmId]: _tasks, ...restTasks } = state.tasks;
              const { [swarmId]: _messages, ...restMessages } = state.messages;
              return {
                swarms: state.swarms.filter(s => s.id !== swarmId),
                agents: restAgents,
                tasks: restTasks,
                messages: restMessages,
                // Clear activeSwarmId if the removed swarm was active
                ...(state.activeSwarmId === swarmId && { activeSwarmId: null }),
              };
            },
            undefined,
            'swarm/removeSwarm'
          );
        },
      };
    },
    { name: 'swarm' }
  )
);

// Selectors

/** Stable empty arrays to avoid new references */
const EMPTY_AGENTS: SwarmAgent[] = [];
const EMPTY_TASKS: SwarmTask[] = [];
const EMPTY_MESSAGES: SwarmMessage[] = [];

/**
 * Select the active swarm config
 */
export const selectActiveSwarm = (state: SwarmStore) =>
  state.swarms.find(s => s.id === state.activeSwarmId) ?? null;

/**
 * Select agents for a specific swarm
 */
export const selectAgentsForSwarm = (swarmId: string) => (state: SwarmStore) =>
  state.agents[swarmId] ?? EMPTY_AGENTS;

/**
 * Select tasks for a specific swarm
 */
export const selectTasksForSwarm = (swarmId: string) => (state: SwarmStore) =>
  state.tasks[swarmId] ?? EMPTY_TASKS;

/**
 * Select messages for a specific swarm
 */
export const selectMessagesForSwarm = (swarmId: string) => (state: SwarmStore) =>
  state.messages[swarmId] ?? EMPTY_MESSAGES;
