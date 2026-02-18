/**
 * Strip ANSI escape codes from text.
 *
 * Handles CSI sequences, OSC sequences, other ESC sequences,
 * carriage returns, backspaces, and remaining control characters.
 */
export function stripAnsiCodes(text: string): string {
  /* eslint-disable no-control-regex */
  let clean = text
    // CSI sequences
    .replace(/\x1B\[[0-9;?]*[A-Za-z@]/g, '')
    // OSC sequences
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)?/g, '')
    // Other ESC sequences
    .replace(/\x1B[A-Za-z]/g, '')
    // Carriage returns
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Handle backspaces (single-pass)
  const chars: string[] = [];
  for (const char of clean) {
    if (char === '\x08') {
      chars.pop();
    } else {
      chars.push(char);
    }
  }
  clean = chars.join('');

  // Strip remaining control characters (except newline)
  clean = clean.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
  /* eslint-enable no-control-regex */

  return clean;
}
