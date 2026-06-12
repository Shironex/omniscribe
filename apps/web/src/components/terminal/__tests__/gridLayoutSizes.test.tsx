import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

/**
 * react-resizable-panels v4 treats a bare-number size prop as a PIXEL flex-basis;
 * percent sizing requires STRINGS ("55%"). The terminal grid layouts must pass
 * percent strings so panels size proportionally rather than collapsing to a few
 * pixels (the same class of bug fixed for the editor split in cc50081e).
 *
 * These tests capture every Panel's size props and assert they are percent
 * strings whose numeric value preserves the equal-grow proportions exactly.
 */

interface CapturedPanel {
  id: unknown;
  defaultSize: unknown;
  minSize: unknown;
  maxSize: unknown;
}

const panels: CapturedPanel[] = [];

vi.mock('react-resizable-panels', () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Panel: ({
    id,
    defaultSize,
    minSize,
    maxSize,
    children,
  }: {
    id?: unknown;
    defaultSize?: unknown;
    minSize?: unknown;
    maxSize?: unknown;
    children?: React.ReactNode;
  }) => {
    panels.push({ id, defaultSize, minSize, maxSize });
    return <div>{children}</div>;
  },
}));

import { ColumnPrimaryLayout } from '../ColumnPrimaryLayout';
import { RowPrimaryLayout } from '../RowPrimaryLayout';
import type { TerminalSession } from '../TerminalHeader';

function sessions(n: number): TerminalSession[] {
  return Array.from(
    { length: n },
    (_, i) => ({ id: `s${i}`, sessionId: i }) as unknown as TerminalSession
  );
}

const PERCENT = /^\d+(\.\d+)?%$/;

/** Parse the numeric value out of a "N%" string. */
function pct(value: unknown): number {
  expect(value).toMatch(PERCENT);
  return parseFloat(String(value));
}

beforeEach(() => {
  panels.length = 0;
});

describe('grid layout RRP size units', () => {
  describe('ColumnPrimaryLayout', () => {
    it('passes percent-string sizes for a 2-column even split (50/50 each axis)', () => {
      render(
        <ColumnPrimaryLayout
          columns={[
            [0, 1],
            [2, 3],
          ]}
          sessions={sessions(4)}
          onLayoutChange={() => {}}
          renderTerminalCard={() => <div />}
        />
      );

      // 2 column panels + 2 cells per column = 6 panels total.
      expect(panels).toHaveLength(6);
      for (const p of panels) {
        expect(p.defaultSize).toMatch(PERCENT);
        expect(p.minSize).toBe('20%');
        // maxSize intentionally unset (defaults to 100%).
        expect(p.maxSize).toBeUndefined();
      }

      const columnPanels = panels.filter(p => String(p.id).startsWith('column-'));
      const cellPanels = panels.filter(p => String(p.id).startsWith('cell-'));
      expect(columnPanels).toHaveLength(2);
      expect(cellPanels).toHaveLength(4);

      // Equal-grow proportions preserved exactly: 100/2 = 50 per column,
      // 100/2 = 50 per cell.
      for (const p of columnPanels) expect(pct(p.defaultSize)).toBeCloseTo(50, 10);
      for (const p of cellPanels) expect(pct(p.defaultSize)).toBeCloseTo(50, 10);
    });

    it('preserves uneven proportions (3 columns → 33.333…% each)', () => {
      render(
        <ColumnPrimaryLayout
          columns={[[0], [1], [2]]}
          sessions={sessions(3)}
          onLayoutChange={() => {}}
          renderTerminalCard={() => <div />}
        />
      );

      const columnPanels = panels.filter(p => String(p.id).startsWith('column-'));
      expect(columnPanels).toHaveLength(3);
      for (const p of columnPanels) expect(pct(p.defaultSize)).toBeCloseTo(100 / 3, 10);
    });
  });

  describe('RowPrimaryLayout', () => {
    it('passes percent-string sizes for a 2-row even split', () => {
      render(
        <RowPrimaryLayout
          rows={[
            [0, 1],
            [2, 3],
          ]}
          sessions={sessions(4)}
          onLayoutChange={() => {}}
          renderTerminalCard={() => <div />}
        />
      );

      expect(panels).toHaveLength(6);
      for (const p of panels) {
        expect(p.defaultSize).toMatch(PERCENT);
        expect(p.minSize).toBe('20%');
        expect(p.maxSize).toBeUndefined();
      }

      const rowPanels = panels.filter(p => String(p.id).startsWith('row-'));
      const cellPanels = panels.filter(p => String(p.id).startsWith('cell-'));
      expect(rowPanels).toHaveLength(2);
      expect(cellPanels).toHaveLength(4);
      for (const p of rowPanels) expect(pct(p.defaultSize)).toBeCloseTo(50, 10);
      for (const p of cellPanels) expect(pct(p.defaultSize)).toBeCloseTo(50, 10);
    });
  });
});
