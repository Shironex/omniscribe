import { type ComponentType } from 'react';
import { Terminal, Bot } from 'lucide-react';
import type { AiMode, ProviderInfo } from '@omniscribe/shared';

/**
 * Icon component type accepted by AI mode utilities.
 */
export type AiModeIconComponent = ComponentType<{ className?: string; size?: string | number }>;

/**
 * Represents a selectable AI mode option with display metadata.
 */
export interface AiModeOption {
  value: AiMode;
  label: string;
  icon: AiModeIconComponent;
  color: string;
  disabled?: boolean;
  disabledReason?: string;
}

type StatusRendererMap = Map<string, { aiMode: string; component: unknown; pluginId: string }>;

/**
 * Get the icon component for an AI mode from registered status renderers.
 * Falls back to Bot icon for provider modes and `plainIcon` for plain.
 */
export function getModeIcon(
  mode: string,
  statusRenderers: StatusRendererMap,
  plainIcon: AiModeIconComponent = Terminal
): AiModeIconComponent {
  if (mode === 'plain') return plainIcon;

  for (const [, reg] of statusRenderers) {
    if (reg.aiMode === mode) {
      return reg.component as AiModeIconComponent;
    }
  }

  return Bot;
}

/**
 * Build AI mode options from registered providers and status renderers.
 * Returns an array of options for enabled providers plus a plain mode fallback.
 */
export function buildAiModeOptions(
  providers: ProviderInfo[],
  statusRenderers: StatusRendererMap
): AiModeOption[] {
  const options: AiModeOption[] = [];

  for (const provider of providers.filter(p => p.enabled)) {
    const icon = getModeIcon(provider.aiMode, statusRenderers);
    const isDisabled = !provider.cliStatus?.installed;
    options.push({
      value: provider.aiMode as AiMode,
      label: provider.displayName,
      icon,
      color: 'text-primary',
      disabled: isDisabled,
      disabledReason: isDisabled ? 'CLI is not installed' : undefined,
    });
  }

  // Always add plain mode (built-in, not a plugin)
  options.push({
    value: 'plain',
    label: 'Plain',
    icon: Terminal,
    color: 'text-muted-foreground',
  });

  return options;
}
