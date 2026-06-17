import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Palette } from 'lucide-react';
import { ThemeGrid } from './ThemeGrid';
import type { ThemeOption } from '@/lib/theme';

afterEach(cleanup);

/**
 * Minimal swatch fixtures — distinct labels so we can assert each one survives
 * a narrow layout without being clipped or merged ("ForgCarbEmbe" mash bug).
 */
const fixtures: ThemeOption[] = [
  {
    value: 'forge',
    label: 'Forge',
    Icon: Palette,
    testId: 'forge-mode-button',
    isDark: true,
    color: '#e89143',
    swatch: { bg: '#0f0e0d', surface: '#1a1714', primary: '#e89143', accent: '#5b9cf2' },
  },
  {
    value: 'carbon',
    label: 'Carbon',
    Icon: Palette,
    testId: 'carbon-mode-button',
    isDark: true,
    color: '#7aa2f7',
    swatch: { bg: '#0d0d0d', surface: '#1a1a1a', primary: '#7aa2f7', accent: '#bb9af7' },
  },
  {
    value: 'ember',
    label: 'Ember',
    Icon: Palette,
    testId: 'ember-mode-button',
    isDark: true,
    color: '#ff6b4a',
    swatch: { bg: '#100c0a', surface: '#1e1714', primary: '#ff6b4a', accent: '#ffb86c' },
  },
  {
    value: 'iceberg',
    label: 'Iceberg',
    Icon: Palette,
    testId: 'iceberg-mode-button',
    isDark: true,
    color: '#84a0c6',
    swatch: { bg: '#0e1018', surface: '#1a1d2b', primary: '#84a0c6', accent: '#89b8c2' },
  },
];

function renderGrid(active = 'forge') {
  return render(<ThemeGrid themes={fixtures} activeTheme={active} onSelect={vi.fn()} />);
}

describe('ThemeGrid responsive layout', () => {
  it('lays out columns via container queries, not viewport breakpoints', () => {
    const { container } = renderGrid();
    const grid = container.querySelector('.grid');
    expect(grid).not.toBeNull();

    const cls = grid!.className;
    // Two columns is the floor — keeps labels intact down to the narrowest
    // settings dock width.
    expect(cls).toContain('grid-cols-2');
    // Container-query variants scale columns to the settings content column,
    // which is what actually narrows when the side panel is open.
    expect(cls).toContain('@md/settings:grid-cols-3');
    expect(cls).toContain('@2xl/settings:grid-cols-4');
  });

  it('does not use window-width breakpoints that ignore the side panel', () => {
    const { container } = renderGrid();
    const grid = container.querySelector('.grid');
    const cls = grid!.className;
    // Regression guard: viewport breakpoints fire on window width and caused
    // the swatch mash when the window was wide but the dock was narrow.
    expect(cls).not.toContain('sm:grid-cols-3');
    expect(cls).not.toContain('md:grid-cols-4');
  });

  it('renders every swatch label in full (no clipped/merged labels)', () => {
    const { getByText } = renderGrid();
    for (const opt of fixtures) {
      expect(getByText(opt.label)).toBeTruthy();
    }
  });

  it('preserves per-swatch test-ids and pressed state', () => {
    const { container } = renderGrid('carbon');
    for (const opt of fixtures) {
      const btn = container.querySelector(`[data-testid="${opt.testId}"]`);
      expect(btn).not.toBeNull();
      expect(btn!.getAttribute('aria-pressed')).toBe(String(opt.value === 'carbon'));
    }
  });
});
