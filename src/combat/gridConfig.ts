// Battlefield grid constants + pure coordinate math, shared by InputManager
// (click/hover -> cell), GameManager/CombatEngine (occupancy), and
// GameRenderer (grid lines, snapped placeholder). No dependency on any of
// those modules - keeps this safely importable from all of them without
// creating a cycle.

/** Pixel size of one grid cell. 60 rather than the more common 64 so GRID_COLS x GRID_ROWS divides the 960x540 canvas exactly (see CANVAS_WIDTH/HEIGHT below), instead of leaving a partial cell at the edge. */
export const CELL_SIZE = 60;
export const GRID_COLS = 16;
export const GRID_ROWS = 9;

export const GRID_WIDTH = CELL_SIZE * GRID_COLS;
export const GRID_HEIGHT = CELL_SIZE * GRID_ROWS;

// Matches combat-test.html's canvas width/height attributes - not read from
// the DOM, so if that markup's canvas size ever changes this must be
// updated to match or the grid will stop lining up with the drawn
// background/sprites.
export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 540;

// Centers the grid inside the canvas; both come out to 0 at the constants
// above (960x540 divides evenly into 16x9 cells of 60px), but the formula
// stays correct if CELL_SIZE/GRID_COLS/GRID_ROWS are ever retuned to not
// fill the canvas exactly.
export const GRID_OFFSET_X = (CANVAS_WIDTH - GRID_WIDTH) / 2;
export const GRID_OFFSET_Y = (CANVAS_HEIGHT - GRID_HEIGHT) / 2;

export interface GridCell {
  col: number;
  row: number;
}

export function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

export function isWithinGrid(col: number, row: number): boolean {
  return col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS;
}

/** Floors a world/canvas-space point into the grid cell containing it - null if the point falls outside the grid entirely (e.g. in the centering margin, if any). */
export function worldToGridCell(worldX: number, worldY: number): GridCell | null {
  const col = Math.floor((worldX - GRID_OFFSET_X) / CELL_SIZE);
  const row = Math.floor((worldY - GRID_OFFSET_Y) / CELL_SIZE);
  return isWithinGrid(col, row) ? { col, row } : null;
}

/** World/canvas-space coordinate of a cell's center - what a hero placed in that cell should use as its x/y. */
export function gridCellCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: GRID_OFFSET_X + col * CELL_SIZE + CELL_SIZE / 2,
    y: GRID_OFFSET_Y + row * CELL_SIZE + CELL_SIZE / 2,
  };
}

/** World/canvas-space coordinate of a cell's top-left corner - what grid-line/cell-rect drawing anchors to. */
export function gridCellTopLeft(col: number, row: number): { x: number; y: number } {
  return { x: GRID_OFFSET_X + col * CELL_SIZE, y: GRID_OFFSET_Y + row * CELL_SIZE };
}

// --- Enemy waypoint path -------------------------------------------------
//
// A classic "Z" route: enters at the left edge, runs right, drops down,
// then runs right again to exit at the right edge - two corners (the
// middle two waypoints), well clear of the grid's col/row bounds
// (GRID_COLS=16 -> valid cols 0-15, GRID_ROWS=9 -> valid rows 0-8).
export const ENEMY_PATH: readonly GridCell[] = [
  { col: 0, row: 2 },
  { col: 5, row: 2 },
  { col: 5, row: 6 },
  { col: 15, row: 6 },
];

/**
 * Walks ENEMY_PATH's waypoints and fills in every grid cell actually
 * crossed between each consecutive pair (not just the waypoints
 * themselves) - what both "which cells does the path visually cover" (grid
 * rendering) and "which cells are blocked for hero placement" (occupancy)
 * actually need. Assumes each waypoint-to-waypoint segment is axis-aligned
 * (pure horizontal or pure vertical), which is how ENEMY_PATH above is
 * authored - a diagonal segment would need real interpolation, not this
 * unit-step walk.
 */
function expandPathToCells(waypoints: readonly GridCell[]): GridCell[] {
  const cells: GridCell[] = [waypoints[0]];
  for (let i = 1; i < waypoints.length; i += 1) {
    const from = waypoints[i - 1];
    const to = waypoints[i];
    const stepCol = Math.sign(to.col - from.col);
    const stepRow = Math.sign(to.row - from.row);

    let { col, row } = from;
    while (col !== to.col || row !== to.row) {
      col += stepCol;
      row += stepRow;
      cells.push({ col, row });
    }
  }
  return cells;
}

export const ENEMY_PATH_CELLS: readonly GridCell[] = expandPathToCells(ENEMY_PATH);

const ENEMY_PATH_CELL_KEYS = new Set(ENEMY_PATH_CELLS.map((cell) => cellKey(cell.col, cell.row)));

/** True for every cell ENEMY_PATH actually crosses (not just its waypoints) - CombatEngine.isCellOccupied treats these as permanently occupied so heroes can never be placed on the enemy route. */
export function isPathCell(col: number, row: number): boolean {
  return ENEMY_PATH_CELL_KEYS.has(cellKey(col, row));
}
