import { worldToGridCell, gridCellCenter, type GridCell } from '../combat/gridConfig';

/** A hovered/clicked grid cell plus its already-snapped world-space center - what GameRenderer/GameManager both actually want, rather than either recomputing the other from scratch. */
export interface SnappedPlacement {
  cell: GridCell;
  worldPosition: { x: number; y: number };
}

export interface InputManagerCallbacks {
  /** Fired on a canvas click while in build mode, with the click already snapped to a grid cell. Returns whether the placement actually succeeded (e.g. enough gold, cell free), purely for the caller's own bookkeeping - InputManager itself always exits build mode after a click regardless of the outcome. */
  onPlaceHero: (heroTypeId: string, cell: GridCell) => boolean;
}

/**
 * Owns canvas pointer input and the build-mode state machine (idle -> a
 * hero type is "armed" -> click commits a placement and returns to idle).
 * Every hover/click position is snapped to the battlefield grid (see
 * gridConfig.ts) before it's exposed anywhere - this class knows nothing
 * about gold or occupancy, purely the geometry of "where is the pointer,
 * grid-wise". Talks to the rest of the game only through the onPlaceHero
 * callback; GameRenderer reads this class's public getters (build mode
 * active?, which hero type, snapped hover cell) to draw the placeholder.
 * Data flows one way: Input -> callback -> game state -> renderer reads
 * state (and, separately, this class's own hover state) - never the
 * reverse.
 */
export class InputManager {
  private buildModeHeroTypeId: string | null = null;
  private hoverSnap: SnappedPlacement | null = null;
  /** Raw (unsnapped) world position, tracked regardless of build mode - what GameRenderer's optional hero-range hover debug circle hit-tests against. */
  private pointerPosition: { x: number; y: number } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: InputManagerCallbacks,
  ) {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
  }

  get isBuildModeActive(): boolean {
    return this.buildModeHeroTypeId !== null;
  }

  get activeHeroTypeId(): string | null {
    return this.buildModeHeroTypeId;
  }

  /** The grid cell (+ its snapped world center) the pointer currently hovers, or null while not in build mode, the pointer's outside the canvas, or it's over the centering margin outside the grid. */
  get hoverSnappedPlacement(): SnappedPlacement | null {
    return this.buildModeHeroTypeId ? this.hoverSnap : null;
  }

  /** Raw world-space pointer position, tracked independent of build mode - null once the pointer leaves the canvas. */
  get pointerWorldPosition(): { x: number; y: number } | null {
    return this.pointerPosition;
  }

  /** Arms build mode for the given hero type - the next canvas click attempts to place it at whatever cell it lands on. */
  enterBuildMode(heroTypeId: string): void {
    this.buildModeHeroTypeId = heroTypeId;
    this.canvas.style.cursor = 'crosshair';
  }

  cancelBuildMode(): void {
    this.buildModeHeroTypeId = null;
    this.hoverSnap = null;
    this.canvas.style.cursor = '';
  }

  /** Removes this manager's event listeners - call when the canvas/page is torn down. */
  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
  }

  /**
   * Converts a browser client-space point (event.clientX/Y) into the
   * canvas's internal world coordinates. Goes through
   * getBoundingClientRect rather than assuming a 1:1 pixel mapping, so
   * placement stays accurate however the canvas element is CSS-scaled
   * (e.g. combat-test.html's width/height styling) relative to its
   * width/height attributes.
   */
  private toWorldPosition(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  /** World point -> grid cell -> that cell's snapped center, or null if the point falls outside the grid. */
  private toSnappedPlacement(clientX: number, clientY: number): SnappedPlacement | null {
    const world = this.toWorldPosition(clientX, clientY);
    const cell = worldToGridCell(world.x, world.y);
    return cell ? { cell, worldPosition: gridCellCenter(cell.col, cell.row) } : null;
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    this.pointerPosition = this.toWorldPosition(event.clientX, event.clientY);
    if (!this.buildModeHeroTypeId) {
      return;
    }
    const cell = worldToGridCell(this.pointerPosition.x, this.pointerPosition.y);
    this.hoverSnap = cell ? { cell, worldPosition: gridCellCenter(cell.col, cell.row) } : null;
  };

  private readonly handlePointerLeave = (): void => {
    this.pointerPosition = null;
    this.hoverSnap = null;
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.buildModeHeroTypeId) {
      return;
    }
    const snap = this.toSnappedPlacement(event.clientX, event.clientY);
    if (!snap) {
      // Clicked outside the grid (e.g. the centering margin) - ignore and
      // stay armed so the player can just click again inside the grid.
      return;
    }
    this.callbacks.onPlaceHero(this.buildModeHeroTypeId, snap.cell);
    this.cancelBuildMode();
  };
}
