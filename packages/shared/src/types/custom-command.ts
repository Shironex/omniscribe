/**
 * Per-project user-defined custom command.
 *
 * Each command is a label + icon + raw shell command. When triggered,
 * the backend spawns a fresh plain terminal session in the project's
 * directory and writes the command to it.
 *
 * Commands are stored per-project (keyed by normalized project path) in
 * the workspace electron-store. They are NOT a kind of QuickAction —
 * QuickActions are global and target an existing AI session's terminal.
 */
export interface CustomCommand {
  /** Stable unique identifier (uuid). */
  id: string;
  /** User-visible label rendered in menus and tile names. */
  label: string;
  /** Lucide icon name (e.g. "Play", "Hammer"). Falls back to a default if unknown. */
  icon: string;
  /** Raw shell command string. May contain newlines. Passed verbatim to the PTY. */
  command: string;
  /** ISO timestamp when the command was created. */
  createdAt: string;
  /** ISO timestamp of the most recent edit. */
  updatedAt: string;
}

/**
 * Fields the user provides when creating a custom command.
 * The backend assigns id and timestamps.
 */
export type CustomCommandInput = Pick<CustomCommand, 'label' | 'icon' | 'command'>;

/**
 * Fields a user can edit on an existing custom command.
 */
export type CustomCommandUpdate = Partial<Pick<CustomCommand, 'label' | 'icon' | 'command'>>;
