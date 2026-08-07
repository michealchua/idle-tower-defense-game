export interface InputManagerCallbacks {
  /** Fired on a canvas click while in build mode, with the click already converted to world coordinates. Returns whether the placement actually succeeded (e.g. enough gold), purely for the caller's own bookkeeping - InputManager itself always exits build mode after a click regardless of the outcome. */
  onPlaceHero: (heroTypeId: string, worldX: number, worldY: number) => boolean;
}

/**
 * Owns canvas pointer input and the build-mode state machine (idle -> a
 * hero type is "armed" -> click commits a placement and returns to idle).
 * Talks to the rest of the game only through the onPlaceHero callback - it
 * never reads GameManager/CombatEngine state and never draws anything
 * itself; GameRenderer reads this class's public getters (build mode
 * active?, which hero type, current hover position) to draw the
 * translucent placeholder. Data flows one way: Input -> callback -> game
 * state -> renderer reads state (and, separately, this class's own hover
 * state) - never the reverse.
 */
export class InputManager {
  private buildModeHeroTypeId: string | null = null;
  private hoverPosition: { x: number; y: number } | null = null;

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

  /** World-space point the pointer is currently over, or null while not in build mode or the pointer's outside the canvas. */
  get hoverWorldPosition(): { x: number; y: number } | null {
    return this.buildModeHeroTypeId ? this.hoverPosition : null;
  }

  /** Arms build mode for the given hero type - the next canvas click attempts to place it there. */
  enterBuildMode(heroTypeId: string): void {
    this.buildModeHeroTypeId = heroTypeId;
    this.canvas.style.cursor = 'crosshair';
  }

  cancelBuildMode(): void {
    this.buildModeHeroTypeId = null;
    this.hoverPosition = null;
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

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.buildModeHeroTypeId) {
      return;
    }
    this.hoverPosition = this.toWorldPosition(event.clientX, event.clientY);
  };

  private readonly handlePointerLeave = (): void => {
    this.hoverPosition = null;
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.buildModeHeroTypeId) {
      return;
    }
    const world = this.toWorldPosition(event.clientX, event.clientY);
    this.callbacks.onPlaceHero(this.buildModeHeroTypeId, world.x, world.y);
    this.cancelBuildMode();
  };
}
