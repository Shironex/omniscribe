/**
 * Plugin UI SDK
 *
 * Barrel export providing plugins access to the same design system as core.
 * Plugins import from '@omniscribe/ui' which resolves to this file via Vite alias.
 *
 * Exports: shadcn/ui components, cn utility, and scoped socket helpers for data fetching.
 *
 * Socket access is scoped to safe event namespaces (plugin:*, usage:*) to prevent
 * plugins from emitting arbitrary events to the backend. Raw socket access is not
 * exposed — plugins should use the provided helpers instead.
 */

import { getSocket } from './socket';
import {
  emitAsync as rawEmitAsync,
  emitWithErrorHandling as rawEmitWithErrorHandling,
  emitWithSuccessHandling as rawEmitWithSuccessHandling,
} from './socketHelpers';
import type { EmitOptions, ErrorResponse, SuccessResponse } from './socketHelpers';

/** Event namespace prefixes that plugins are allowed to emit. */
const ALLOWED_EVENT_PREFIXES = ['plugin:', 'usage:'] as const;

function assertAllowedEvent(event: string): void {
  const allowed = ALLOWED_EVENT_PREFIXES.some(prefix => event.startsWith(prefix));
  if (!allowed) {
    const safeEvent = event.length > 100 ? event.slice(0, 100) + '...' : event;
    throw new Error(
      `Plugin SDK: event "${safeEvent}" is not allowed. Plugins may only emit events with these prefixes: ${ALLOWED_EVENT_PREFIXES.join(', ')}`
    );
  }
}

/**
 * Check whether the socket is currently connected.
 * Read-only — does not expose the raw socket instance.
 */
export function isSocketConnected(): boolean {
  try {
    return getSocket().connected;
  } catch {
    return false;
  }
}

/**
 * Scoped emit — validates the event name against the allow-list before emitting.
 * Only events with `plugin:` or `usage:` prefixes are permitted.
 */
export async function emitAsync<TPayload, TResponse>(
  event: string,
  payload: TPayload,
  options: EmitOptions = {}
): Promise<TResponse> {
  assertAllowedEvent(event);
  return rawEmitAsync<TPayload, TResponse>(event, payload, options);
}

/**
 * Scoped emit with error handling — validates the event name before emitting.
 */
export async function emitWithErrorHandling<TPayload, TResponse>(
  event: string,
  payload: TPayload,
  options: EmitOptions = {}
): Promise<TResponse> {
  assertAllowedEvent(event);
  return rawEmitWithErrorHandling<TPayload, TResponse>(event, payload, options);
}

/**
 * Scoped emit with success handling — validates the event name before emitting.
 */
export async function emitWithSuccessHandling<TPayload>(
  event: string,
  payload: TPayload,
  options: EmitOptions = {},
  errorMessage?: string
): Promise<void> {
  assertAllowedEvent(event);
  return rawEmitWithSuccessHandling<TPayload>(event, payload, options, errorMessage);
}

// Re-export types for plugin consumers
export type { EmitOptions, ErrorResponse, SuccessResponse };

// ==========================================
// Utility
// ==========================================
export { cn, type ClassValue } from './utils';

// ==========================================
// UI Components (shadcn/ui)
// ==========================================

// Button
export { Button, buttonVariants, type ButtonProps } from '@/components/ui/button';

// Card
export {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

// Switch
export { Switch } from '@/components/ui/switch';

// Input
export { Input } from '@/components/ui/input';

// Badge
export { Badge, badgeVariants, type BadgeProps } from '@/components/ui/badge';

// Tooltip
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

// Popover
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from '@/components/ui/popover';

// Progress
export { Progress } from '@/components/ui/progress';

// Separator
export { Separator } from '@/components/ui/separator';

// Tabs
export { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// Dialog
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

// Select
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from '@/components/ui/select';

// Slider
export { Slider } from '@/components/ui/slider';

// ==========================================
// Shared components
// ==========================================
export { UsageCard, getStatusInfo } from '@/components/shared/UsageCard';
export { ProgressBar } from '@/components/shared/ProgressBar';
