import type { GameManager } from '../combat/GameManager';
import type { BattleHero } from '../combat/BattleHero';
import type { BattleEnemy } from '../combat/BattleEnemy';
import { heroCatalog } from '../combat/heroCatalog';
import { CELL_SIZE, GRID_COLS, GRID_ROWS, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_WIDTH, GRID_HEIGHT } from '../combat/gridConfig';
import type { InputManager } from '../input/InputManager';
import { getImage, getEnemySpriteSrc, getHeroSpriteSrc } from './assetLoader';

const BACKGROUND_SRC = '/backgrounds/ancient-ruins.jpg';

// Slightly smaller than a full cell so adjacent placed heroes stay visually
// separated instead of their sprites touching edge-to-edge.
const HERO_SIZE = CELL_SIZE * 0.85;
const BUILD_PLACEHOLDER_ALPHA = 0.45;
const OCCUPIED_PLACEHOLDER_COLOR = '#ef4444';
const FREE_PLACEHOLDER_COLOR = '#3b82f6';
const GRID_LINE_COLOR = 'rgba(255, 255, 255, 0.12)';

const ENEMY_ROW_Y = 300;
const ENEMY_START_X = 560;
const ENEMY_SPACING = 150;
const ENEMY_SIZE = 110;

const HP_BAR_HEIGHT = 8;
const HP_BAR_OFFSET_Y = 10;

// Matches CanvasRenderer's SPRITE_SHEET_CONFIG convention: hero/enemy sheets
// dropped into public/sprites/ are laid out as 32x32 cells (row 0 = walk).
// This renderer doesn't animate - it just samples the first walk frame -
// but still needs to detect a sheet so it draws one 32x32 cell instead of
// the whole multi-frame strip squashed into the sprite box.
const SHEET_FRAME_SIZE = 32;
const MAX_SHEET_COLUMNS = 12;
const MAX_SHEET_ROWS = 6;

function isFrameSheet(image: HTMLImageElement): boolean {
  const widthInRange = image.width >= SHEET_FRAME_SIZE * 2 && image.width <= SHEET_FRAME_SIZE * MAX_SHEET_COLUMNS;
  const heightInRange = image.height >= SHEET_FRAME_SIZE * 2 && image.height <= SHEET_FRAME_SIZE * MAX_SHEET_ROWS;
  return widthInRange && heightInRange;
}

/**
 * Pure read layer over a GameManager: every frame it snapshots
 * combatEngine.getHeroes()/getAliveEnemies() and draws them, but never calls
 * anything that would mutate GameManager/CombatEngine state. Owns the canvas
 * 2D context and its own fire-and-forget sprite loading via assetLoader's
 * shared image cache.
 */
export class GameRenderer {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gameManager: GameManager,
    private readonly inputManager?: InputManager,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('GameRenderer: failed to acquire 2D rendering context');
    }
    this.ctx = ctx;
  }

  render(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawBackground();
    this.drawGridLines();

    for (const hero of this.gameManager.combatEngine.getHeroes()) {
      this.drawHero(hero);
    }

    const enemies = this.gameManager.combatEngine.getAliveEnemies();
    enemies.forEach((enemy, index) => this.drawEnemy(enemy, index));

    this.drawBuildModePlaceholder();
  }

  private drawBackground(): void {
    const image = getImage(BACKGROUND_SRC);
    if (image) {
      this.ctx.drawImage(image, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = '#1a1a1a';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /** Faint debug/placement-aid grid overlay - purely visual, doesn't affect worldToGridCell's own math (see gridConfig.ts). */
  private drawGridLines(): void {
    this.ctx.save();
    this.ctx.strokeStyle = GRID_LINE_COLOR;
    this.ctx.lineWidth = 1;

    for (let col = 0; col <= GRID_COLS; col += 1) {
      const x = GRID_OFFSET_X + col * CELL_SIZE;
      this.ctx.beginPath();
      this.ctx.moveTo(x, GRID_OFFSET_Y);
      this.ctx.lineTo(x, GRID_OFFSET_Y + GRID_HEIGHT);
      this.ctx.stroke();
    }

    for (let row = 0; row <= GRID_ROWS; row += 1) {
      const y = GRID_OFFSET_Y + row * CELL_SIZE;
      this.ctx.beginPath();
      this.ctx.moveTo(GRID_OFFSET_X, y);
      this.ctx.lineTo(GRID_OFFSET_X + GRID_WIDTH, y);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  // BattleHero.x/y are the hero's center point (where the player clicked to
  // place it) - drawSprite/drawHpBar/drawLabel all want a top-left corner,
  // so every call here offsets by half the sprite size.
  private drawHero(hero: BattleHero): void {
    const topLeftX = hero.x - HERO_SIZE / 2;
    const topLeftY = hero.y - HERO_SIZE / 2;
    this.drawSprite(getHeroSpriteSrc(hero.heroClass), topLeftX, topLeftY, HERO_SIZE, '#3b82f6');
    this.drawHpBar(topLeftX, topLeftY, HERO_SIZE, hero.stats.currentHp, hero.stats.maxHp);
    this.drawLabel(hero.heroClass, hero.x, topLeftY + HERO_SIZE + 14);
  }

  /**
   * Translucent preview of the currently-armed heroCatalog entry, snapped
   * to whichever grid cell InputManager reports the pointer over -
   * "jumping" cell to cell rather than following the raw pointer, since
   * hoverSnappedPlacement is already grid-quantized. Turns red (sprite tint
   * + overlay wash) when gameManager.combatEngine.isCellOccupied says that
   * cell's taken, so the player sees the rejection before they even click.
   * Read-only throughout: only calls InputManager/CombatEngine getters,
   * never mutates anything.
   */
  private drawBuildModePlaceholder(): void {
    const heroTypeId = this.inputManager?.activeHeroTypeId;
    const snap = this.inputManager?.hoverSnappedPlacement;
    if (!heroTypeId || !snap) {
      return;
    }

    const entry = heroCatalog[heroTypeId];
    if (!entry) {
      return;
    }

    const occupied = this.gameManager.combatEngine.isCellOccupied(snap.cell.col, snap.cell.row);
    const topLeftX = snap.worldPosition.x - HERO_SIZE / 2;
    const topLeftY = snap.worldPosition.y - HERO_SIZE / 2;
    const tint = occupied ? OCCUPIED_PLACEHOLDER_COLOR : FREE_PLACEHOLDER_COLOR;

    this.ctx.save();
    this.ctx.globalAlpha = BUILD_PLACEHOLDER_ALPHA;
    this.drawSprite(getHeroSpriteSrc(entry.template.heroClass), topLeftX, topLeftY, HERO_SIZE, tint);
    if (occupied) {
      this.ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
      this.ctx.fillRect(topLeftX, topLeftY, HERO_SIZE, HERO_SIZE);
    }
    this.ctx.restore();

    const label = occupied ? `${entry.displayName} - 该格已占用` : `${entry.displayName} (${entry.cost}金币)`;
    this.drawLabel(label, snap.worldPosition.x, topLeftY + HERO_SIZE + 14, occupied ? OCCUPIED_PLACEHOLDER_COLOR : undefined);
  }

  private drawEnemy(enemy: BattleEnemy, index: number): void {
    const x = ENEMY_START_X + index * ENEMY_SPACING;
    const y = ENEMY_ROW_Y;
    this.drawSprite(getEnemySpriteSrc(enemy.archetypeId), x, y, ENEMY_SIZE, '#dc2626');
    this.drawHpBar(x, y, ENEMY_SIZE, enemy.currentHp, enemy.maxHp);
    this.drawLabel(enemy.archetypeId, x + ENEMY_SIZE / 2, y + ENEMY_SIZE + 14);
  }

  /**
   * Draws the loaded sprite at (x, y) sized to `size`x`size`, or a solid
   * placeholder square while it's still loading/missing. A frame-sheet
   * source (see isFrameSheet) samples just its first walk cell rather than
   * squashing the whole strip into the box; a single-image source (e.g.
   * demon_boss.png) is drawn whole with its aspect ratio preserved.
   */
  private drawSprite(src: string, x: number, y: number, size: number, fallbackColor: string): void {
    const image = getImage(src);
    if (!image) {
      this.ctx.fillStyle = fallbackColor;
      this.ctx.fillRect(x, y, size, size);
      return;
    }

    if (isFrameSheet(image)) {
      this.ctx.drawImage(image, 0, 0, SHEET_FRAME_SIZE, SHEET_FRAME_SIZE, x, y, size, size);
      return;
    }

    const scale = Math.min(size / image.width, size / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const offsetX = x + (size - drawWidth) / 2;
    const offsetY = y + (size - drawHeight) / 2;
    this.ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  }

  private drawHpBar(spriteX: number, spriteY: number, width: number, currentHp: number, maxHp: number): void {
    const barX = spriteX;
    const barY = spriteY - HP_BAR_OFFSET_Y;
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, currentHp / maxHp)) : 0;

    this.ctx.fillStyle = '#3f3f3f';
    this.ctx.fillRect(barX, barY, width, HP_BAR_HEIGHT);

    this.ctx.fillStyle = ratio > 0.3 ? '#22c55e' : '#ef4444';
    this.ctx.fillRect(barX, barY, width * ratio, HP_BAR_HEIGHT);
  }

  private drawLabel(text: string, centerX: number, y: number, color = '#f5f5f5'): void {
    this.ctx.fillStyle = color;
    this.ctx.font = '13px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(text, centerX, y);
  }
}
