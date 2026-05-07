import { useId, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Tone tints applied to the icon tile in the card header. Mirrors the
 * shiroani settings card system so per-section accents stay consistent.
 */
type SettingsCardTone = 'primary' | 'green' | 'gold' | 'blue' | 'orange' | 'muted' | 'destructive';

interface SettingsCardProps {
  children?: React.ReactNode;
  className?: string;
  /** Icon for the section header */
  icon?: LucideIcon;
  /** Title shown next to the icon */
  title?: string;
  /** Subtitle shown below the title */
  subtitle?: ReactNode;
  /** Optional tint for the icon tile. */
  tone?: SettingsCardTone;
  /** Optional extra content rendered inside the header, right-aligned. */
  headerAccessory?: ReactNode;
  /** Custom header icon slot — replaces the default tinted icon tile. */
  iconSlot?: ReactNode;
}

const TONE_TILE: Record<SettingsCardTone, string> = {
  primary: 'bg-primary/15 border-primary/30 text-primary',
  green:
    'bg-[oklch(0.78_0.15_140/0.14)] border-[oklch(0.78_0.15_140/0.32)] text-[oklch(0.78_0.15_140)]',
  gold: 'bg-[oklch(0.8_0.14_70/0.14)] border-[oklch(0.8_0.14_70/0.32)] text-[oklch(0.8_0.14_70)]',
  blue: 'bg-[oklch(0.8_0.13_210/0.14)] border-[oklch(0.8_0.13_210/0.32)] text-[oklch(0.8_0.13_210)]',
  orange:
    'bg-[oklch(0.74_0.18_40/0.14)] border-[oklch(0.74_0.18_40/0.32)] text-[oklch(0.74_0.18_40)]',
  muted: 'bg-muted/25 border-border-glass text-muted-foreground',
  destructive: 'bg-destructive/15 border-destructive/30 text-destructive',
};

export function SettingsCard({
  children,
  className,
  icon: Icon,
  title,
  subtitle,
  tone = 'primary',
  headerAccessory,
  iconSlot,
}: SettingsCardProps) {
  const hasHeader = Boolean((Icon || iconSlot) && title);
  const isDestructive = tone === 'destructive';

  return (
    <div
      className={cn(
        'relative rounded-xl border backdrop-blur-sm px-5 py-4',
        isDestructive
          ? 'border-destructive/25 bg-destructive/[0.06]'
          : 'border-border-glass bg-card/40',
        className
      )}
    >
      {hasHeader && (
        <div
          className={cn(
            'flex items-start gap-3',
            children &&
              cn(
                'mb-3.5 pb-3 border-b',
                isDestructive ? 'border-destructive/15' : 'border-border-glass/60'
              )
          )}
        >
          {iconSlot ??
            (Icon && (
              <div
                className={cn(
                  'grid place-items-center flex-shrink-0 size-[38px] rounded-[10px] border',
                  TONE_TILE[tone]
                )}
              >
                <Icon className="w-[18px] h-[18px]" />
              </div>
            ))}
          <div className="min-w-0 flex-1 pt-0.5">
            <h3
              className={cn(
                'font-semibold text-[15px] leading-tight tracking-[-0.01em]',
                isDestructive ? 'text-destructive' : 'text-foreground'
              )}
            >
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-[12px] text-muted-foreground leading-snug">{subtitle}</p>
            )}
          </div>
          {headerAccessory && (
            <div className="flex items-center flex-shrink-0 pt-0.5">{headerAccessory}</div>
          )}
        </div>
      )}
      {children && <div className="space-y-3.5">{children}</div>}
    </div>
  );
}

// ── Row primitives ──────────────────────────────────────────────────

export interface SettingsRowProps {
  children: ReactNode;
  className?: string;
  /** Stack label above control instead of side-by-side. */
  stacked?: boolean;
  /** Render a top divider (used inside multi-row groups). */
  divider?: boolean;
}

export function SettingsRow({ children, className, stacked, divider }: SettingsRowProps) {
  return (
    <div
      className={cn(
        stacked ? 'flex flex-col gap-2' : 'flex items-center justify-between gap-4',
        divider && 'border-t border-border-glass/50 pt-3.5',
        className
      )}
    >
      {children}
    </div>
  );
}

export interface SettingsRowLabelProps {
  title: ReactNode;
  description?: ReactNode;
  id?: string;
  className?: string;
}

export function SettingsRowLabel({ title, description, id, className }: SettingsRowLabelProps) {
  return (
    <div className={cn('min-w-0 flex-1', className)}>
      <p id={id} className="text-[13px] font-semibold leading-snug text-foreground">
        {title}
      </p>
      {description && (
        <p className="mt-0.5 text-[12px] text-muted-foreground/85 leading-snug">{description}</p>
      )}
    </div>
  );
}

// ── Composite row primitives ────────────────────────────────────────

export interface SettingsToggleRowProps {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
  divider?: boolean;
  className?: string;
}

export function SettingsToggleRow({
  id,
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
  divider,
  className,
}: SettingsToggleRowProps) {
  const autoId = useId();
  const labelId = id ?? autoId;
  return (
    <SettingsRow divider={divider} className={className}>
      <SettingsRowLabel id={labelId} title={title} description={description} />
      <Switch
        aria-labelledby={labelId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </SettingsRow>
  );
}

export interface SettingsSelectOption {
  value: string;
  label: ReactNode;
}

export interface SettingsSelectRowProps {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<SettingsSelectOption>;
  disabled?: boolean;
  divider?: boolean;
  className?: string;
  triggerClassName?: string;
}

export function SettingsSelectRow({
  id,
  title,
  description,
  value,
  onValueChange,
  options,
  disabled,
  divider,
  className,
  triggerClassName,
}: SettingsSelectRowProps) {
  const autoId = useId();
  const labelId = id ?? autoId;
  return (
    <SettingsRow divider={divider} className={className}>
      <SettingsRowLabel id={labelId} title={title} description={description} />
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          aria-labelledby={labelId}
          className={cn(
            'h-8 text-xs bg-background/40 border-border-glass focus:bg-background/60 transition-colors',
            triggerClassName ?? 'w-44'
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(option => (
            <SelectItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsRow>
  );
}
