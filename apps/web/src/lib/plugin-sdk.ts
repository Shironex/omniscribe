/**
 * Plugin UI SDK
 *
 * Barrel export providing plugins access to the same design system as core.
 * Plugins import from '@omniscribe/ui' which resolves to this file via Vite alias.
 *
 * Exports: shadcn/ui components, cn utility, and socket helpers for data fetching.
 */

// ==========================================
// Utility
// ==========================================
export { cn, type ClassValue } from './utils';

// ==========================================
// Socket helpers for data fetching
// ==========================================
export { getSocket } from './socket';
export { emitAsync, emitWithErrorHandling, emitWithSuccessHandling } from './socketHelpers';
export type { EmitOptions, ErrorResponse, SuccessResponse } from './socketHelpers';

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
