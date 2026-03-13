/**
 * Build column arrays from row layout data.
 */
export function buildColumns(rows: number[][], columnsCount: number): number[][] {
  const columns: number[][] = Array.from({ length: columnsCount }, () => []);
  for (const row of rows) {
    row.forEach((sessionIndex, columnIndex) => {
      if (columns[columnIndex]) {
        columns[columnIndex].push(sessionIndex);
      }
    });
  }
  return columns.filter(column => column.length > 0);
}

/** Minimum width (in pixels) each terminal column should have to remain usable. */
const MIN_TERMINAL_WIDTH = 280;

/**
 * Calculate grid layout for a given number of sessions.
 * When `containerWidth` is provided, columns are capped so each terminal
 * is at least `MIN_TERMINAL_WIDTH` pixels wide.
 */
export function getLayout(
  count: number,
  containerWidth?: number
): { rows: number[][]; columns: number } {
  let layout: { rows: number[][]; columns: number };

  switch (count) {
    case 0:
      return { rows: [], columns: 0 };
    case 1:
      return { rows: [[0]], columns: 1 };
    case 2:
      layout = { rows: [[0, 1]], columns: 2 };
      break;
    case 3:
      layout = { rows: [[0, 1, 2]], columns: 3 };
      break;
    case 4:
      layout = {
        rows: [
          [0, 1],
          [2, 3],
        ],
        columns: 2,
      };
      break;
    case 5:
      layout = {
        rows: [
          [0, 1, 2],
          [3, 4],
        ],
        columns: 3,
      };
      break;
    case 6:
      layout = {
        rows: [
          [0, 1, 2],
          [3, 4, 5],
        ],
        columns: 3,
      };
      break;
    case 7:
      layout = { rows: [[0, 1, 2], [3, 4, 5], [6]], columns: 3 };
      break;
    case 8:
      layout = {
        rows: [
          [0, 1, 2],
          [3, 4, 5],
          [6, 7],
        ],
        columns: 3,
      };
      break;
    case 9:
      layout = {
        rows: [
          [0, 1, 2],
          [3, 4, 5],
          [6, 7, 8],
        ],
        columns: 3,
      };
      break;
    case 10:
      layout = {
        rows: [
          [0, 1, 2, 3],
          [4, 5, 6, 7],
          [8, 9],
        ],
        columns: 4,
      };
      break;
    case 11:
      layout = {
        rows: [
          [0, 1, 2, 3],
          [4, 5, 6, 7],
          [8, 9, 10],
        ],
        columns: 4,
      };
      break;
    case 12:
      layout = {
        rows: [
          [0, 1, 2, 3],
          [4, 5, 6, 7],
          [8, 9, 10, 11],
        ],
        columns: 4,
      };
      break;
    default:
      layout = {
        rows: [
          [0, 1, 2, 3],
          [4, 5, 6, 7],
          [8, 9, 10, 11],
        ],
        columns: 4,
      };
      break;
  }

  return capColumns(layout, containerWidth);
}

/**
 * Reduce column count when the container is too narrow for the desired layout.
 * Redistributes items into fewer columns while preserving order.
 */
function capColumns(
  layout: { rows: number[][]; columns: number },
  containerWidth?: number
): { rows: number[][]; columns: number } {
  if (!containerWidth || containerWidth <= 0) return layout;

  const maxCols = Math.max(1, Math.floor(containerWidth / MIN_TERMINAL_WIDTH));
  if (maxCols >= layout.columns) return layout;

  // Flatten all items and redistribute into fewer columns
  const items = layout.rows.flat();
  const rows: number[][] = [];
  for (let i = 0; i < items.length; i += maxCols) {
    rows.push(items.slice(i, i + maxCols));
  }
  return { rows, columns: maxCols };
}
