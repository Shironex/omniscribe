# Product

## Register

product

## Users

Developers who run several AI coding assistants (Claude Code and peers) at once and need a single place to watch, steer, and switch between those sessions. They are terminal-native, comfortable with git internals and worktrees, and usually working long focused stretches on a desktop (macOS or Windows), often in a dim room late at night. The job to be done: keep many parallel agent sessions legible at a glance and act on the one that needs attention without losing the others.

## Product Purpose

Omniscribe is a desktop command center for orchestrating parallel AI coding sessions. It spawns and supervises PTY-backed agent sessions, surfaces their live status (Working / Needs input / Done), and wraps them with the supporting tools a developer reaches for mid-flight: a file explorer, a companion code editor, source-control review, and per-project git/worktree management. Success is when a user can run six agents at once and always know, instantly, which one to look at, with the app itself staying out of the way.

## Brand Personality

Warm-charcoal and ember: a forge, not a cockpit. Confident, crafted, and calm under load. Three words: focused, warm, dependable. The emotional goal is quiet command, the feeling of a well-made tool that holds steady while a lot is happening inside it. Voice is plain and direct, never chatty, never alarmist.

## Anti-references

- A generic VS Code reskin. Omniscribe borrows IDE affordances (tabs, explorer, SCM) but is an orchestration surface, not an editor clone, the chrome must not read as "yet another Electron IDE."
- Neon-on-black crypto / "AI" dashboards. No glow, no synthwave gradients, no hero metrics.
- SaaS-cream marketing gradients and identical icon-heading-text card grids.
- Cockpit maximalism: dense gauges and blinking indicators competing for attention. Status is reported, never nagged.

## Design Principles

- **Quiet chrome, loud content.** The terminal, the diff, the code are the subject. Toolbars, rails, and panels recede with muted borders and restrained color so the working surface dominates.
- **Calm under load.** The interface must stay legible with many sessions running. Motion is minimal, color is rationed, and status changes are conveyed without flashing or noise.
- **Token discipline.** Every color, border, and radius comes from the theme token layer so all 10 themes (and user-authored ones) stay coherent. No raw hex, no one-off values in components.
- **Native-feeling desktop.** Respect the OS: frameless drag regions, traffic-light insets, optional native window blur. The app should feel like it belongs on the desktop, not a website in a frame.
- **Earn the accent.** Ember (`--primary`) marks the one thing that matters in a view: the launch action, the active tab, the thing needing input. Its scarcity is what makes it readable.

## Accessibility & Inclusion

Target WCAG AA. Terminal readability is guarded (xterm `minimumContrastRatio` raised to 4.5 when a background image is active). All interactive chrome is keyboard reachable with visible `focus-visible` rings; tab strips and the side-panel switcher implement roving-tabindex `role="tab"` semantics. Status is never conveyed by color alone (icons + counts accompany the status legend). Themes span dark and light with per-theme contrast tuned in oklch.
