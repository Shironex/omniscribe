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

/**
 * Calculate grid layout for a given number of sessions.
 */
export function getLayout(count: number): { rows: number[][]; columns: number } {
  switch (count) {
    case 0:
      return { rows: [], columns: 0 };
    case 1:
      return { rows: [[0]], columns: 1 };
    case 2:
      return { rows: [[0, 1]], columns: 2 };
    case 3:
      return { rows: [[0, 1, 2]], columns: 3 };
    case 4:
      return {
        rows: [
          [0, 1],
          [2, 3],
        ],
        columns: 2,
      };
    case 5:
      return {
        rows: [
          [0, 1, 2],
          [3, 4],
        ],
        columns: 3,
      };
    case 6:
      return {
        rows: [
          [0, 1, 2],
          [3, 4, 5],
        ],
        columns: 3,
      };
    case 7:
      return { rows: [[0, 1, 2], [3, 4, 5], [6]], columns: 3 };
    case 8:
      return {
        rows: [
          [0, 1, 2],
          [3, 4, 5],
          [6, 7],
        ],
        columns: 3,
      };
    case 9:
      return {
        rows: [
          [0, 1, 2],
          [3, 4, 5],
          [6, 7, 8],
        ],
        columns: 3,
      };
    case 10:
      return {
        rows: [
          [0, 1, 2, 3],
          [4, 5, 6, 7],
          [8, 9],
        ],
        columns: 4,
      };
    case 11:
      return {
        rows: [
          [0, 1, 2, 3],
          [4, 5, 6, 7],
          [8, 9, 10],
        ],
        columns: 4,
      };
    case 12:
      return {
        rows: [
          [0, 1, 2, 3],
          [4, 5, 6, 7],
          [8, 9, 10, 11],
        ],
        columns: 4,
      };
    default:
      return {
        rows: [
          [0, 1, 2, 3],
          [4, 5, 6, 7],
          [8, 9, 10, 11],
        ],
        columns: 4,
      };
  }
}
