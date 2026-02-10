import { describe, it, expect } from 'vitest';
import { getLayout, buildColumns } from '../terminal-layout';

describe('getLayout', () => {
  it('returns empty layout for 0 sessions', () => {
    const result = getLayout(0);
    expect(result).toEqual({ rows: [], columns: 0 });
  });

  it('returns a single cell for 1 session', () => {
    const result = getLayout(1);
    expect(result).toEqual({ rows: [[0]], columns: 1 });
  });

  it('returns a single row of 2 for 2 sessions', () => {
    const result = getLayout(2);
    expect(result).toEqual({ rows: [[0, 1]], columns: 2 });
  });

  it('returns a single row of 3 for 3 sessions', () => {
    const result = getLayout(3);
    expect(result).toEqual({ rows: [[0, 1, 2]], columns: 3 });
  });

  it('returns a 2x2 grid for 4 sessions', () => {
    const result = getLayout(4);
    expect(result).toEqual({
      rows: [
        [0, 1],
        [2, 3],
      ],
      columns: 2,
    });
  });

  it('returns 3+2 layout for 5 sessions', () => {
    const result = getLayout(5);
    expect(result).toEqual({
      rows: [
        [0, 1, 2],
        [3, 4],
      ],
      columns: 3,
    });
  });

  it('returns 3+3 layout for 6 sessions', () => {
    const result = getLayout(6);
    expect(result).toEqual({
      rows: [
        [0, 1, 2],
        [3, 4, 5],
      ],
      columns: 3,
    });
  });

  it('returns 3+3+1 layout for 7 sessions', () => {
    const result = getLayout(7);
    expect(result).toEqual({
      rows: [[0, 1, 2], [3, 4, 5], [6]],
      columns: 3,
    });
  });

  it('returns 3+3+2 layout for 8 sessions', () => {
    const result = getLayout(8);
    expect(result).toEqual({
      rows: [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7],
      ],
      columns: 3,
    });
  });

  it('returns 3x3 grid for 9 sessions', () => {
    const result = getLayout(9);
    expect(result).toEqual({
      rows: [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
      ],
      columns: 3,
    });
  });

  it('returns 4+4+2 layout for 10 sessions', () => {
    const result = getLayout(10);
    expect(result).toEqual({
      rows: [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
        [8, 9],
      ],
      columns: 4,
    });
  });

  it('returns 4+4+3 layout for 11 sessions', () => {
    const result = getLayout(11);
    expect(result).toEqual({
      rows: [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
        [8, 9, 10],
      ],
      columns: 4,
    });
  });

  it('returns 4x3 grid for 12 sessions', () => {
    const result = getLayout(12);
    expect(result).toEqual({
      rows: [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
        [8, 9, 10, 11],
      ],
      columns: 4,
    });
  });

  it('returns the 12-session layout for counts above 12 (default case)', () => {
    const result = getLayout(13);
    expect(result).toEqual({
      rows: [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
        [8, 9, 10, 11],
      ],
      columns: 4,
    });

    // Also verify much higher counts
    expect(getLayout(100)).toEqual(getLayout(13));
  });
});

describe('buildColumns', () => {
  it('builds columns from a single row', () => {
    const result = buildColumns([[0, 1, 2]], 3);
    expect(result).toEqual([[0], [1], [2]]);
  });

  it('builds columns from multiple rows', () => {
    const result = buildColumns(
      [
        [0, 1],
        [2, 3],
      ],
      2
    );
    expect(result).toEqual([
      [0, 2],
      [1, 3],
    ]);
  });

  it('handles rows with fewer items than columns', () => {
    const result = buildColumns([[0, 1, 2], [3, 4], [5]], 3);
    expect(result).toEqual([[0, 3, 5], [1, 4], [2]]);
  });

  it('filters out empty columns', () => {
    const result = buildColumns([[0]], 3);
    expect(result).toEqual([[0]]);
  });

  it('returns empty array for empty rows', () => {
    const result = buildColumns([], 3);
    expect(result).toEqual([]);
  });

  it('works with the 4-column 12-session grid', () => {
    const layout = getLayout(12);
    const columns = buildColumns(layout.rows, layout.columns);
    expect(columns).toEqual([
      [0, 4, 8],
      [1, 5, 9],
      [2, 6, 10],
      [3, 7, 11],
    ]);
  });
});
