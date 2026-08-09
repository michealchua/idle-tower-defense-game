import { GameState, FLOATING_TEXT_LIFETIME_MS, type GameManager } from '../combat/GameManager';
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
import { getImage, getEnemySpriteSrc, getHeroSpriteSrc, getHeroEvolvedSpriteSrc, preloadSprites } from './assetLoader';
import { EquipmentRarity, EquipmentSlot, type EquipmentItem } from '../combat/Equipment';
import { equipmentSpriteSrc, equipmentTemplates } from '../combat/equipmentCatalog';
import { allThemeBackgroundSrcs, type ThemeDefinition } from '../combat/ThemeManager';
import { ParticleType, type Particle, type ParticleManager } from '../combat/ParticleManager';
import { affixDefinitions } from '../combat/AffixManager';

/** Length of the cross-dissolve played over the background when the theme changes (step 22) - "1 秒的交叉溶解（透明度渐变）过渡". */
const THEME_TRANSITION_MS = 1000;

/** How far a heal callout (step 23) rises over its lifetime, in canvas px. */
const FLOATING_TEXT_RISE_PX = 24;
const FLOATING_TEXT_GLOW_RADIUS = 16;

/** Total duration of the prestige white-flash (step 27) - "透明度从 0 到 1 再到 0 渐变，持续 1.5 秒". */
const PRESTIGE_FLASH_MS = 1500;

// Slightly smaller than a full cell so adjacent placed heroes stay visually
// separated instead of their sprites touching edge-to-edge.
const HERO_SIZE = CELL_SIZE * 0.85;
const BUILD_PLACEHOLDER_ALPHA = 0.45;
const OCCUPIED_PLACEHOLDER_COLOR = '#ef4444';
const FREE_PLACEHOLDER_COLOR = '#3b82f6';
const GRID_LINE_COLOR = 'rgba(255, 255, 255, 0.12)';

const ENEMY_SIZE = CELL_SIZE * 0.75;

/** Step 28: CSS filter string approximating a red tint for a berserking enemy's sprite - "使用...Canvas 滤镜将其色调变红", applied via drawSprite's optional filter param instead of a second sprite/recolor asset. */
const BERSERKER_TINT_FILTER = 'sepia(1) saturate(6) hue-rotate(-50deg) brightness(0.9)';
/** Step 28: translucent blue ring drawn around a Shielded enemy's sprite while shieldHp > 0. */
const SHIELD_RING_COLOR = 'rgba(96, 165, 250, 0.55)';
/** Step 28: affix name labels drawn above the HP bar - deliberately smaller than drawLabel's default 13px ("极小的彩色字体"). */
const AFFIX_LABEL_FONT = '9px sans-serif';

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

// --- Equipment overlay rendering (step 21) --------------------------------

/** Weapon sprite box size and its offset from hero-center - "英雄中心偏右下", mirrored to the left when the hero is facing left (see getHeroFacing). */
const WEAPON_SPRITE_SIZE = HERO_SIZE * 0.55;
const WEAPON_OFFSET_X = HERO_SIZE * 0.32;
const WEAPON_OFFSET_Y = HERO_SIZE * 0.28;
const WEAPON_FALLBACK_COLOR = '#9ca3af';

/** Armor's overlay is a small, semi-transparent icon directly over the hero's body/chest, not a full-body reskin - deliberately smaller than the weapon sprite. */
const ARMOR_ICON_SIZE = HERO_SIZE * 0.4;
const ARMOR_ICON_ALPHA = 0.85;
const ARMOR_FALLBACK_COLOR = '#a3a3a3';

/** Item level at/above which its sprite gets the extra shadowBlur/shadowColor outline glow (step 21's "强化等级视觉反馈"). */
const HIGH_ENHANCEMENT_LEVEL = 10;
const HIGH_ENHANCEMENT_SHADOW_BLUR = 14;
/** Fallback shadow color for a highly-enhanced item that has no glowColor of its own (Common/Rare can still be enhanced to 10+ within their own level cap... actually capped at 5, so this only ever matters for Rare (cap 10) - still worth a sane default rather than an undefined shadowColor). */
const HIGH_ENHANCEMENT_FALLBACK_GLOW = '#ffffff';

/** Breathing aura drawn at a hero's feet while wearing Epic/Legendary gear - radius/alpha oscillate off Date.now() (no per-frame state needed, purely a function of wall-clock time) for a slow pulsing glow rather than a static ring. */
const AURA_BASE_RADIUS = HERO_SIZE * 0.55;
const AURA_RADIUS_PULSE = HERO_SIZE * 0.12;
const AURA_BASE_ALPHA = 0.22;
const AURA_ALPHA_PULSE = 0.22;
/** Full breathing cycle length in ms - slow enough to read as "pulsing," not flickering. */
const AURA_PULSE_PERIOD_MS = 1400;

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

  /** Theme drawn on the previous render() call - compared against gameManager.themeManager.currentTheme.id every frame to detect a stage-advance switch and (re)start the cross-dissolve below. Also what drawThemeTransition draws *underneath* the new background while the dissolve is in flight, so the outgoing theme doesn't just vanish. Starts undefined so the very first frame never plays a transition. */
  private lastTheme: ThemeDefinition | undefined;
  /** Date.now() timestamp the current transition started, or null while no transition is in flight. */
  private themeTransitionStartMs: number | null = null;
  /** Date.now() timestamp the current prestige white-flash (step 27) started, or null while none is in flight - see triggerPrestigeFlash/drawPrestigeFlash. */
  private prestigeFlashStartMs: number | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gameManager: GameManager,
    private readonly inputManager?: InputManager,
    /** Step 26's loot-burst particle system - optional so every existing GameRenderer call site (test-run.ts has none, but nothing here requires one) keeps working unchanged; omit it and drawParticles below is simply a no-op every frame. */
    private readonly particleManager?: ParticleManager,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('GameRenderer: failed to acquire 2D rendering context');
    }
    this.ctx = ctx;

    // Fire-and-forget, same as every other sprite this renderer draws
    // (getImage/preloadSprites already cache by src - see assetLoader.ts) -
    // kicks off decoding for all 16 equipmentCatalog templates' art up
    // front, so a freshly-equipped item's overlay is far more likely to
    // already be loaded by the time drawHero first asks for it, instead of
    // popping in a few frames late from its solid-color fallback.
    preloadSprites(equipmentTemplates.map((template) => equipmentSpriteSrc(template.itemId)));

    // Same reasoning, for every theme's background image (step 22) - only
    // ~10 files, cheap enough to kick off all of them up front rather than
    // loading each theme's art lazily the first time a stage reaches it.
    preloadSprites(allThemeBackgroundSrcs());
  }

  render(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.detectThemeChange();
    this.drawBackground();
    this.drawThemeTransition();
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
    this.drawFloatingTexts();
    this.drawBaseHpBar();
    this.drawEndOverlay();
    // Absolute topmost layer (step 26's "在所有 UI 元素的最上层绘制") - drawn
    // dead last so a loot-burst particle mid-flight is never occluded by
    // anything else this renderer draws, including drawEndOverlay's dim wash.
    this.drawParticles();
    // Even further on top than particles - a full-screen rebirth flash
    // (step 27) is meant to visually blank out everything, particles
    // included, for its brief peak.
    this.drawPrestigeFlash();
  }

  /** Starts the 1.5s white-flash overlay (step 27's "白屏闪烁") - main.ts calls this the instant a prestige is confirmed, before/alongside GameManager.resetForPrestige, so the flash's peak (~0.75s in) roughly coincides with the run actually resetting underneath it. Restarts cleanly even if called again before a previous flash finished (no queuing - a second prestige confirmed mid-flash simply restarts the 1.5s window). */
  triggerPrestigeFlash(): void {
    this.prestigeFlashStartMs = Date.now();
  }

  /** Triangular opacity envelope (0 -> 1 over the first half of PRESTIGE_FLASH_MS, 1 -> 0 over the second half) painted as a solid white full-canvas rect - same "no image dependency" reasoning drawThemeTransition's black-flash predecessor used, just white and full-screen. A no-op once PRESTIGE_FLASH_MS has fully elapsed (leaves prestigeFlashStartMs set rather than clearing it - harmless, the elapsed-ratio check below always short-circuits past 1 from then on). */
  private drawPrestigeFlash(): void {
    if (this.prestigeFlashStartMs === null) {
      return;
    }
    const elapsed = Date.now() - this.prestigeFlashStartMs;
    if (elapsed >= PRESTIGE_FLASH_MS) {
      return;
    }

    const t = elapsed / PRESTIGE_FLASH_MS;
    const alpha = t < 0.5 ? t * 2 : (1 - t) * 2;

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  /**
   * Step 23's "+XX" heal callout: one per GameManager.getActiveFloatingTexts()
   * entry, drawn above its recorded (x, y) - not the hero's *current*
   * position, since the hero may have moved/died since the heal landed -
   * rising and fading linearly over its FLOATING_TEXT_LIFETIME_MS window.
   * A small pulsing ring (the spec's "十字星或绿色光效") is drawn under the
   * text at the same fading alpha, both keyed off the same age so they
   * animate in lockstep. Drawn after every other gameplay layer so a
   * callout is never occluded by a sprite passing behind it.
   */
  private drawFloatingTexts(): void {
    const now = Date.now();
    for (const entry of this.gameManager.getActiveFloatingTexts()) {
      const age = now - entry.createdAtMs;
      const t = Math.min(1, Math.max(0, age / FLOATING_TEXT_LIFETIME_MS));
      const alpha = 1 - t;
      const riseY = entry.y - FLOATING_TEXT_RISE_PX * t;

      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.strokeStyle = entry.color;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(entry.x, entry.y, FLOATING_TEXT_GLOW_RADIUS * (0.5 + t * 0.5), 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();

      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = entry.color;
      this.ctx.font = 'bold 14px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(entry.text, entry.x, riseY - 20);
      this.ctx.restore();
    }
  }

  /** Records whether gameManager.themeManager.currentTheme changed since the last render() call and, if so, (re)starts the cross-dissolve - called once at the very top of render(), before any drawing, so drawBackground/drawThemeTransition below always see an up-to-date `lastTheme`/`themeTransitionStartMs`. Deliberately does NOT overwrite `lastTheme` until the dissolve finishes (see drawThemeTransition) - it needs to keep pointing at the *outgoing* theme for the whole transition window, not whatever the theme was one frame ago. */
  private detectThemeChange(): void {
    const theme = this.gameManager.themeManager.currentTheme;
    if (this.lastTheme !== undefined && theme.id !== this.lastTheme.id && this.themeTransitionStartMs === null) {
      this.themeTransitionStartMs = Date.now();
    }
  }

  /**
   * Bottom-most layer, per step 22's "渲染层级的绝对正确" requirement -
   * this is the very first draw call in render(), so nothing (grid, path,
   * heroes, enemies, UI overlays) can ever end up beneath it. Reads the
   * *current* stage's theme off gameManager.themeManager every frame rather
   * than caching it, so a stage advance (see ThemeManager.updateForWave,
   * driven from GameManager.updateEnvironmentForWave) is reflected on the
   * very next frame with no extra plumbing. Draws the plain, un-dissolved
   * background whenever no transition is in flight; drawThemeTransition
   * (called right after this by render()) is what actually cross-fades in
   * the new theme over the old one while `themeTransitionStartMs` is set.
   */
  private drawBackground(): void {
    this.drawThemeLayer(this.gameManager.themeManager.currentTheme, 1);
    if (this.themeTransitionStartMs === null) {
      this.lastTheme = this.gameManager.themeManager.currentTheme;
    }
  }

  /** Draws one theme's background (image if loaded, else its flat fallbackColor) at the given opacity, full-canvas. Shared by drawBackground (current theme, alpha 1 outside a transition) and drawThemeTransition (both themes, blended). */
  private drawThemeLayer(theme: ThemeDefinition, alpha: number): void {
    const image = getImage(theme.backgroundImage);
    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    if (image) {
      this.ctx.drawImage(image, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = theme.fallbackColor;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.ctx.restore();
  }

  /**
   * True cross-dissolve (step 22: "1 秒的交叉溶解（透明度渐变）过渡"): while
   * a transition is in flight, redraws the outgoing theme (`lastTheme`) at
   * full opacity underneath, then the incoming theme (already drawn once by
   * drawBackground at alpha 1) again on top at a linearly ramping 0 -> 1
   * opacity - net effect is the old background fading out exactly as fast
   * as the new one fades in. Once elapsed >= THEME_TRANSITION_MS, clears
   * themeTransitionStartMs and finally commits `lastTheme` to the new
   * theme, ending the transition.
   */
  private drawThemeTransition(): void {
    if (this.themeTransitionStartMs === null || !this.lastTheme) {
      return;
    }
    const elapsed = Date.now() - this.themeTransitionStartMs;
    if (elapsed >= THEME_TRANSITION_MS) {
      this.themeTransitionStartMs = null;
      this.lastTheme = this.gameManager.themeManager.currentTheme;
      return;
    }

    const t = elapsed / THEME_TRANSITION_MS;
    this.drawThemeLayer(this.lastTheme, 1);
    this.drawThemeLayer(this.gameManager.themeManager.currentTheme, t);
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
  //
  // Layer order (bottom to top), per step 21's spec: equipment aura ->
  // selection ring -> hero base sprite -> armor overlay icon -> HP bar/
  // labels -> weapon overlay sprite drawn dead last, so it always reads on
  // top of the body it's supposedly being held in front of/beside.
  private drawHero(hero: BattleHero): void {
    const topLeftX = hero.x - HERO_SIZE / 2;
    const topLeftY = hero.y - HERO_SIZE / 2;

    // Rarity aura first (bottom-most layer) - drawn even for a dead hero,
    // since the gear itself doesn't stop glowing just because its wearer
    // is down; the grayscale/faded sprite drawn next still reads as "down"
    // against it.
    this.drawEquipmentAura(hero);

    // Drawn before the sprite so it reads as a ground marker under the
    // character's feet, not an outline overlapping the character itself.
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

    this.drawArmorOverlay(hero);

    this.drawHpBar(topLeftX, topLeftY, HERO_SIZE, hero.stats.currentHp, hero.stats.maxHp);
    this.drawLabel(hero.evolvedInto ?? hero.heroClass, hero.x, topLeftY + HERO_SIZE + 14);
    this.drawLevelBadge(hero, topLeftX, topLeftY);

    // Weapon last (top-most layer), per the spec's explicit z-order.
    this.drawWeaponOverlay(hero);
  }

  /**
   * left/right facing, derived purely for rendering from the nearest alive
   * enemy within this hero's own max skill range (defaulting to 'right' if
   * none is in range) - BattleHero has no persistent facing/rotation state
   * of its own (heroes are stationary, grid-placed, see BattleHero.x/y's
   * doc comment), so this is recomputed fresh every frame rather than
   * being real game state anything else reads.
   */
  private getHeroFacing(hero: BattleHero): 'left' | 'right' {
    const range = hero.getMaxSkillRange();
    if (range <= 0) {
      return 'right';
    }

    const nearest = this.gameManager.combatEngine
      .getAliveEnemies()
      .map((enemy) => ({ enemy, distance: Math.hypot(enemy.x - hero.x, enemy.y - hero.y) }))
      .filter((entry) => entry.distance <= range)
      .sort((a, b) => a.distance - b.distance)[0]?.enemy;

    if (!nearest) {
      return 'right';
    }
    return nearest.x < hero.x ? 'left' : 'right';
  }

  /**
   * Weapon overlay: hero's equipped EquipmentSlot.Weapon item, drawn at a
   * fixed hero-relative offset (bottom-right of center) that mirrors
   * across the hero's x-axis when facing left, so the weapon always reads
   * as being held on the side facing the target rather than always
   * sticking out to the world's literal right. Silently skipped for a
   * hero with nothing equipped there, or an equipped item with no
   * spriteUrl (e.g. a hand-authored test item).
   */
  private drawWeaponOverlay(hero: BattleHero): void {
    const weapon = hero.getEquippedItem(EquipmentSlot.Weapon);
    if (!weapon?.spriteUrl) {
      return;
    }

    const facingLeft = this.getHeroFacing(hero) === 'left';
    const anchorX = hero.x + (facingLeft ? -WEAPON_OFFSET_X : WEAPON_OFFSET_X);
    const anchorY = hero.y + WEAPON_OFFSET_Y;
    const topLeftX = anchorX - WEAPON_SPRITE_SIZE / 2;
    const topLeftY = anchorY - WEAPON_SPRITE_SIZE / 2;

    this.ctx.save();
    if (facingLeft) {
      // Mirrors the sprite horizontally around its own anchor point rather
      // than around the hero's center, so a left-facing weapon still sits
      // at the mirrored offset instead of flipping in place.
      this.ctx.translate(anchorX, 0);
      this.ctx.scale(-1, 1);
      this.ctx.translate(-anchorX, 0);
    }
    this.applyHighEnhancementGlow(weapon);
    this.drawSprite(weapon.spriteUrl, topLeftX, topLeftY, WEAPON_SPRITE_SIZE, WEAPON_FALLBACK_COLOR);
    this.ctx.restore();
  }

  /**
   * Armor overlay: a small, semi-transparent icon layered directly over
   * the hero's body (not a full-body reskin, and not offset off to a
   * side like the weapon) - EquipmentSlot.Armor is meant to read as "worn
   * on the body," so it sits centered on the sprite itself, slightly
   * toward the upper torso.
   */
  private drawArmorOverlay(hero: BattleHero): void {
    const armor = hero.getEquippedItem(EquipmentSlot.Armor);
    if (!armor?.spriteUrl) {
      return;
    }

    const anchorX = hero.x;
    const anchorY = hero.y - HERO_SIZE * 0.1;
    const topLeftX = anchorX - ARMOR_ICON_SIZE / 2;
    const topLeftY = anchorY - ARMOR_ICON_SIZE / 2;

    this.ctx.save();
    this.ctx.globalAlpha = ARMOR_ICON_ALPHA;
    this.applyHighEnhancementGlow(armor);
    this.drawSprite(armor.spriteUrl, topLeftX, topLeftY, ARMOR_ICON_SIZE, ARMOR_FALLBACK_COLOR);
    this.ctx.restore();
  }

  /** Sets shadowBlur/shadowColor on the context for a highly-enhanced (level >= HIGH_ENHANCEMENT_LEVEL) item's sprite - a subtle outline glow layered on top of whatever aura/rarity color is already going on. No-op below the threshold, so a freshly-rolled item's sprite draws with no extra shadow cost. Caller is expected to already be inside its own ctx.save()/restore() scope (drawWeaponOverlay/drawArmorOverlay both are) so this never leaks onto later draws. */
  private applyHighEnhancementGlow(item: EquipmentItem): void {
    if (item.level < HIGH_ENHANCEMENT_LEVEL) {
      return;
    }
    this.ctx.shadowBlur = HIGH_ENHANCEMENT_SHADOW_BLUR;
    this.ctx.shadowColor = item.glowColor ?? HIGH_ENHANCEMENT_FALLBACK_GLOW;
  }

  /**
   * Breathing rarity aura at a hero's feet, drawn only while at least one
   * currently-equipped item (any slot) has a glowColor - i.e. Epic or
   * Legendary rarity (see RARITY_GLOW_COLOR). If more than one qualifying
   * item is equipped at once, the single highest-rarity one's color wins
   * outright rather than blending colors together, which would just as
   * often produce mud as anything meaningful-looking. Radius and alpha
   * both oscillate off Date.now() alone (no stored per-hero animation
   * state) via a shared sine wave, so every auraed hero pulses in sync.
   */
  private drawEquipmentAura(hero: BattleHero): void {
    const glowingItems = Object.values(hero.getAllEquipment()).filter(
      (item): item is EquipmentItem => item !== undefined && item.glowColor !== undefined,
    );
    if (glowingItems.length === 0) {
      return;
    }

    const rarityRank = (item: EquipmentItem): number => (item.rarity === EquipmentRarity.Legendary ? 1 : 0);
    const best = glowingItems.reduce((a, b) => (rarityRank(b) > rarityRank(a) ? b : a));

    // sin ranges -1..1 -> remapped to a 0..1 "breath" used for both radius
    // and alpha, so they swell and fade together rather than independently.
    const breath = (Math.sin((Date.now() / AURA_PULSE_PERIOD_MS) * Math.PI * 2) + 1) / 2;
    const radius = AURA_BASE_RADIUS + breath * AURA_RADIUS_PULSE;
    const alpha = AURA_BASE_ALPHA + breath * AURA_ALPHA_PULSE;

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = best.glowColor!;
    this.ctx.beginPath();
    this.ctx.ellipse(hero.x, hero.y + HERO_SIZE / 2, radius, radius * 0.4, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
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
  // point, same top-left-offset convention as drawHero. Step 28: the whole
  // sprite/HP-bar footprint scales by enemy.visualScale (1 for a normal
  // spawn, CLONER_SCALE for a split copy - "体型缩小 50%"), and affixed
  // enemies get three extra passes: drawShieldRing (Shielded, drawn first
  // so it sits under the sprite/HP bar like a ground-level aura), a red
  // tint filter on the sprite itself while isBerserking, and a small
  // colored affix-name label above the HP bar.
  private drawEnemy(enemy: BattleEnemy): void {
    const size = ENEMY_SIZE * enemy.visualScale;
    const topLeftX = enemy.x - size / 2;
    const topLeftY = enemy.y - size / 2;

    this.drawShieldRing(enemy, size);
    this.drawSprite(
      getEnemySpriteSrc(enemy.archetypeId),
      topLeftX,
      topLeftY,
      size,
      '#dc2626',
      1,
      enemy.isBerserking ? BERSERKER_TINT_FILTER : undefined,
    );
    this.drawHpBar(topLeftX, topLeftY, size, enemy.currentHp, enemy.maxHp);
    this.drawAffixLabels(enemy, topLeftY);
    this.drawLabel(enemy.archetypeId, enemy.x, topLeftY + size + 14);
    this.drawStatusRings(enemy);
  }

  /** Shielded affix (step 28): a translucent blue ring around the enemy's sprite footprint, only while shieldHp > 0 - reads as "still has a shield up" at a glance, gone the instant the shield's fully depleted (no lingering "empty shield" ring). */
  private drawShieldRing(enemy: BattleEnemy, size: number): void {
    if (enemy.shieldHp <= 0) {
      return;
    }
    this.ctx.save();
    this.ctx.strokeStyle = SHIELD_RING_COLOR;
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.arc(enemy.x, enemy.y, size / 2 + 4, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
  }

  /**
   * One line of small colored affix-name text directly above the HP bar
   * (which itself sits HP_BAR_OFFSET_Y above the sprite) - "在其头顶的 HP
   * 条上方，用极小的彩色字体显示其词缀名称（如 "[Shielded] [Vampiric]"）".
   * Each affix draws in its own AffixManager-defined color rather than one
   * flat color for the whole line, so e.g. a Shielded+Berserker enemy's
   * label visually distinguishes which name is which affix. No-op for an
   * enemy with no affixes at all (the vast majority of spawns).
   */
  private drawAffixLabels(enemy: BattleEnemy, topLeftY: number): void {
    if (enemy.affixes.length === 0) {
      return;
    }

    const y = topLeftY - HP_BAR_OFFSET_Y - 4;
    this.ctx.save();
    this.ctx.font = AFFIX_LABEL_FONT;
    this.ctx.textAlign = 'center';

    const labels = enemy.affixes.map((id) => `[${affixDefinitions[id].label}]`);
    const totalWidth = labels.reduce((sum, label) => sum + this.ctx.measureText(label).width + 4, -4);
    let x = enemy.x - totalWidth / 2;

    for (let i = 0; i < enemy.affixes.length; i += 1) {
      const label = labels[i];
      this.ctx.fillStyle = affixDefinitions[enemy.affixes[i]].color;
      const width = this.ctx.measureText(label).width;
      this.ctx.textAlign = 'left';
      this.ctx.fillText(label, x, y);
      x += width + 4;
    }

    this.ctx.restore();
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
  /**
   * `alpha < 1` also applies a grayscale filter alongside the opacity drop
   * - together they're what drawHero uses to render a dead BattleHero as
   * visibly "down" (see DEAD_HERO_ALPHA) without needing a dedicated death
   * sprite. `filter`, when given, overrides that grayscale entirely (step
   * 28's BERSERKER_TINT_FILTER) - the two are mutually exclusive per call,
   * never combined. Every other call site passes the defaults (alpha=1, no
   * filter), which skips both.
   */
  private drawSprite(src: string, x: number, y: number, size: number, fallbackColor: string, alpha = 1, filter?: string): void {
    const image = getImage(src);

    this.ctx.save();
    if (filter) {
      this.ctx.filter = filter;
    } else if (alpha < 1) {
      this.ctx.filter = 'grayscale(1)';
    }
    if (alpha < 1) {
      this.ctx.globalAlpha = alpha;
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

  /**
   * Step 26's loot-burst particles - reads particleManager.getParticles()
   * fresh every frame (no local caching, same pattern every other entity
   * list in this file follows) and draws each with its own rotation/scale.
   * Equipment particles draw as a small rotated square, Gold/Fragment as a
   * circle - a plain shape+color pair for now (particle.sprite is a CSS
   * color, not an image path yet), swappable for a real sprite later
   * without touching ParticleManager's physics at all. A no-op entirely
   * when this renderer wasn't constructed with a particleManager.
   */
  private drawParticles(): void {
    if (!this.particleManager) {
      return;
    }
    for (const particle of this.particleManager.getParticles()) {
      this.drawParticle(particle);
    }
  }

  private drawParticle(particle: Particle): void {
    this.ctx.save();
    this.ctx.translate(particle.x, particle.y);
    this.ctx.rotate(particle.rotation);
    this.ctx.scale(particle.scale, particle.scale);
    this.ctx.fillStyle = particle.sprite;
    this.ctx.shadowBlur = 6;
    this.ctx.shadowColor = particle.sprite;

    if (particle.type === ParticleType.Equipment) {
      this.ctx.fillRect(-6, -6, 12, 12);
    } else {
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 6, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }
}
