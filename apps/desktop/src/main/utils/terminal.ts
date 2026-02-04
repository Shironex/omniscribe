import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Open an external terminal and run a command
 */
export async function openTerminalWithCommand(command: string): Promise<void> {
  const platform = process.platform;

  let terminalCommand: string;

  if (platform === 'win32') {
    // Windows: Open PowerShell with the command
    // Use -NoExit to keep the window open after the command completes
    const escapedCommand = command.replace(/"/g, '\\"');
    terminalCommand = `start powershell -NoExit -Command "${escapedCommand}"`;
  } else if (platform === 'darwin') {
    // macOS: Use osascript to open Terminal.app
    const escapedCommand = command.replace(/"/g, '\\"').replace(/'/g, "'\\''");
    terminalCommand = `osascript -e 'tell app "Terminal" to do script "${escapedCommand}"' -e 'tell app "Terminal" to activate'`;
  } else {
    // Linux: Try common terminal emulators
    const escapedCommand = command.replace(/"/g, '\\"');
    // Try gnome-terminal first, then konsole, then xterm as fallback
    terminalCommand = `gnome-terminal -- bash -c "${escapedCommand}; exec bash" 2>/dev/null || konsole -e bash -c "${escapedCommand}; exec bash" 2>/dev/null || xterm -hold -e "${escapedCommand}"`;
  }

  await execAsync(terminalCommand);
}
