import type { GameManager } from '../combat/GameManager';
import type { BattleHero } from '../combat/BattleHero';
import type { BattleEnemy } from '../combat/BattleEnemy';
import { getImage, getEnemySpriteSrc, getHeroSpriteSrc } from './assetLoader';

const BACKGROUND_SRC = '/backgrounds/ancient-ruins.jpg';

const HERO_POSITION = { x: 170, y: 300 };
const HERO_SIZE = 140;

const ENEMY_ROW_Y = 300;
const ENEMY_START_X = 560;
const ENEMY_SPACING = 150;
const ENEMY_SIZE = 110;

const HP_BAR_WIDTH = 100;
const HP_BAR_HEIGHT = 8;
const HP_BAR_OFFSET_Y = 16;

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

    for (const hero of this.gameManager.combatEngine.getHeroes()) {
      this.drawHero(hero);
    }

    const enemies = this.gameManager.combatEngine.getAliveEnemies();
    enemies.forEach((enemy, index) => this.drawEnemy(enemy, index));
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

  private drawHero(hero: BattleHero): void {
    const { x, y } = HERO_POSITION;
    this.drawSprite(getHeroSpriteSrc(hero.heroClass), x, y, HERO_SIZE, '#3b82f6');
    this.drawHpBar(x, y, hero.stats.currentHp, hero.stats.maxHp);
    this.drawLabel(hero.heroClass, x + HERO_SIZE / 2, y + HERO_SIZE + 14);
  }

  private drawEnemy(enemy: BattleEnemy, index: number): void {
    const x = ENEMY_START_X + index * ENEMY_SPACING;
    const y = ENEMY_ROW_Y;
    this.drawSprite(getEnemySpriteSrc(enemy.archetypeId), x, y, ENEMY_SIZE, '#dc2626');
    this.drawHpBar(x, y, enemy.currentHp, enemy.maxHp);
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

  private drawHpBar(spriteX: number, spriteY: number, currentHp: number, maxHp: number): void {
    const barX = spriteX;
    const barY = spriteY - HP_BAR_OFFSET_Y;
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, currentHp / maxHp)) : 0;

    this.ctx.fillStyle = '#3f3f3f';
    this.ctx.fillRect(barX, barY, HP_BAR_WIDTH, HP_BAR_HEIGHT);

    this.ctx.fillStyle = ratio > 0.3 ? '#22c55e' : '#ef4444';
    this.ctx.fillRect(barX, barY, HP_BAR_WIDTH * ratio, HP_BAR_HEIGHT);
  }

  private drawLabel(text: string, centerX: number, y: number): void {
    this.ctx.fillStyle = '#f5f5f5';
    this.ctx.font = '13px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(text, centerX, y);
  }
}
