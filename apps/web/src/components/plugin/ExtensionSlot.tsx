import { Fragment, type ComponentType } from 'react';
import {
  usePluginStore,
  getTerminalHeaderActions,
  getActionBarItems,
  getMoreMenuItems,
  getStatusRenderer,
  getUsagePanel,
} from '@/stores/usePluginStore';
import { PluginErrorBoundary } from './PluginErrorBoundary';

interface ExtensionSlotProps {
  /** Named extension point to render */
  name:
    | 'terminal-header-actions'
    | 'action-bar'
    | 'more-menu'
    | 'status-display'
    | 'usage-panel'
    | (string & {});
  /** Props passed to registered plugin components */
  context?: Record<string, unknown>;
  /** Filter registrations by AI mode */
  aiMode?: string;
  /** Render all matches or just the first (highest priority) */
  renderMode?: 'all' | 'first';
  /** Optional className for the wrapper div */
  className?: string;
}

/** Internal registration entry with normalized component type */
interface SlotRegistration {
  id: string;
  pluginId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
  order?: number;
}

/**
 * Generic extension point renderer.
 *
 * Queries the plugin store for registrations matching the given slot name,
 * optionally filters by aiMode, sorts by order, and renders each component
 * wrapped in a PluginErrorBoundary for error isolation.
 *
 * If no registrations match, renders nothing (null).
 */
export function ExtensionSlot({
  name,
  context,
  aiMode,
  renderMode = 'all',
  className,
}: ExtensionSlotProps) {
  // Subscribe to relevant registration maps so we re-render when they change.
  // The selector picks the specific map for the slot name to minimize re-renders.
  const terminalHeaderActions = usePluginStore(s => s.terminalHeaderActions);
  const actionBarItems = usePluginStore(s => s.actionBarItems);
  const moreMenuItems = usePluginStore(s => s.moreMenuItems);
  const statusRenderers = usePluginStore(s => s.statusRenderers);
  const usagePanels = usePluginStore(s => s.usagePanels);

  // These subscriptions exist to trigger re-renders when maps change
  void terminalHeaderActions;
  void actionBarItems;
  void moreMenuItems;
  void statusRenderers;
  void usagePanels;

  // Resolve registrations based on slot name
  let registrations: SlotRegistration[] = [];

  switch (name) {
    case 'terminal-header-actions':
      registrations = getTerminalHeaderActions(aiMode).map(r => ({
        id: r.id,
        pluginId: r.pluginId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component: r.icon as ComponentType<any>,
        order: r.order,
      }));
      break;

    case 'action-bar':
      registrations = getActionBarItems(aiMode).map(r => ({
        id: r.id,
        pluginId: r.pluginId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component: r.icon as ComponentType<any>,
        order: r.order,
      }));
      break;

    case 'more-menu':
      registrations = getMoreMenuItems(aiMode).map(r => ({
        id: r.id,
        pluginId: r.pluginId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component: r.icon as ComponentType<any>,
        order: r.order,
      }));
      break;

    case 'status-display': {
      const renderer = getStatusRenderer(aiMode ?? '');
      if (renderer) {
        registrations = [
          {
            id: renderer.id,
            pluginId: renderer.pluginId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            component: renderer.component as ComponentType<any>,
            order: renderer.order,
          },
        ];
      }
      break;
    }

    case 'usage-panel': {
      const panel = getUsagePanel(aiMode ?? '');
      if (panel) {
        registrations = [
          {
            id: panel.id,
            pluginId: panel.pluginId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            component: panel.component as ComponentType<any>,
            order: panel.order,
          },
        ];
      }
      break;
    }

    default:
      // Unknown slot name -- render nothing
      break;
  }

  if (registrations.length === 0) return null;

  const toRender = renderMode === 'first' ? [registrations[0]] : registrations;

  const content = toRender.map(reg => {
    const PluginComponent = reg.component;
    return (
      <PluginErrorBoundary key={reg.id} pluginId={reg.pluginId}>
        <PluginComponent {...(context ?? {})} />
      </PluginErrorBoundary>
    );
  });

  if (className) {
    return <div className={className}>{content}</div>;
  }

  return <Fragment>{content}</Fragment>;
}
