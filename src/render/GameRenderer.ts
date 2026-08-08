import { GameState, type GameManager } from '../combat/GameManager';
import type { BattleHero } from '../combat/BattleHero';
import type { BattleEnemy } from '../combat/BattleEnemy';
import type { Projectile } from '../combat/Projectile';
import { StatusEffectType } from '../data/skills/skillTypes';
import { heroCatalog } from '../combat/heroCatalog';
import {
  CELL_SIZE,
  GRID_COLS,
  GRID_ROWS,
  GRID_OFFSET_X,
  GRID_OFFSET_Y,
  GRID_WIDTH,
  GRID_HEIGHT,
  CANVAS_WIDTH,
  ENEMY_PATH,
  ENEMY_PATH_CELLS,
  gridCellCenter,
  gridCellTopLeft,
} from '../combat/gridConfig';
import type { InputManager } from '../input/InputManager';
import { getImage, getEnemySpriteSrc, getHeroSpriteSrc, getHeroEvolvedSpriteSrc } from './assetLoader';

const BACKGROUND_SRC = '/backgrounds/ancient-ruins.jpg';

// Slightly smaller than a full cell so adjacent placed heroes stay visually
// separated instead of their sprites touching edge-to-edge.
const HERO_SIZE = CELL_SIZE * 0.85;
const BUILD_PLACEHOLDER_ALPHA = 0.45;
const OCCUPIED_PLACEHOLDER_COLOR = '#ef4444';
const FREE_PLACEHOLDER_COLOR = '#3b82f6';
const GRID_LINE_COLOR = 'rgba(255, 255, 255, 0.12)';

const ENEMY_SIZE = CELL_SIZE * 0.75;

const HP_BAR_HEIGHT = 8;
const HP_BAR_OFFSET_Y = 10;

const PATH_TINT_COLOR = 'rgba(139, 111, 78, 0.4)';
const PATH_LINE_COLOR = 'rgba(255, 235, 180, 0.85)';
const PATH_ARROW_SIZE = 12;

const RANGE_CIRCLE_COLOR = 'rgba(255, 255, 255, 0.6)';

const BASE_MARKER_COLOR = '#8b5a2b';
const BASE_MARKER_BORDER_COLOR = '#f5deb3';
const BASE_HP_PIP_RADIUS = 6;
const BASE_HP_PIP_SPACING = 18;
const BASE_HP_FULL_COLOR = '#ef4444';
const BASE_HP_LOST_COLOR = 'rgba(255, 255, 255, 0.4)';
const BASE_HP_BAR_Y = 22;

const END_OVERLAY_COLOR = 'rgba(0, 0, 0, 0.65)';
const GAME_OVER_TEXT_COLOR = '#ef4444';
const VICTORY_TEXT_COLOR = '#22c55e';
const END_SUBTEXT_COLOR = '#f5f5f5';

const PROJECTILE_RADIUS = 5;
const SLOW_STATUS_COLOR = '#60a5fa';
const DOT_STATUS_COLOR = '#f97316';
const DEFAULT_PROJECTILE_COLOR = '#e5e7eb';
const STATUS_RING_RADIUS_OFFSET = 6;

const SELECTION_RING_COLOR = '#facc15';
const LEVEL_BADGE_COLOR = '#facc15';

/** Opacity a dead hero's sprite is drawn at (on top of a grayscale filter) - faded enough to read as "down" against still-alive heroes without disappearing entirely. */
const DEAD_HERO_ALPHA = 0.45;

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
    this.drawEnemyPath();
    this.drawGridLines();
    this.drawBaseMarker();

    for (const hero of this.gameManager.combatEngine.getHeroes()) {
      this.drawHero(hero);
    }

    for (const enemy of this.gameManager.combatEngine.getAliveEnemies()) {
      this.drawEnemy(enemy);
    }

    for (const projectile of this.gameManager.combatEngine.getProjectiles()) {
      this.drawProjectile(projectile);
    }

    this.drawHoveredHeroRange();
    this.drawBuildModePlaceholder();
    this.drawBaseHpBar();
    this.drawEndOverlay();
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

  /**
   * Tints every cell ENEMY_PATH_CELLS covers (not just the waypoints - the
   * straight runs between them too) so the player can see exactly which
   * ground enemies walk on, then overlays a dashed centerline through the
   * waypoints with an arrowhead at the exit, showing direction of travel.
   * Drawn as part of the background pass, under the grid lines/entities.
   */
  private drawEnemyPath(): void {
    this.ctx.save();
    this.ctx.fillStyle = PATH_TINT_COLOR;
    for (const cell of ENEMY_PATH_CELLS) {
      const { x, y } = gridCellTopLeft(cell.col, cell.row);
      this.ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
    }
    this.ctx.restore();

    this.ctx.save();
    this.ctx.strokeStyle = PATH_LINE_COLOR;
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([10, 6]);
    this.ctx.beginPath();
    ENEMY_PATH.forEach((waypoint, index) => {
      const center = gridCellCenter(waypoint.col, waypoint.row);
      if (index === 0) {
        this.ctx.moveTo(center.x, center.y);
      } else {
        this.ctx.lineTo(center.x, center.y);
      }
    });
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    const exitFrom = gridCellCenter(ENEMY_PATH[ENEMY_PATH.length - 2].col, ENEMY_PATH[ENEMY_PATH.length - 2].row);
    const exitTo = gridCellCenter(ENEMY_PATH[ENEMY_PATH.length - 1].col, ENEMY_PATH[ENEMY_PATH.length - 1].row);
    this.drawArrowHead(exitFrom, exitTo);
    this.ctx.restore();
  }

  /** Filled triangle at `to`, pointing along the from->to direction - the "which way do enemies travel" indicator at the path's exit. */
  private drawArrowHead(from: { x: number; y: number }, to: { x: number; y: number }): void {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    this.ctx.fillStyle = PATH_LINE_COLOR;
    this.ctx.beginPath();
    this.ctx.moveTo(to.x, to.y);
    this.ctx.lineTo(to.x - PATH_ARROW_SIZE * Math.cos(angle - Math.PI / 6), to.y - PATH_ARROW_SIZE * Math.sin(angle - Math.PI / 6));
    this.ctx.lineTo(to.x - PATH_ARROW_SIZE * Math.cos(angle + Math.PI / 6), to.y - PATH_ARROW_SIZE * Math.sin(angle + Math.PI / 6));
    this.ctx.closePath();
    this.ctx.fill();
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

  /** Small marker square at ENEMY_PATH's final waypoint - what a hero/enemy sprite would be, if the base had one; ties the numeric HP readout (drawBaseHpBar) to an actual spot on the field. */
  private drawBaseMarker(): void {
    const exit = ENEMY_PATH[ENEMY_PATH.length - 1];
    const center = gridCellCenter(exit.col, exit.row);
    const size = CELL_SIZE * 0.6;

    this.ctx.save();
    this.ctx.fillStyle = BASE_MARKER_COLOR;
    this.ctx.fillRect(center.x - size / 2, center.y - size / 2, size, size);
    this.ctx.strokeStyle = BASE_MARKER_BORDER_COLOR;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(center.x - size / 2, center.y - size / 2, size, size);
    this.ctx.restore();
  }

  /**
   * Fixed HUD-style readout at the top of the canvas (rather than anchored
   * to the base marker itself) - maxBaseHp pips could otherwise overflow
   * off the right edge, since ENEMY_PATH's exit waypoint sits right up
   * against the canvas boundary. One filled red pip per remaining baseHp,
   * one hollow outline pip per point already lost.
   */
  private drawBaseHpBar(): void {
    const { baseHp, maxBaseHp } = this.gameManager;
    const totalWidth = (maxBaseHp - 1) * BASE_HP_PIP_SPACING;
    const startX = CANVAS_WIDTH / 2 - totalWidth / 2;

    this.ctx.save();
    for (let i = 0; i < maxBaseHp; i += 1) {
      const x = startX + i * BASE_HP_PIP_SPACING;
      this.ctx.beginPath();
      this.ctx.arc(x, BASE_HP_BAR_Y, BASE_HP_PIP_RADIUS, 0, Math.PI * 2);
      if (i < baseHp) {
        this.ctx.fillStyle = BASE_HP_FULL_COLOR;
        this.ctx.fill();
      } else {
        this.ctx.strokeStyle = BASE_HP_LOST_COLOR;
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
      }
    }
    this.ctx.restore();

    this.drawLabel(`大本营 HP ${baseHp}/${maxBaseHp}`, CANVAS_WIDTH / 2, BASE_HP_BAR_Y + 22);
  }

  /**
   * Full-canvas dim wash + centered "GAME OVER"/"VICTORY" once the run has
   * ended, drawn last so it sits on top of every other layer. Purely
   * visual; the actual interaction lockout is GameManager.tryPlaceHero
   * rejecting placements and main.ts canceling build mode once it observes
   * gameState leaving Playing.
   */
  private drawEndOverlay(): void {
    const { gameState } = this.gameManager;
    if (gameState !== GameState.GameOver && gameState !== GameState.Victory) {
      return;
    }

    const isVictory = gameState === GameState.Victory;

    this.ctx.save();
    this.ctx.fillStyle = END_OVERLAY_COLOR;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    this.ctx.fillStyle = isVictory ? VICTORY_TEXT_COLOR : GAME_OVER_TEXT_COLOR;
    this.ctx.font = 'bold 64px sans-serif';
    this.ctx.fillText(isVictory ? 'VICTORY' : 'GAME OVER', this.canvas.width / 2, this.canvas.height / 2);

    this.ctx.fillStyle = END_SUBTEXT_COLOR;
    this.ctx.font = '18px sans-serif';
    this.ctx.fillText(
      isVictory ? '所有波次已清空，大本营存活' : '大本营已被攻陷',
      this.canvas.width / 2,
      this.canvas.height / 2 + 46,
    );
    this.ctx.restore();
  }

  // BattleHero.x/y are the hero's center point (where the player clicked to
  // place it) - drawSprite/drawHpBar/drawLabel all want a top-left corner,
  // so every call here offsets by half the sprite size.
  private drawHero(hero: BattleHero): void {
    const topLeftX = hero.x - HERO_SIZE / 2;
    const topLeftY = hero.y - HERO_SIZE / 2;

    // Drawn before the sprite (bottom layer) so it reads as a ground
    // marker under the character's feet, not an outline overlapping the
    // character itself.
    if (this.inputManager?.selectedHeroInstanceId === hero.instanceId) {
      this.drawSelectionRing(hero);
    }

    // An evolved hero (hero.evolvedInto set, see BattleHero.evolveInto)
    // draws from its dedicated evolved-branch sprite instead of the plain
    // heroClass one - same fallback-to-class-sprite convention the old
    // CanvasRenderer already established for the save-game hero system.
    const spriteSrc = hero.evolvedInto ? getHeroEvolvedSpriteSrc(hero.evolvedInto) : getHeroSpriteSrc(hero.heroClass);
    // A dead hero (BattleHero.isDead, step 18) stays on the grid instead of
    // being removed - drawn grayscale + faded so it reads as "down" at a
    // glance without needing a dedicated death sprite.
    this.drawSprite(spriteSrc, topLeftX, topLeftY, HERO_SIZE, '#3b82f6', hero.isDead ? DEAD_HERO_ALPHA : 1);
    this.drawHpBar(topLeftX, topLeftY, HERO_SIZE, hero.stats.currentHp, hero.stats.maxHp);
    this.drawLabel(hero.evolvedInto ?? hero.heroClass, hero.x, topLeftY + HERO_SIZE + 14);
    this.drawLevelBadge(hero, topLeftX, topLeftY);
  }

  /** Small "Lv.N" tag above the sprite's head (top-left corner of its bounding box) - always visible (not just on hover/selection), since level is core to step 17's upgrade loop. */
  private drawLevelBadge(hero: BattleHero, topLeftX: number, topLeftY: number): void {
    this.ctx.save();
    this.ctx.fillStyle = LEVEL_BADGE_COLOR;
    this.ctx.font = 'bold 11px sans-serif';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`Lv.${hero.level}`, topLeftX, topLeftY - 2);
    this.ctx.restore();
  }

  /**
   * Flattened dashed ellipse "standing ring" at the selected hero's feet
   * (the bottom edge of its sprite box, not a circle around the whole
   * body) - the classic RTS-style ground marker for "this unit is
   * selected". Purely reflects InputManager.selectedHeroInstanceId, which
   * main.ts's onCanvasClick hit-test sets; this method never mutates
   * anything itself.
   */
  private drawSelectionRing(hero: BattleHero): void {
    const feetY = hero.y + HERO_SIZE / 2;
    const radiusX = HERO_SIZE / 2;
    const radiusY = HERO_SIZE / 5;

    this.ctx.save();
    this.ctx.strokeStyle = SELECTION_RING_COLOR;
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([5, 4]);
    this.ctx.beginPath();
    this.ctx.ellipse(hero.x, feetY, radiusX, radiusY, 0, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
  }

  /**
   * Debug aid: hovering the pointer directly over a placed hero (regardless
   * of build mode) draws a thin dashed circle at that hero's largest owned
   * skill range, centered on its real x/y - lets you eyeball whether a
   * given enemy position will actually draw fire. Read-only: only calls
   * InputManager.pointerWorldPosition and BattleHero.getMaxSkillRange.
   */
  private drawHoveredHeroRange(): void {
    const pointer = this.inputManager?.pointerWorldPosition;
    if (!pointer) {
      return;
    }

    const hoveredHero = this.gameManager.combatEngine
      .getHeroes()
      .find((hero) => Math.hypot(hero.x - pointer.x, hero.y - pointer.y) <= HERO_SIZE / 2);
    if (!hoveredHero) {
      return;
    }

    const range = hoveredHero.getMaxSkillRange();
    if (range <= 0) {
      return;
    }

    this.ctx.save();
    this.ctx.strokeStyle = RANGE_CIRCLE_COLOR;
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 4]);
    this.ctx.beginPath();
    this.ctx.arc(hoveredHero.x, hoveredHero.y, range, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
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

  // BattleEnemy.x/y (see BattleEnemy.moveAlongPath) are the enemy's center
  // point, same top-left-offset convention as drawHero.
  private drawEnemy(enemy: BattleEnemy): void {
    const topLeftX = enemy.x - ENEMY_SIZE / 2;
    const topLeftY = enemy.y - ENEMY_SIZE / 2;
    this.drawSprite(getEnemySpriteSrc(enemy.archetypeId), topLeftX, topLeftY, ENEMY_SIZE, '#dc2626');
    this.drawHpBar(topLeftX, topLeftY, ENEMY_SIZE, enemy.currentHp, enemy.maxHp);
    this.drawLabel(enemy.archetypeId, enemy.x, topLeftY + ENEMY_SIZE + 14);
    this.drawStatusRings(enemy);
  }

  /** One thin ring per distinct active status type (blue for Slow, orange for DOT) - a quick "this enemy is currently affected" glance, without needing to read activeStatuses' raw numbers. */
  private drawStatusRings(enemy: BattleEnemy): void {
    const activeTypes = new Set(enemy.activeStatuses.map((status) => status.type));
    if (activeTypes.size === 0) {
      return;
    }

    this.ctx.save();
    this.ctx.lineWidth = 2;
    let ringIndex = 0;
    for (const type of activeTypes) {
      this.ctx.strokeStyle = type === StatusEffectType.Slow ? SLOW_STATUS_COLOR : DOT_STATUS_COLOR;
      this.ctx.beginPath();
      this.ctx.arc(enemy.x, enemy.y, ENEMY_SIZE / 2 + STATUS_RING_RADIUS_OFFSET + ringIndex * 4, 0, Math.PI * 2);
      this.ctx.stroke();
      ringIndex += 1;
    }
    this.ctx.restore();
  }

  /** In-flight projectile as a small filled dot, color-coded by its statusEffect payload (blue Slow / orange DOT / neutral for a plain damage bolt) so its purpose reads at a glance mid-flight. */
  private drawProjectile(projectile: Projectile): void {
    const color =
      projectile.statusEffect?.type === StatusEffectType.Slow
        ? SLOW_STATUS_COLOR
        : projectile.statusEffect?.type === StatusEffectType.Dot
          ? DOT_STATUS_COLOR
          : DEFAULT_PROJECTILE_COLOR;

    this.ctx.save();
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(projectile.x, projectile.y, PROJECTILE_RADIUS, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  /**
   * Draws the loaded sprite at (x, y) sized to `size`x`size`, or a solid
   * placeholder square while it's still loading/missing. A frame-sheet
   * source (see isFrameSheet) samples just its first walk cell rather than
   * squashing the whole strip into the box; a single-image source (e.g.
   * demon_boss.png) is drawn whole with its aspect ratio preserved.
   */
  /** `alpha < 1` also applies a grayscale filter alongside the opacity drop - together they're what drawHero uses to render a dead BattleHero as visibly "down" (see DEAD_HERO_ALPHA) without needing a dedicated death sprite. Every other call site passes the default alpha=1, which skips both. */
  private drawSprite(src: string, x: number, y: number, size: number, fallbackColor: string, alpha = 1): void {
    const image = getImage(src);

    this.ctx.save();
    if (alpha < 1) {
      this.ctx.globalAlpha = alpha;
      this.ctx.filter = 'grayscale(1)';
    }

    if (!image) {
      this.ctx.fillStyle = fallbackColor;
      this.ctx.fillRect(x, y, size, size);
      this.ctx.restore();
      return;
    }

    if (isFrameSheet(image)) {
      this.ctx.drawImage(image, 0, 0, SHEET_FRAME_SIZE, SHEET_FRAME_SIZE, x, y, size, size);
      this.ctx.restore();
      return;
    }

    const scale = Math.min(size / image.width, size / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const offsetX = x + (size - drawWidth) / 2;
    const offsetY = y + (size - drawHeight) / 2;
    this.ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
    this.ctx.restore();
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
