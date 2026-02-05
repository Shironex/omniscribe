# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Omniscribe, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email us at: **support@taketach.pl**

Include the following in your report:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response Timeline

- We will acknowledge your report within **48 hours**
- We will provide an initial assessment within **7 days**
- We will work on a fix and coordinate disclosure

## Scope

The following are in scope:

- Electron main process security (IPC, preload, context isolation)
- Content Security Policy bypasses
- Command injection via terminal/PTY
- Input validation issues in WebSocket handlers
- Dependency vulnerabilities with known exploits

## Security Measures

Omniscribe implements the following security measures:

- `nodeIntegration: false` and `contextIsolation: true` in Electron
- Content Security Policy (CSP) for the renderer process
- CORS restricted to localhost origins
- Input validation and shell escaping for CLI commands
- External links opened in system browser (not in-app)

## Thank You

We appreciate the security research community's efforts in helping keep Omniscribe safe.
