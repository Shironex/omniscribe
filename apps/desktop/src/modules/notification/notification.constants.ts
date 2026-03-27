import type { NotificationSettings } from '@omniscribe/shared';

/** Debounce window in ms — batch rapid status changes into a single notification */
export const DEBOUNCE_WINDOW_MS = 3_000;

/** Maximum notifications per minute before switching to summary mode */
export const RATE_LIMIT_PER_MINUTE = 10;

/** Rate limit window in ms (1 minute) */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** Maximum body byte length for macOS (256 bytes) */
export const MAX_BODY_BYTES = 200;

/** Notification event type for internal routing */
export type NotificationEventType = keyof NotificationSettings['events'];
