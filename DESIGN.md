---
name: Omniscribe
description: A desktop command center for orchestrating parallel AI coding sessions.
colors:
  background: 'oklch(0.12 0.012 50)'
  card: 'oklch(0.16 0.015 45)'
  popover: 'oklch(0.1 0.012 50)'
  foreground: 'oklch(0.95 0.018 70)'
  foreground-secondary: 'oklch(0.7 0.015 60)'
  foreground-muted: 'oklch(0.55 0.015 55)'
  primary-ember: 'oklch(0.74 0.16 55)'
  accent-blue: 'oklch(0.66 0.13 250)'
  muted: 'oklch(0.22 0.012 45)'
  border: 'oklch(0.24 0.012 45)'
  border-glass: 'oklch(1 0 0 / 0.08)'
  destructive: 'oklch(0.6 0.25 25)'
  status-success: 'oklch(0.65 0.2 140)'
  status-warning: 'oklch(0.75 0.15 70)'
  status-error: 'oklch(0.65 0.22 25)'
typography:
  display:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: '1.5rem'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: '-0.01em'
  title:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: '0.9375rem'
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: '-0.01em'
  body:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: '0.8125rem'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 500
    letterSpacing: '0.02em'
  mono:
    fontFamily: 'JetBrains Mono, Consolas, monospace'
    fontSize: '0.75rem'
rounded:
  sm: 'calc(0.625rem - 4px)'
  md: 'calc(0.625rem - 2px)'
  lg: '0.625rem'
  xl: 'calc(0.625rem + 4px)'
  full: '9999px'
spacing:
  toolbar-h: '2.25rem'
  rail-collapsed: '3rem'
  rail-expanded: '16.25rem'
components:
  card-glass:
    backgroundColor: '{colors.card}'
    rounded: '{rounded.xl}'
    padding: '16px 20px'
  tab-pill:
    textColor: '{colors.foreground-muted}'
    rounded: '{rounded.md}'
    height: '1.75rem'
    padding: '0 0.625rem'
  tab-pill-active:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
  button-ghost-icon:
    textColor: '{colors.foreground-muted}'
    rounded: '{rounded.md}'
    size: '1.75rem'
  button-primary:
    backgroundColor: '{colors.primary-ember}'
    textColor: '{colors.background}'
    rounded: '{rounded.md}'
---

# Design System: Omniscribe

## 1. Overview

**Creative North Star: "The Forge"**

Omniscribe is a warm-charcoal workshop where a developer keeps several AI agents working at once. The surface is dark, tinted toward ember, and deliberately quiet: the live terminals, diffs, and code are the heat at the center, and every piece of chrome around them, rails, toolbars, panels, steps back so that heat reads clearly. Density is moderate and consistent rather than packed; whitespace is used as rhythm, not as decoration. The system explicitly rejects the generic Electron-IDE look (cold grays, hairline-everywhere borders), neon "AI dashboard" glow, and SaaS-cream gradients. It should feel like a single well-made instrument, not an assembly of widgets.

Color is rationed hard. Neutrals carry almost the entire interface; the ember primary appears only on the one element that matters in a given view (the launch control, the active tab, a thing that needs input). Borders are soft and tinted, never stark. Depth comes mostly from tonal layering of charcoals plus restrained shadows, not from heavy elevation.

**Key Characteristics:**

- Warm charcoal base, ember accent used on <10% of any screen.
- Token-only styling so all 10 themes (plus user themes) stay coherent.
- Quiet, tinted borders; tonal layering over hard elevation.
- Chrome recedes; terminal / editor / diff content dominates.
- Native desktop posture: frameless drag regions, optional window blur.

## 2. Colors

A tinted-neutral palette built in oklch, warm-charcoal grounds with a single ember accent and a cool blue secondary, plus a semantic status set.

### Primary

- **Ember** (`oklch(0.74 0.16 55)`): the brand accent. Launch action, active/running indicators, primary buttons, focus ring. Rationed to the single most important element in a view.

### Secondary

- **Signal Blue** (`oklch(0.66 0.13 250)`): the `--accent` and follow-up action color. Active tab/segment fills (`bg-accent`), informational status, secondary emphasis. Cool counterweight to the ember.

### Neutral

- **Forge Black** (`oklch(0.12 0.012 50)`): app background, every neutral tinted toward the warm hue (never `#000`).
- **Charcoal Surface** (`oklch(0.16 0.015 45)`): cards and raised surfaces, usually at reduced alpha (`bg-card/40`) over the background.
- **Bone** (`oklch(0.95 0.018 70)`): primary text. **Ash** (`oklch(0.7 0.015 60)`) secondary text. **Smoke** (`oklch(0.55 0.015 55)`) muted/placeholder.
- **Border** (`oklch(0.24 0.012 45)`): solid divider. **Border-glass** (`oklch(1 0 0 / 0.08)`): the preferred translucent hairline on glass surfaces, sits correctly over both opaque and translucent backgrounds.

### Status

- **Success** green `oklch(0.65 0.2 140)`, **Warning** gold `oklch(0.75 0.15 70)`, **Error** red `oklch(0.65 0.22 25)`, each with a `/0.2` background companion token.

### Named Rules

**The Rationed Ember Rule.** `--primary` (ember) is reserved for the one action or state that matters most in the current view. If two ember elements compete on one screen, one of them is wrong.

**The Two-Border Rule.** Chrome uses exactly two border vocabularies: `border-border` for solid structural dividers and `border-border-glass` for translucent hairlines on glass/card surfaces. Sibling surfaces in the same unit (e.g. the project rail and its attached panel) must use the same token so they read as one piece. Ad-hoc `border-border/50`-style opacities are drift, not design.

## 3. Typography

**Display / Body Font:** Inter (with system-ui, sans-serif fallback)
**Label / Mono Font:** JetBrains Mono (with Consolas, monospace) for branch names, paths, code, and terminal.

**Character:** Inter handles all UI prose at small, tight sizes with negative tracking on headings; JetBrains Mono signals "machine truth" (paths, refs, terminal output). The pairing is utilitarian and calm, not expressive.

### Hierarchy

- **Display** (600, 1.5rem, 1.2, -0.01em): settings section titles, empty-state headlines.
- **Title** (600, 15px / 0.9375rem, 1.25, -0.01em): card titles, panel headers.
- **Body** (400, 13px / 0.8125rem, 1.5): default UI text, descriptions.
- **Label** (500, 12px / 0.75rem, +0.02em, often UPPERCASE): tab labels, panel-header eyebrows, switcher captions.
- **Mono** (400, 12px): git branch, file paths, terminal content.

### Named Rules

**The Eyebrow Rule.** Panel/section headers use the uppercase 12px label style at `text-muted-foreground`, never a loud heading. The header names the panel; it does not compete with its contents.

## 4. Elevation

Primarily tonal: surfaces are distinguished by stepping charcoal lightness (background → card → popover) rather than by shadow. Shadows are reserved for genuinely floating layers (popovers, dialogs, dropdowns) and come from the theme's warm-tinted shadow scale (`--shadow-sm` through `--shadow-xl`, all tinted toward the forge hue, never neutral black). Glass surfaces (cards, side panels) add a subtle `backdrop-blur-sm` plus a `border-glass` hairline instead of a drop shadow.

### Shadow Vocabulary

- **Resting chrome** (no shadow): toolbars, rails, panels, tabs sit flat, separated by borders and tone only.
- **Floating** (`box-shadow: var(--shadow-lg)`): popovers, command menu, dialogs.

### Named Rules

**The Flat-Chrome Rule.** Structural chrome (rails, toolbars, side panels, tab strips) is flat at rest. Shadow appears only on layers that actually float above the workspace.

## 5. Components

### Buttons

- **Shape:** `rounded-md` (8px) for standard, `rounded-lg` for larger, `rounded-full` only for pills/badges.
- **Ghost icon (dominant in chrome):** 28px (`w-7 h-7`) square, `text-muted-foreground` resting, `hover:text-foreground` with a subtle `hover:bg-accent/40-50` wash. The default toolbar/rail button.
- **Primary:** ember background, `background`-colored text. Used sparingly (launch).
- **Destructive intent:** `text-destructive` with `hover:bg-destructive/10`, never a solid red fill except in confirm dialogs.
- **States:** every interactive element carries `focus-visible:ring-1 focus-visible:ring-ring` and `transition-colors`. Disabled drops to muted with no hover.

### Tabs & Switchers

- Workspace tab pills: `h-7 rounded-md px-2.5`, active = `bg-accent text-accent-foreground`, inactive = `text-muted-foreground hover:bg-accent/50`. Roving `role="tab"` semantics.
- Bottom segmented switcher (Files | Source Control): equal-width segments, active = `bg-accent`, arrow-key navigable.

### Cards (Settings + panels)

- **Glass card:** `rounded-xl border border-border-glass bg-card/40 backdrop-blur-sm`, `px-5 py-4`. Header = tinted icon tile (`size-[38px] rounded-[10px]`, tone-colored) + title + subtitle, divided from the body by a `border-border-glass/60` rule.
- **Never nest cards.** Rows inside a card use `border-border-glass/50` dividers, not inner card borders.

### Panels & Rails

- Project rail + attached side panel share `bg-sidebar` and a single `border-sidebar-border` so they read as one unit. Panel header = uppercase label eyebrow + ghost collapse button. Resize handle is a 1px hit-strip that lights `bg-ring/50` on hover.

### Inputs & Controls

- Inputs/selects: `h-8 text-xs bg-background/40 border-border-glass`, `focus:bg-background/60 transition-colors`.
- Switch track: `bg-foreground/20` when off (theme-proof), ember/primary when on.

### Named Rules

**The Ghost-Default Rule.** Chrome actions are ghost icon buttons by default. A filled button is a deliberate signal of the primary action, not a styling choice.

## 6. Do's and Don'ts

**Do**

- Pull every color, border, and radius from the token layer so all themes stay coherent.
- Keep the ember accent on a single element per view.
- Use `border-border` for structure and `border-border-glass` for glass hairlines, consistently across sibling surfaces.
- Let tone and a single hairline separate surfaces; reach for shadow only when something truly floats.
- Keep panel headers as quiet uppercase eyebrows.

**Don't**

- Hardcode hex or one-off `border-border/NN` opacities that drift between adjacent surfaces.
- Add a second ember element to the same screen.
- Wrap rows or sections in nested cards.
- Use neutral-black shadows, decorative glassmorphism, or glow.
- Let chrome compete with terminal/editor/diff content for attention.
