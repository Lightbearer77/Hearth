// Month grid sizing. Pure + tested (test/run-tests.mjs).
//
// Kept out of MonthView so the fit invariant can be asserted directly:
// seven cells plus six gaps must NEVER exceed the content width. React Native
// rounds each child to the device pixel grid, so a fractional cell width can
// round up, overflow the row by a hair, and make flex-wrap kick the seventh
// cell to the next line — the Sunday column silently stops populating and
// every day after the first Sunday shifts one column left.

export const CELL_GAP = 2;
export const HORIZONTAL_PADDING = 8;
export const COLUMNS = 7;

export function monthCellSize(width, opts = {}) {
  const {
    gap = CELL_GAP,
    padding = HORIZONTAL_PADDING,
    columns = COLUMNS,
  } = opts;
  const content = width - padding * 2 - gap * (columns - 1);
  return Math.max(0, Math.floor(content / columns));
}

export function monthRowWidth(cellSize, opts = {}) {
  const { gap = CELL_GAP, columns = COLUMNS } = opts;
  return cellSize * columns + gap * (columns - 1);
}
