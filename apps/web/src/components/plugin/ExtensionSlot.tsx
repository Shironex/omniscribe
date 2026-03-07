import { useMemo, Fragment, type ComponentType } from 'react';
import { createLogger } from '@omniscribe/shared';
import { usePluginStore, matchesShowFor } from '@/stores/usePluginStore';
import { PluginErrorBoundary } from './PluginErrorBoundary';

const logger = createLogger('ExtensionSlot');

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
  /**
   * Render all matches or just the first (highest priority).
   * Note: `status-display` and `usage-panel` slots always return at most one
   * entry (highest priority by order) regardless of this setting.
   */
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

/** Picks the registration Map relevant to a given slot name */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function selectMapForSlot(name: string): (s: any) => Map<string, any> | undefined {
  switch (name) {
    case 'terminal-header-actions':
      return s => s.terminalHeaderActions;
    case 'action-bar':
      return s => s.actionBarItems;
    case 'more-menu':
      return s => s.moreMenuItems;
    case 'status-display':
      return s => s.statusRenderers;
    case 'usage-panel':
      return s => s.usagePanels;
    default:
      logger.warn(`Unknown extension slot name: "${name}"`);
      return () => undefined;
  }
}

/** Collect registrations filtered by showFor (used by terminal-header-actions, action-bar, more-menu) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveShowForSlot(map: Map<string, any>, aiMode?: string): SlotRegistration[] {
  const matches: SlotRegistration[] = [];
  for (const [, reg] of map) {
    if (matchesShowFor(reg.showFor, aiMode)) {
      matches.push({
        id: reg.id,
        pluginId: reg.pluginId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component: reg.icon as ComponentType<any>,
        order: reg.order,
      });
    }
  }
  return matches.toSorted((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

/** Collect registrations filtered by exact aiMode match, returning only highest priority (used by status-display, usage-panel) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveAiModeSlot(map: Map<string, any>, aiMode?: string): SlotRegistration[] {
  const matches: SlotRegistration[] = [];
  for (const [, reg] of map) {
    if (reg.aiMode === (aiMode ?? '')) {
      matches.push({
        id: reg.id,
        pluginId: reg.pluginId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component: reg.component as ComponentType<any>,
        order: reg.order,
      });
    }
  }
  const sorted = matches.toSorted((a, b) => (a.order ?? 100) - (b.order ?? 100));
  return sorted.length > 0 ? [sorted[0]] : [];
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
  // Subscribe to only the specific Map for this slot (not all 5).
  // The selector is memoized on `name` so Zustand gets a stable reference.

  const selector = useMemo(() => selectMapForSlot(name), [name]);
  const registrationMap = usePluginStore(selector);

  // Resolve and filter registrations from the subscribed Map
  const registrations = useMemo((): SlotRegistration[] => {
    if (!registrationMap) return [];

    switch (name) {
      case 'terminal-header-actions':
      case 'action-bar':
      case 'more-menu':
        return resolveShowForSlot(registrationMap, aiMode);

      case 'status-display':
      case 'usage-panel':
        return resolveAiModeSlot(registrationMap, aiMode);

      default:
        return [];
    }
  }, [registrationMap, name, aiMode]);

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
