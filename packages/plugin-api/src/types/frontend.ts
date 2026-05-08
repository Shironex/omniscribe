/**
 * Frontend Plugin Types
 *
 * Defines the contract for plugins that contribute UI elements to Omniscribe.
 * Frontend plugins register components for settings sections, status renderers,
 * usage panels, terminal actions, and themes.
 *
 * Component types alias React's `ComponentType<P>`, which accepts function
 * components, class components, and `forwardRef` / `memo` / `lazy` wrappers
 * (e.g. every `lucide-react` icon). React is declared as an optional peer
 * dependency — `import type` is erased at build time, so backend-only plugins
 * pay zero runtime cost for these types.
 */

import type { ComponentType, SVGProps } from 'react';
import type { OmniscribePlugin, PluginContext, Disposable } from './plugin';
import type { PluginActivation } from './activation';
import type { ThemeRegistration } from './theme';
import type { ChangelogSourceRegistration } from './changelog';

// ==========================================
// Component Types (React-typed)
// ==========================================

/**
 * Any React component (function, class, `forwardRef`, `memo`, `lazy`) the
 * plugin host can render. Aliased to React's `ComponentType<P>` so all the
 * usual component shapes are accepted without casts.
 *
 * @typeParam P - Props type for the component
 *
 * @example
 * ```tsx
 * const MySettingsPanel: PluginComponentType<{ value: string }> = ({ value }) => (
 *   <div>{value}</div>
 * );
 * ```
 */
export type PluginComponentType<P = Record<string, never>> = ComponentType<P>;

/**
 * Props shared by every icon contribution. Deliberately narrow — matches the
 * subset of `lucide-react` icon props plugins typically need to forward, while
 * staying assignable from any `ComponentType` whose props are a superset.
 */
export type PluginIconProps = { size?: number | string; className?: string };

/**
 * Icon contribution type. `lucide-react` icons (`ForwardRefExoticComponent`)
 * and custom SVG components both satisfy this contract.
 */
export type PluginIconComponent = ComponentType<PluginIconProps>;

/**
 * Escape hatch for plugins that ship raw SVG components and need the full
 * `SVGProps<SVGSVGElement>` surface area instead of the narrowed icon props.
 */
export type PluginSvgComponent = ComponentType<SVGProps<SVGSVGElement>>;

// ==========================================
// Frontend Plugin Interface
// ==========================================

/**
 * Frontend plugin interface for UI contributions.
 *
 * Frontend plugins register UI components that the core renders in predefined
 * extension points. Each registration returns a Disposable for cleanup.
 *
 * @example
 * ```typescript
 * class MyFrontendPlugin extends BaseFrontendPlugin {
 *   readonly id = 'my-ui';
 *   readonly displayName = 'My UI Plugin';
 *
 *   async activate(context: FrontendPluginContext) {
 *     context.subscriptions.push(
 *       context.registerSettingsSection({
 *         categoryId: 'integrations',
 *         sectionId: 'my-settings',
 *         label: 'My Settings',
 *         icon: MyIcon,
 *         component: MySettingsPanel,
 *       })
 *     );
 *   }
 * }
 * ```
 */
export interface FrontendPlugin extends OmniscribePlugin {
  /** Must be 'frontend' or 'both' */
  readonly type: 'frontend' | 'both';

  /**
   * Events that trigger this plugin's activation.
   * Frontend plugins typically use 'onStartup' or 'onSettingsOpen'.
   */
  readonly activationEvents: PluginActivation[];

  /**
   * Called when the plugin is activated with a frontend context.
   * Use the context's registerXxx methods to contribute UI elements.
   * Push returned Disposables to context.subscriptions for automatic cleanup.
   */
  activate(context: FrontendPluginContext): Promise<void>;

  /**
   * Called when the plugin is deactivated.
   * Clean up any resources not tracked via context.subscriptions.
   */
  deactivate(): Promise<void>;
}

// ==========================================
// Frontend Plugin Context
// ==========================================

/**
 * Extended plugin context for frontend plugins.
 * Provides registration methods for each UI extension point.
 * Every registerXxx method returns a Disposable that removes the registration.
 */
export interface FrontendPluginContext extends PluginContext {
  /**
   * Register a settings section within an existing or plugin-provided category.
   * The section appears as a navigation item in the settings sidebar.
   *
   * @returns Disposable that removes this section registration
   */
  registerSettingsSection(registration: SettingsSectionRegistration): Disposable;

  /**
   * Register a new settings category (group of sections).
   * Categories appear as top-level groups in the settings sidebar navigation.
   *
   * @returns Disposable that removes this category registration
   */
  registerSettingsCategory(registration: SettingsCategoryRegistration): Disposable;

  /**
   * Register a custom session status renderer for a specific AI mode.
   * Overrides or augments the default status display for sessions of that mode.
   *
   * @returns Disposable that removes this renderer registration
   */
  registerSessionStatusRenderer(registration: SessionStatusRendererRegistration): Disposable;

  /**
   * Register a usage panel component for a specific AI mode.
   * Shown in the usage display area when viewing sessions of that mode.
   *
   * @returns Disposable that removes this panel registration
   */
  registerUsagePanel(registration: UsagePanelRegistration): Disposable;

  /**
   * Register an action button in the terminal header area.
   * Appears alongside existing terminal header controls for matching sessions.
   *
   * @returns Disposable that removes this action registration
   */
  registerTerminalHeaderAction(registration: TerminalHeaderActionRegistration): Disposable;

  /**
   * Register an item in the main action bar.
   * Action bar items are shown based on the active session's AI mode.
   *
   * @returns Disposable that removes this item registration
   */
  registerActionBarItem(registration: ActionBarItemRegistration): Disposable;

  /**
   * Register a menu item in the "More" overflow menu.
   * Appears in the context menu for matching sessions.
   *
   * @returns Disposable that removes this menu item registration
   */
  registerMoreMenuItem(registration: MoreMenuItemRegistration): Disposable;

  /**
   * Register a custom theme with the theme system.
   * The theme appears in the appearance settings alongside built-in themes.
   *
   * @returns Disposable that removes this theme registration
   */
  registerTheme(registration: ThemeRegistration): Disposable;

  /**
   * Register a release-notes source. The host:
   *   1. Auto-registers a settings section under the plugin's category
   *      (or `categoryId` if provided). Section id is `changelog:${id}`.
   *   2. Wires the backend fetcher (cache + ETag + IPC) keyed by source id.
   *   3. Mounts a generic ChangelogSection that consumes the keyed
   *      frontend store entry.
   *
   * Plugins do not register a separate settings section — this method
   * IS the settings section registration.
   *
   * @returns Disposable that removes the source registration AND its
   *   auto-registered settings section in one call.
   */
  registerChangelogSource(registration: ChangelogSourceRegistration): Disposable;
}

// ==========================================
// Extension Point Registration Types
// ==========================================

/**
 * Registration for a settings section within a category.
 *
 * @example
 * ```typescript
 * {
 *   categoryId: 'integrations',
 *   sectionId: 'claude-settings',
 *   label: 'Claude CLI',
 *   icon: ClaudeIcon,
 *   component: ClaudeSettingsPanel,
 *   order: 10,
 * }
 * ```
 */
export interface SettingsSectionRegistration {
  /** ID of the category this section belongs to */
  categoryId: string;

  /** Unique section identifier */
  sectionId: string;

  /** Display label in the settings sidebar */
  label: string;

  /** Icon component for the sidebar navigation item */
  icon: PluginIconComponent;

  /** Component to render when this section is selected */
  component: ComponentType;

  /** Sort order within the category (lower = higher, default: 100) */
  order?: number;
}

/**
 * Registration for a settings category (group of sections).
 *
 * @example
 * ```typescript
 * {
 *   categoryId: 'my-plugin',
 *   label: 'My Plugin',
 *   sections: [],
 *   order: 50,
 * }
 * ```
 */
export interface SettingsCategoryRegistration {
  /** Unique category identifier */
  categoryId: string;

  /** Display label shown as the group heading */
  label: string;

  /** Initial sections in this category (more can be added via registerSettingsSection) */
  sections: SettingsSectionRegistration[];

  /** Sort order among categories (lower = higher, default: 100) */
  order?: number;
}

/**
 * Registration for a custom session status renderer.
 */
export interface SessionStatusRendererRegistration {
  /** Unique renderer identifier */
  id: string;

  /** AI mode this renderer applies to */
  aiMode: string;

  /** Component that renders the session status */
  component: ComponentType<SessionStatusProps>;

  /** Sort order when multiple renderers match (lower = higher priority) */
  order?: number;
}

/**
 * Props passed to session status renderer components.
 */
export interface SessionStatusProps {
  /** The Omniscribe session ID */
  sessionId: string;

  /** Current session status */
  status: string;

  /** Optional status message from the provider */
  statusMessage?: string;
}

/**
 * Registration for a usage panel component.
 */
export interface UsagePanelRegistration {
  /** Unique panel identifier */
  id: string;

  /** AI mode this usage panel applies to */
  aiMode: string;

  /** Component that renders the usage information */
  component: ComponentType<UsagePanelProps>;

  /** Display label for tab headers in multi-provider mode (defaults to aiMode capitalized) */
  label?: string;

  /** Icon component for tab headers in multi-provider mode */
  icon?: PluginIconComponent;

  /** Sort order when multiple panels match (lower = higher priority) */
  order?: number;
}

/**
 * Props passed to usage panel components.
 */
export interface UsagePanelProps {
  /** Working directory for the project */
  workingDir: string;

  /**
   * When true, render content only (no Popover wrapper).
   * Used by the multi-provider usage host to embed panels inside a shared popover.
   * Defaults to false (standalone mode with own Popover).
   */
  embedded?: boolean;

  /**
   * Optional Radix anchors for standalone (non-embedded) usage popovers.
   * Sidebar footer passes right/top to match neighbouring Settings tooltips.
   */
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  popoverSide?: 'top' | 'right' | 'bottom' | 'left';
  popoverAlign?: 'start' | 'center' | 'end';
}

/**
 * Context passed to terminal action, action bar, and more menu callbacks.
 */
export interface TerminalActionContext {
  /** The Omniscribe session ID */
  sessionId: string;

  /** The AI mode of the session */
  aiMode: string;

  /** The project path for the session */
  projectPath: string;

  /** The terminal session ID (if available) */
  terminalSessionId?: string;
}

/**
 * Registration for a terminal header action button.
 */
export interface TerminalHeaderActionRegistration {
  /** Unique action identifier */
  id: string;

  /** Tooltip label for the action button */
  label: string;

  /** Icon component for the button */
  icon: PluginIconComponent;

  /**
   * AI modes this action appears for.
   * Use '*' to show for all modes, or specify specific mode strings.
   */
  showFor: string | string[];

  /** Callback when the action is clicked */
  onClick: (context: TerminalActionContext) => void;

  /** Sort order among terminal header actions (lower = leftmost) */
  order?: number;
}

/**
 * Registration for an action bar item.
 */
export interface ActionBarItemRegistration {
  /** Unique item identifier */
  id: string;

  /** Display label for the action */
  label: string;

  /** Icon component for the action */
  icon: PluginIconComponent;

  /**
   * AI modes this item appears for.
   * Use '*' to show for all modes, or specify specific mode strings.
   */
  showFor: string | string[];

  /** Callback when the item is clicked */
  onClick: (context: TerminalActionContext) => void;

  /** Sort order among action bar items (lower = leftmost) */
  order?: number;
}

/**
 * Registration for a "More" menu item.
 */
export interface MoreMenuItemRegistration {
  /** Unique menu item identifier */
  id: string;

  /** Display label for the menu item */
  label: string;

  /** Icon component for the menu item */
  icon: PluginIconComponent;

  /**
   * AI modes this menu item appears for.
   * Use '*' to show for all modes, or specify specific mode strings.
   */
  showFor: string | string[];

  /** Callback when the menu item is clicked */
  onClick: (context: TerminalActionContext) => void;

  /** Sort order among menu items (lower = higher in the menu) */
  order?: number;
}
