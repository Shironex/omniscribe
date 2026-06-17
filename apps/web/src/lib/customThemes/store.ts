/**
 * Custom-theme store + persistence + DOM injection registry.
 *
 * Custom themes reuse the *exact* mechanism plugin themes use to skin the app:
 *  1. A base class (`dark` / `light`) is stamped on the document root so the
 *     theme only needs to override the tokens it cares about — everything else
 *     cascades from the base built-in theme.
 *  2. The theme's own CSS custom properties are injected as a
 *     `:root.{class} { ... }` rule so they win over the base.
 *
 * The one wrinkle vs. plugin themes: the *runtime/persisted* theme id is
 * namespaced `custom:{slug}` (so it can never collide with a built-in, plugin,
 * or legacy theme id, and `theme-persistence.ts` can recognize it). But a colon
 * isn't usable in a `:root.X` selector, so the DOM class + injected selector use
 * a sanitized `custom-{slug}` form. {@link customThemeDomClass} owns that map.
 *
 * A single shared `<style id="omniscribe-custom-themes">` element holds the
 * rules for every registered custom theme (one selector block each), mirroring
 * how `applyThemeToDOM` wants a stable element to update.
 *
 * The non-React {@link getCustomTheme} export mirrors `getPluginTheme` so
 * `applyThemeToDOM` can resolve a custom theme's base + DOM class without
 * subscribing to the store.
 */
import { create } from 'zustand';
import { createLogger } from '@omniscribe/shared';
import { devtools } from '@/stores/utils/devtools';
import { isValidThemeId, isValidCssPropertyKey, isSafeCssValue } from '@/lib/plugin-theme-injector';
import { type CustomTheme, customThemeId, customThemeSlug, validateCustomTheme } from './schema';

const logger = createLogger('CustomThemes');

/** localStorage key for the persisted custom-theme array. */
export const CUSTOM_THEMES_STORAGE_KEY = 'omniscribe-custom-themes';

/** Stable id of the single shared style element holding all custom-theme rules. */
export const CUSTOM_THEME_STYLE_ELEMENT_ID = 'omniscribe-custom-themes';

/** Max number of custom themes a user may keep. */
export const MAX_CUSTOM_THEMES = 20;

/** Max serialized size (bytes) of the persisted custom-theme blob. ~200 KB. */
export const MAX_SERIALIZED_BYTES = 200 * 1024;

// ---------------------------------------------------------------------------
// DOM class mapping (runtime id ⇄ DOM-safe selector class)
// ---------------------------------------------------------------------------

/**
 * Map the runtime theme id (`custom:my-theme`) to a DOM-/CSS-safe class
 * (`custom-my-theme`). The slug is already validated to `[a-z][a-z0-9_-]*`, so
 * the result is always a valid class + selector token.
 */
export function customThemeDomClass(runtimeId: string): string {
  return `custom-${customThemeSlug(runtimeId)}`;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function readPersisted(): CustomTheme[] {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Re-validate on load — drop anything that no longer passes (defends against
    // hand-edited localStorage / schema drift).
    const valid: CustomTheme[] = [];
    for (const entry of parsed) {
      const result = validateCustomTheme(entry);
      if (result.ok && result.theme) {
        valid.push(result.theme);
      }
    }
    return valid.slice(0, MAX_CUSTOM_THEMES);
  } catch {
    return [];
  }
}

/** Serialize + size-check + write. Returns false (and logs) if it would exceed the cap. */
function writePersisted(themes: CustomTheme[]): boolean {
  try {
    const serialized = JSON.stringify(themes);
    if (serialized.length > MAX_SERIALIZED_BYTES) {
      logger.warn('writePersisted: serialized themes exceed size cap, not persisting');
      return false;
    }
    localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, serialized);
    return true;
  } catch {
    logger.warn('writePersisted: failed to persist custom themes');
    return false;
  }
}

// ---------------------------------------------------------------------------
// DOM injection
// ---------------------------------------------------------------------------

/** Build the `:root.{domClass} { ... }` rule block for one theme (validated props only). */
function buildRule(theme: CustomTheme): string | null {
  const domClass = customThemeDomClass(customThemeId(theme.id));
  // domClass is `custom-{slug}`; isValidThemeId accepts it (letter-led, hyphens ok).
  if (!isValidThemeId(domClass)) return null;

  const decls = Object.entries(theme.colors)
    .filter(([key, value]) => isValidCssPropertyKey(key) && isSafeCssValue(value))
    .map(([key, value]) => `  ${key}: ${value};`);

  if (decls.length === 0) return null;
  return `:root.${domClass} {\n${decls.join('\n')}\n}`;
}

/**
 * Re-render the single shared style element from the full theme list.
 * Idempotent — safe to call after every mutation.
 */
function syncStyleElement(themes: CustomTheme[]): void {
  if (typeof document === 'undefined') return;

  const css = themes
    .map(buildRule)
    .filter((rule): rule is string => rule !== null)
    .join('\n\n');

  let el = document.getElementById(CUSTOM_THEME_STYLE_ELEMENT_ID) as HTMLStyleElement | null;

  if (css.length === 0) {
    // Nothing to inject — remove the element entirely.
    el?.remove();
    return;
  }

  if (!el) {
    el = document.createElement('style');
    el.id = CUSTOM_THEME_STYLE_ELEMENT_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

// ---------------------------------------------------------------------------
// Module-level registry (non-React, mirrors getPluginTheme)
// ---------------------------------------------------------------------------

/** Snapshot of registered custom themes keyed by *runtime* id (`custom:slug`). */
let registry: Map<string, CustomTheme> = new Map();

function rebuildRegistry(themes: CustomTheme[]): void {
  const next = new Map<string, CustomTheme>();
  for (const t of themes) {
    next.set(customThemeId(t.id), t);
  }
  registry = next;
}

/**
 * Resolve a custom theme by its runtime id (`custom:slug`). **Non-reactive** —
 * mirrors `getPluginTheme`. Used by `applyThemeToDOM` to learn the theme's base
 * (dark/light) and DOM class without subscribing to the store.
 */
export function getCustomTheme(runtimeId: string): CustomTheme | undefined {
  return registry.get(runtimeId);
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

/** Serialize a theme to a pretty JSON string (for download / clipboard). */
export function serializeCustomTheme(theme: CustomTheme): string {
  return JSON.stringify(theme, null, 2);
}

/**
 * Trigger a browser download of a theme's JSON. No-op outside the DOM.
 * Filename is the slug. Object URL is revoked on the next tick.
 */
export function downloadCustomTheme(theme: CustomTheme): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const blob = new Blob([serializeCustomTheme(theme)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${theme.id}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface AddResult {
  ok: boolean;
  errors: string[];
  /** Present when `ok` — the runtime id (`custom:slug`) of the added/updated theme. */
  runtimeId?: string;
}

interface CustomThemesState {
  /** All persisted custom themes, in insertion order. */
  themes: CustomTheme[];
}

interface CustomThemesActions {
  /**
   * Validate + add a theme from an untrusted object (e.g. parsed JSON import).
   * If a theme with the same slug exists, it is replaced (re-import = update).
   * Enforces the count cap. Re-injects CSS + rebuilds the registry on success.
   */
  addFromObject: (input: unknown) => AddResult;
  /** Replace an existing theme (by slug) with a validated update. */
  updateTheme: (input: unknown) => AddResult;
  /** Remove a theme by its bare slug. Re-injects CSS + rebuilds the registry. */
  removeTheme: (slug: string) => void;
  /** Look up a theme by bare slug (reactive read via selector preferred). */
  getBySlug: (slug: string) => CustomTheme | undefined;
}

export type CustomThemesStore = CustomThemesState & CustomThemesActions;

/** Commit a new theme list: persist, sync DOM, rebuild registry, update state. */
function commit(
  set: (partial: Partial<CustomThemesState>, replace: undefined, action: string) => void,
  themes: CustomTheme[],
  action: string
): void {
  writePersisted(themes);
  syncStyleElement(themes);
  rebuildRegistry(themes);
  set({ themes }, undefined, action);
}

export const useCustomThemesStore = create<CustomThemesStore>()(
  devtools(
    (set, get) => {
      const initial = typeof document !== 'undefined' ? readPersisted() : [];
      // Hydrate the DOM + registry on store creation so a persisted custom
      // theme can be applied on first paint (parallels applyThemeToDOM's
      // initial run in useSettingsStore).
      if (typeof document !== 'undefined') {
        syncStyleElement(initial);
        rebuildRegistry(initial);
      }

      const upsert = (input: unknown, action: string): AddResult => {
        const result = validateCustomTheme(input);
        if (!result.ok || !result.theme) {
          return { ok: false, errors: result.errors };
        }
        const theme = result.theme;
        const existing = get().themes;
        const idx = existing.findIndex(t => t.id === theme.id);

        let next: CustomTheme[];
        if (idx >= 0) {
          // Replace in place (update / re-import).
          next = existing.slice();
          next[idx] = theme;
        } else {
          if (existing.length >= MAX_CUSTOM_THEMES) {
            return {
              ok: false,
              errors: [
                `You can keep at most ${MAX_CUSTOM_THEMES} custom themes. Delete one first.`,
              ],
            };
          }
          next = [...existing, theme];
        }

        // Guard serialized-size cap before committing.
        if (JSON.stringify(next).length > MAX_SERIALIZED_BYTES) {
          return {
            ok: false,
            errors: ['Custom themes are too large to store. Delete one first.'],
          };
        }

        commit(set, next, action);
        return { ok: true, errors: [], runtimeId: customThemeId(theme.id) };
      };

      return {
        themes: initial,

        addFromObject: input => upsert(input, 'customThemes/add'),
        updateTheme: input => upsert(input, 'customThemes/update'),

        removeTheme: (slug: string) => {
          const next = get().themes.filter(t => t.id !== slug);
          if (next.length === get().themes.length) return; // nothing removed
          commit(set, next, 'customThemes/remove');
        },

        getBySlug: (slug: string) => get().themes.find(t => t.id === slug),
      };
    },
    { name: 'customThemes' }
  )
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectCustomThemes = (state: CustomThemesStore) => state.themes;
