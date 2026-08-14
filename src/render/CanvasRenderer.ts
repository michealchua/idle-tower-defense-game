import { t } from '../locales/i18n';
import { getVisualTierForLevel } from '../data/milestoneConfig';
import { enemyArchetypes, type EnemyArchetypeId } from '../data/enemyArchetypes';
import { heroClasses } from '../data/heroConfig';
import { heroRosterConfig, getHeroDefinition } from '../data/heroRosterConfig';
import type { GachaRarity } from '../data/gachaConfig';
import { petRosterConfig, getPetDefinition } from '../data/petRosterConfig';
import { enemyHeroAttackIntervalSeconds } from '../data/enemyConfig';
import { biomeDefinitions, type BiomeDefinition } from '../data/biomeConfig';
import { getEffectiveHeroClass } from '../engine/systems/HeroSystem';
import { heroEntityKey, enemyEntityKey } from '../engine/entityKey';
import {
  getImage,
  getBackgroundImage,
  getEnemySpriteSrc,
  getHeroSpriteSrc,
  getHeroEvolvedSpriteSrc,
  getPetSpriteSrc,
  preloadSprites,
  preloadBackgroundImages,
  type SpriteImage,
} from './assetLoader';
import type { EnemyState, HeroState, PetState, Position, VisualEffect, VisualEffectKind } from '../engine/types';

// Exported so BattleScreen's canvas-native drag-to-swap can hit-test pointer
// coordinates against the same radii these are actually drawn at.
export const HERO_RADIUS = 20;
export const PET_RADIUS = 12;
const ENEMY_RADIUS = 16;
const HP_BAR_WIDTH = 40;
const HP_BAR_HEIGHT = 5;
const ATTACK_PULSE_SCALE = 0.2;
const DEATH_BURST_MAX_GROWTH = 20;
const DAMAGE_NUMBER_RISE = 40;
// Critical numbers rise further/faster than normal ones - on top of being
// bigger and a different color, this is what makes a crit read as "hit
// harder" rather than just "hit paint-swapped".
const CRITICAL_DAMAGE_NUMBER_RISE = 55;
const HEAL_NUMBER_RISE = 34;
const LEVEL_UP_RISE = 30;
const MILESTONE_UNLOCK_RISE = 45;
const DEPLOY_SLOT_SIZE = 30;

interface HeroVisualStyle {
  color: string;
  radiusMultiplier: number;
  glowColor?: string;
}

// Indexed by (tier - 1). Tunable independently of the milestone table itself -
// getVisualTierForLevel only decides WHEN the tier increases, not what it looks like.
const HERO_VISUAL_TIERS: HeroVisualStyle[] = [
  { color: '#2979ff', radiusMultiplier: 1 },
  { color: '#00bcd4', radiusMultiplier: 1.05, glowColor: 'rgba(0, 188, 212, 0.4)' },
  { color: '#9c27b0', radiusMultiplier: 1.1, glowColor: 'rgba(156, 39, 176, 0.4)' },
  { color: '#ff5722', radiusMultiplier: 1.15, glowColor: 'rgba(255, 87, 34, 0.5)' },
  { color: '#ffd700', radiusMultiplier: 1.25, glowColor: 'rgba(255, 215, 0, 0.6)' },
];

function getHeroVisualStyle(tier: number): HeroVisualStyle {
  const index = Math.min(tier, HERO_VISUAL_TIERS.length) - 1;
  return HERO_VISUAL_TIERS[index];
}

interface EnemyVisualStyle {
  color: string;
  radiusMultiplier: number;
}

// Keyed by visualId, not archetypeId - a future reskin or enemy visual
// evolution just needs a new entry here, no gameplay code touched.
const ENEMY_VISUAL_STYLES: Record<string, EnemyVisualStyle> = {
  normal: { color: '#8bc34a', radiusMultiplier: 1 },
  fast: { color: '#03a9f4', radiusMultiplier: 0.8 },
  tank: { color: '#795548', radiusMultiplier: 1.4 },
  elite: { color: '#e91e63', radiusMultiplier: 1.2 },
  swarm: { color: '#ffeb3b', radiusMultiplier: 0.6 },
  brute: { color: '#5d4037', radiusMultiplier: 1.25 },
  giant: { color: '#4a148c', radiusMultiplier: 1.6 },
  berserker: { color: '#ff7043', radiusMultiplier: 1 },
  healer: { color: '#69f0ae', radiusMultiplier: 0.9 },
  shield: { color: '#78909c', radiusMultiplier: 1.1 },
  zombie: { color: '#556b2f', radiusMultiplier: 1.1 },
  witch: { color: '#6a1b9a', radiusMultiplier: 0.95 },
  miniboss: { color: '#b71c1c', radiusMultiplier: 1.8 },
  // Deliberately far above every other archetype (next-largest is giant at
  // 1.6) - stationaryEngageDistance means it holds one spot for the whole
  // fight, so it reads as a looming wall the squad has to bring down rather
  // than just another circle in the crowd.
  boss: { color: '#000000', radiusMultiplier: 3.5 },
};

const DEFAULT_ENEMY_VISUAL_STYLE: EnemyVisualStyle = { color: '#8bc34a', radiusMultiplier: 1 };

function getEnemyVisualStyle(visualId: string): EnemyVisualStyle {
  return ENEMY_VISUAL_STYLES[visualId] ?? DEFAULT_ENEMY_VISUAL_STYLE;
}

// Maps the 14 gameplay archetypes onto a small set of shared sprite
// identities - hand-authoring 14 unique enemy sheets isn't a realistic art
// budget (same "class, not per-instance" reasoning as hero sprites keying
// off heroClass instead of the 100-entry roster id). Grouped by silhouette/
// theme, not by stat profile: swarm's the only squishy-and-numerous archetype
// so it gets its own 'slime' identity, every other non-special humanoid mob
// shares 'goblin', the two caster-flavored archetypes (healAbility/
// summonAbility) share 'witch', and both boss tiers share 'demon_boss'.
// Exported so CodexPanel's enemy-tab avatars use the exact same shared
// sprite grouping the battle canvas itself draws from (see CanvasRenderer.
// drawEnemy) - a codex entry never shows a different image than what that
// archetype actually looks like on the field.
export const ENEMY_SPRITE_TYPE: Record<EnemyArchetypeId, string> = {
  normal: 'goblin',
  fast: 'goblin',
  tank: 'goblin',
  elite: 'goblin',
  swarm: 'slime',
  brute: 'goblin',
  giant: 'goblin',
  berserker: 'goblin',
  healer: 'witch',
  shield: 'goblin',
  zombie: 'zombie',
  witch: 'witch',
  miniboss: 'demon_boss',
  boss: 'demon_boss',
};

const HP_BAR_RADIUS = HP_BAR_HEIGHT / 2;

interface HpBarRequest {
  x: number;
  y: number;
  ratio: number;
}

// Batched form of drawHpBar for a same-frame group of entities (all
// currently-drawn heroes, or all currently-drawn enemies) - every entity's
// bar used to set ctx.fillStyle twice on its own (background, then health
// color), interleaved with that entity's own body/sprite draw calls. Doing
// every background fillRect first (one fillStyle assignment), then every
// "healthy" fill, then every "danger" fill collapses that to exactly 3
// fillStyle assignments total for the whole group, independent of how many
// entities are in it, instead of up to 2xN.
//
// Trade-off, stated plainly rather than left implicit: this draws the whole
// group's bars *after* the whole group's bodies, where the original code
// drew each entity's own bar immediately after that same entity's body. In
// this game's grid/lane layouts entities don't visually overlap enough for
// that reordering to read as different on screen, but it is a real
// (if imperceptible) change to draw order, not a byte-for-byte-identical
// output guarantee - the standard trade-off for batching draw calls by
// state, called out here instead of glossed over.
// Same rounded-pill/tiered-color/glossy-highlight treatment as drawHpBar,
// batched the same way the flat-rect version was: every bar's background
// pill first, then each color tier's filled portion in one pass, then one
// shared highlight pass - a fixed number of fillStyle assignments (1
// background + 3 tiers + 1 highlight = 5) independent of how many bars are
// in the group, same property the original 3-assignment version had, just
// with two more tiers/passes for the added polish.
const HP_BAR_TIERS: { matches: (ratio: number) => boolean; color: string }[] = [
  { matches: (ratio) => ratio > 0.55, color: '#4caf50' },
  { matches: (ratio) => ratio > 0.3 && ratio <= 0.55, color: '#ffb300' },
  { matches: (ratio) => ratio <= 0.3, color: '#e53935' },
];

function drawHpBarsBatched(ctx: CanvasRenderingContext2D, bars: HpBarRequest[]): void {
  if (bars.length === 0) {
    return;
  }

  ctx.fillStyle = 'rgba(10, 10, 14, 0.75)';
  for (const bar of bars) {
    ctx.beginPath();
    ctx.roundRect(bar.x - HP_BAR_WIDTH / 2, bar.y, HP_BAR_WIDTH, HP_BAR_HEIGHT, HP_BAR_RADIUS);
    ctx.fill();
  }

  for (const tier of HP_BAR_TIERS) {
    ctx.fillStyle = tier.color;
    for (const bar of bars) {
      if (!tier.matches(bar.ratio)) {
        continue;
      }
      const filledWidth = HP_BAR_WIDTH * Math.max(0, Math.min(1, bar.ratio));
      if (filledWidth <= 0.5) {
        continue;
      }
      ctx.beginPath();
      ctx.roundRect(bar.x - HP_BAR_WIDTH / 2, bar.y, filledWidth, HP_BAR_HEIGHT, HP_BAR_RADIUS);
      ctx.fill();
    }
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  for (const bar of bars) {
    const filledWidth = HP_BAR_WIDTH * Math.max(0, Math.min(1, bar.ratio));
    if (filledWidth <= 0.5) {
      continue;
    }
    ctx.beginPath();
    ctx.roundRect(bar.x - HP_BAR_WIDTH / 2, bar.y, filledWidth, HP_BAR_HEIGHT * 0.45, HP_BAR_RADIUS * 0.8);
    ctx.fill();
  }
}

// Drawn centered on top of the fallback circle/square whenever a sprite
// hasn't loaded (missing file, still decoding, or failed) - see drawHero/
// drawEnemy/drawPet. save/restore rather than resetting textBaseline by hand
// afterward, since every other text draw in this file (damage numbers, level
// up, etc.) relies on the canvas default 'alphabetic' baseline and would
// silently shift position if this leaked past its own draw call.
function drawFallbackGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, glyph: string, fontSize: number): void {
  ctx.save();
  ctx.font = `bold ${Math.round(fontSize)}px sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, x, y);
  ctx.restore();
}

// --- Procedural fallback silhouettes -------------------------------------
//
// Everything below draws a shaded, shaped silhouette in place of a real
// sprite - used by drawHero/drawEnemy/drawPet/renderScene's castle whenever
// the corresponding PNG hasn't been dropped into public/sprites/ yet (most
// of the enemy roster, half the hero classes, every pet, the castle itself -
// see ART_ASSET_CHECKLIST.md). A flat single-color circle-plus-letter read as
// an obvious debug placeholder; a gradient-shaded, category-shaped silhouette
// (humanoid/slime/creature/castle) reads as "stylized but intentional" and
// upgrades to the real sprite automatically the moment one is dropped in, no
// code change needed on that side.

// Linear-interpolates an existing hex color toward white (percent > 0) or
// black (percent < 0) - the standard "shade" trick for deriving a
// highlight/shadow tone from a single base color without hand-authoring a
// second palette entry per entity type.
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const value = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function shadeColor(hex: string, percent: number): string {
  const [r, g, b] = hexToRgb(hex);
  const target = percent < 0 ? 0 : 255;
  const p = Math.min(1, Math.abs(percent));
  const mix = (channel: number) => Math.round((target - channel) * p) + channel;
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

// Used by the 'particleBurst' draw case - every other per-particle color
// here is a fixed hex from effectConfig.particleBurstConfig, only the alpha
// (fade-out) varies per frame.
function colorWithAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Upper-left-lit radial gradient from a single base color - this one call is
// what turns every flat-fill silhouette below into something that reads as
// shaded/rendered instead of a paint-bucket fill.
function radialShadedFill(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, baseColor: string): CanvasGradient {
  const gradient = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.45, radius * 0.1, x, y, radius * 1.2);
  gradient.addColorStop(0, shadeColor(baseColor, 0.4));
  gradient.addColorStop(0.6, baseColor);
  gradient.addColorStop(1, shadeColor(baseColor, -0.3));
  return gradient;
}

// Soft contact shadow beneath a unit's feet - drawn for both real sprites
// and procedural silhouettes alike (called from drawHero/drawEnemy/drawPet
// before either), since "floating flat against the background" was never
// specific to the placeholder shapes. yBottom is where the unit's feet sit,
// not its center - see call sites.
function drawGroundShadow(ctx: CanvasRenderingContext2D, x: number, yBottom: number, radiusX: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(x, yBottom, radiusX, radiusX * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Shared "head + body" construction (two overlapping ellipses) used by every
// biped silhouette (hero fallback, goblin/zombie enemy fallback) - safe,
// mechanical primitives rather than a hand-tuned bezier outline, so it
// renders correctly at the small sizes these draw at without needing visual
// iteration to get a curve right.
function drawSilhouetteBody(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, fillStyle: string | CanvasGradient, strokeStyle: string): void {
  ctx.fillStyle = fillStyle;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.ellipse(x, y + radius * 0.3, radius * 0.62, radius * 0.56, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y - radius * 0.4, radius * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// One silhouette per shared enemy sprite identity (see ENEMY_SPRITE_TYPE) -
// 'demon_boss' never reaches this path (that file always exists), so only
// the four non-boss identities need a case here.
function drawProceduralEnemySilhouette(ctx: CanvasRenderingContext2D, spriteType: string, x: number, y: number, radius: number, baseColor: string): void {
  const fill = radialShadedFill(ctx, x, y, radius, baseColor);
  const outline = shadeColor(baseColor, -0.45);

  if (spriteType === 'slime') {
    ctx.fillStyle = fill;
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(1, radius * 0.07);
    ctx.beginPath();
    ctx.ellipse(x, y + radius * 0.15, radius * 0.95, radius * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Glossy highlight - the one thing that reliably reads as "wet/squishy"
    // on an otherwise plain blob.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.ellipse(x - radius * 0.32, y - radius * 0.1, radius * 0.22, radius * 0.14, -0.4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (spriteType === 'witch') {
    drawSilhouetteBody(ctx, x, y, radius, fill, outline);
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.moveTo(x, y - radius * 1.3);
    ctx.lineTo(x - radius * 0.32, y - radius * 0.5);
    ctx.lineTo(x + radius * 0.32, y - radius * 0.5);
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (spriteType === 'zombie') {
    // A slight lean is the cheapest possible "shambling" tell versus the
    // upright goblin silhouette below.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.14);
    drawSilhouetteBody(ctx, 0, 0, radius, fill, outline);
    ctx.restore();
    return;
  }

  // 'goblin' and any future/unmapped type share the plain upright body -
  // the eight archetypes that key into 'goblin' already read as distinct via
  // ENEMY_VISUAL_STYLES' per-archetype color/radiusMultiplier.
  drawSilhouetteBody(ctx, x, y, radius, fill, outline);
}

// One silhouette per hero class that has no real art yet (archer/assassin/
// priest/special - see ART_ASSET_CHECKLIST.md) - shares the same body as the
// enemy silhouettes above, plus one thin accent stroke per class so the four
// don't all read as the same generic figure.
function drawHeroSilhouette(ctx: CanvasRenderingContext2D, heroClass: string, x: number, y: number, radius: number, baseColor: string): void {
  const fill = radialShadedFill(ctx, x, y, radius, baseColor);
  const outline = shadeColor(baseColor, -0.4);
  drawSilhouetteBody(ctx, x, y, radius, fill, outline);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = Math.max(1, radius * 0.09);
  ctx.lineCap = 'round';

  switch (heroClass) {
    case 'archer': {
      ctx.beginPath();
      ctx.arc(x + radius * 0.78, y, radius * 0.55, Math.PI * 0.65, Math.PI * 1.35);
      ctx.stroke();
      return;
    }
    case 'assassin': {
      ctx.beginPath();
      ctx.moveTo(x - radius * 0.5, y - radius * 0.55);
      ctx.lineTo(x + radius * 0.5, y + radius * 0.15);
      ctx.moveTo(x + radius * 0.5, y - radius * 0.55);
      ctx.lineTo(x - radius * 0.5, y + radius * 0.15);
      ctx.stroke();
      return;
    }
    case 'priest': {
      ctx.beginPath();
      ctx.ellipse(x, y - radius * 0.88, radius * 0.3, radius * 0.1, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    case 'special': {
      ctx.beginPath();
      ctx.arc(x, y + radius * 0.2, radius * 0.88, -0.4, Math.PI * 1.1);
      ctx.stroke();
      return;
    }
    default:
      return;
  }
}

// Small "creature" silhouette (round body + triangle ears + a tail) for any
// pet without a dedicated sprite yet - deliberately distinct from the biped
// hero/enemy silhouette so a pet reads as "companion", not "tiny enemy".
function drawPetSilhouette(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, baseColor: string): void {
  const fill = radialShadedFill(ctx, x, y, radius, baseColor);
  const outline = shadeColor(baseColor, -0.4);
  ctx.fillStyle = fill;
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(1, radius * 0.08);

  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + side * radius * 0.55, y - radius * 0.35);
    ctx.lineTo(x + side * radius * 0.75, y - radius * 1.05);
    ctx.lineTo(x + side * radius * 0.15, y - radius * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(x, y, radius * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x + radius * 0.72, y + radius * 0.28, radius * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// --- Sprite sheet frame animation --------------------------------------
//
// Shared layout convention for every hero/enemy sheet dropped into
// public/sprites/{heroes,enemies}/ - one 32x32 frame per cell (matches the
// 32x32 pixel-art asset prompts already generated for this project), row 0
// is the walk/idle loop, row 1 is the attack loop. Pets only ever use 'walk'
// (see PetSystem.ts - no combat AI, so there's no attack state to animate).
// A single shared config rather than one per entity keeps this simple; if a
// real sheet ever needs a different layout, split this into a lookup keyed
// by sprite src instead of changing the shape wholesale.
type SpriteAnimationState = 'walk' | 'attack';

interface SpriteAnimationConfig {
  row: number;
  frameCount: number;
  fps: number;
}

const SPRITE_SHEET_CONFIG: { frameWidth: number; frameHeight: number; animations: Record<SpriteAnimationState, SpriteAnimationConfig> } = {
  frameWidth: 32,
  frameHeight: 32,
  animations: {
    walk: { row: 0, frameCount: 4, fps: 8 },
    attack: { row: 1, frameCount: 4, fps: 10 },
  },
};

// Facing convention: every sheet in this project (hero/pet/enemy alike) is
// authored facing right - a single shared assumption rather than one per
// category, since there's no reason hero and enemy source art would use
// different conventions. If a real asset set turns out authored the other
// way, flip this one constant rather than hunting down every call site.
const SPRITE_SOURCE_FACING: 'left' | 'right' = 'right';

// What should actually appear on screen, independent of the source
// convention above: heroes/pets are stationed facing the oncoming enemies
// (rightward, toward the spawn side), enemies face their direction of travel
// (leftward, toward the base) - see mapConfig.ts's spawnPosition/
// basePosition. Compared against SPRITE_SOURCE_FACING in needsFlip to decide
// whether that category needs a horizontal mirror.
const DESIRED_FACING: Record<'hero' | 'pet' | 'enemy', 'left' | 'right'> = {
  hero: 'right',
  pet: 'right',
  enemy: 'left',
};

function needsFlip(kind: 'hero' | 'pet' | 'enemy'): boolean {
  return DESIRED_FACING[kind] !== SPRITE_SOURCE_FACING;
}

// Slices one frame out of a sheet and draws it scaled to (size x size)
// centered on (x, y) - the source sample stays a crisp frameWidth x
// frameHeight rect regardless of how big size scales it up, so pixel art
// stays sharp (see renderScene's imageSmoothingEnabled = false). Frame index
// is derived straight from wall-clock time (nowSeconds * fps, wrapped by
// frameCount), not a stored animation-state field - there's nothing to reset
// on state change, a sprite switching from walk to attack just starts
// sampling a different row at whatever phase the clock is already at.
// columnsAvailable clamps against the sheet's actual width in case a real
// file has fewer frames than SPRITE_SHEET_CONFIG assumes, rather than
// reading past the image. flip mirrors horizontally around (x, y) - see
// needsFlip.
function drawSpriteFrame(
  ctx: CanvasRenderingContext2D,
  image: SpriteImage,
  state: SpriteAnimationState,
  nowSeconds: number,
  x: number,
  y: number,
  size: number,
  flip: boolean,
): void {
  const anim = SPRITE_SHEET_CONFIG.animations[state];
  const { frameWidth, frameHeight } = SPRITE_SHEET_CONFIG;
  const columnsAvailable = Math.max(1, Math.floor(image.width / frameWidth));
  const frameCount = Math.min(anim.frameCount, columnsAvailable);
  const frameIndex = Math.floor(nowSeconds * anim.fps) % frameCount;
  const sx = frameIndex * frameWidth;
  const sy = anim.row * frameHeight;

  if (flip) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(image, sx, sy, frameWidth, frameHeight, -size / 2, -size / 2, size, size);
    ctx.restore();
    return;
  }

  ctx.drawImage(image, sx, sy, frameWidth, frameHeight, x - size / 2, y - size / 2, size, size);
}

// Generous upper bound on how many columns/rows a real sheet in this project
// could plausibly have - SPRITE_SHEET_CONFIG only needs 4 columns x 2 rows
// today, this leaves headroom for a richer sheet later without needing a
// matching bump here. The upper bound is what actually matters: a lower-only
// check (just "wider than one frame") would be trivially true for a huge
// single illustration too - width >= 64px is nothing for a 1024x1024 image -
// so width/height both have to land in a believable *sheet-sized* range, not
// just "big enough to contain 2 frames' worth of pixels".
const MAX_SHEET_COLUMNS = 12;
const MAX_SHEET_ROWS = 6;

// A real animated sheet needs at least 2 columns (something to animate
// between) and both the walk (row 0) and attack (row 1) rows present, all at
// SPRITE_SHEET_CONFIG's 32x32 cell size, and needs to actually look
// sheet-sized (see MAX_SHEET_COLUMNS/ROWS above). A single large
// illustration - e.g. a 1024x1024 AI-generated character portrait, which is
// exactly what's actually been dropped into public/sprites/ so far - fails
// the upper bound and is drawn whole instead (see drawStaticSprite) rather
// than sliced into a meaningless 32x32 corner crop. Once a real multi-frame
// sheet replaces a portrait at the same path, this starts returning true and
// the exact same draw call animates automatically - no other code path
// changes.
function isFrameSheet(image: SpriteImage): boolean {
  const { frameWidth, frameHeight } = SPRITE_SHEET_CONFIG;
  const widthInRange = image.width >= frameWidth * 2 && image.width <= frameWidth * MAX_SHEET_COLUMNS;
  const heightInRange = image.height >= frameHeight * 2 && image.height <= frameHeight * MAX_SHEET_ROWS;
  return widthInRange && heightInRange;
}

// Whole-image draw for a sprite that isn't laid out as a frame sheet (see
// isFrameSheet) - "contain" fit (scale to fit inside size x size, preserving
// aspect ratio) rather than stretching, so a non-square source like
// demon_boss.png (1024x592) doesn't get visibly squashed into a square. No
// animation, but still real art instead of either a broken slice or the
// geometric fallback - the middle rung of this file's three-tier fallback
// (animated sheet > static image > geometric shape).
// smooth=true opts back into bilinear/bicubic sampling for this one draw
// call, overriding renderScene's frame-wide imageSmoothingEnabled=false -
// appropriate for a hi-res illustrated static sprite (hero art) being scaled
// way down, where nearest-neighbor would alias into noise; wrong for an
// actual 32x32 pixel-art asset (enemy/tower/pet sheets, or their static-image
// fallback), which wants to stay crisp. Always restored before returning so
// the smoothing flag never leaks into the next draw call.
function drawStaticSprite(ctx: CanvasRenderingContext2D, image: SpriteImage, x: number, y: number, size: number, flip: boolean, smooth = false): void {
  const scale = Math.min(size / image.width, size / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;

  if (smooth) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }

  if (flip) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  } else {
    ctx.drawImage(image, x - drawWidth / 2, y - drawHeight / 2, drawWidth, drawHeight);
  }

  if (smooth) {
    ctx.restore();
  }
}

// Single entry point drawHero/drawEnemy/drawPet call once a sprite has
// resolved - dispatches to whichever of the two tiers above actually fits
// the loaded image, so call sites never need to know which one they got.
function drawEntitySprite(
  ctx: CanvasRenderingContext2D,
  image: SpriteImage,
  state: SpriteAnimationState,
  nowSeconds: number,
  x: number,
  y: number,
  size: number,
  flip: boolean,
  smooth = false,
): void {
  if (isFrameSheet(image)) {
    drawSpriteFrame(ctx, image, state, nowSeconds, x, y, size, flip);
  } else {
    drawStaticSprite(ctx, image, x, y, size, flip, smooth);
  }
}

// A hit reads as "just landed" for this long after CombatSystem resets the
// attacker's cooldown - long enough for a few attack frames to actually
// play, short enough to fall back to the walk/idle loop well before the next
// swing on any reasonable attack speed.
const ATTACK_ANIM_WINDOW_SECONDS = 0.2;

// Heroes never move (mapConfig.heroPosition is fixed) - 'walk' functions as
// their idle-bob loop, 'attack' takes over for the brief window right after
// CombatSystem.tickAttackerCombat resets attackCooldownRemaining to
// 1/attackSpeed. Derived entirely from existing HeroState fields, no new
// per-hero "am I attacking" state needed.
function getHeroAnimationState(hero: HeroState): SpriteAnimationState {
  const cooldownDuration = hero.attackSpeed > 0 ? 1 / hero.attackSpeed : 0;
  const justAttacked = cooldownDuration > 0 && hero.attackCooldownRemaining > cooldownDuration - ATTACK_ANIM_WINDOW_SECONDS;
  return justAttacked ? 'attack' : 'walk';
}

// Mirror of getHeroAnimationState, enemy-side - CombatSystem.
// tickEnemyAttacksOnHeroes only resets heroAttackCooldownRemaining to
// enemyHeroAttackIntervalSeconds when the enemy actually lands a hit (not on
// every tick), so the same "still within the fresh window" check works here
// too. An enemy that's just marching (never in range yet) keeps its default
// 'walk' state.
function getEnemyAnimationState(enemy: EnemyState): SpriteAnimationState {
  const justAttacked = enemy.heroAttackCooldownRemaining > enemyHeroAttackIntervalSeconds - ATTACK_ANIM_WINDOW_SECONDS;
  return justAttacked ? 'attack' : 'walk';
}

// Every heroRosterConfig entry of the same class carries an identical
// evolutionBranches array (see heroRosterConfig.ts's heroClassEvolutionBranches)
// - deduping through a Set means this ends up as just the 8 actual branch
// ids (2 per class x 4 classes) instead of 100 duplicate lookups.
function getAllEvolutionBranchIds(): string[] {
  const ids = new Set<string>();
  for (const hero of heroRosterConfig) {
    for (const branch of hero.evolutionBranches) {
      ids.add(branch.id);
    }
  }
  return Array.from(ids);
}

// Kicks off a load for every sprite/background this battle screen could
// possibly need - call once from BattleScreen's mount effect. Everything
// here is keyed by class/archetype-type/roster-id/biome (see assetLoader's
// getXSpriteSrc doc comments), so the full list stays small and fixed
// (4 hero classes + 8 evolution branches + 4 enemy sprite types + every pet +
// every biome background) regardless of how many hero/enemy instances end up
// on field.
export function preloadBattleSprites(): void {
  const enemySpriteTypes = new Set(Object.values(ENEMY_SPRITE_TYPE));

  preloadSprites([
    ...heroClasses.flatMap((heroClass) => [getHeroSpriteSrc(heroClass, 'walk'), getHeroSpriteSrc(heroClass, 'attack')]),
    ...getAllEvolutionBranchIds().flatMap((branchId) => [getHeroEvolvedSpriteSrc(branchId, 'walk'), getHeroEvolvedSpriteSrc(branchId, 'attack')]),
    ...Array.from(enemySpriteTypes).map((type) => getEnemySpriteSrc(type)),
    ...petRosterConfig.map((pet) => getPetSpriteSrc(pet.spriteId ?? pet.id)),
  ]);
  // Backgrounds go through a separate, un-stripped cache - see
  // getBackgroundImage's doc comment for why they can't share getImage's
  // sprite-oriented checkerboard-alpha processing.
  preloadBackgroundImages(Object.values(biomeDefinitions).map((biome) => biome.backgroundImage));
}

// Builds a "latest effect of this kind, per entityKey" index in one pass
// over visualEffects - used so drawHero/drawEnemy can look up "the effect
// that belongs to ME" in O(1) instead of each re-scanning the whole array.
// Smallest age wins on a collision (freshest hit), though in practice a
// given entityKey only ever has one live attackFlash/hitReaction at a time
// given their short lifetimes.
function buildEntityEffectIndex(visualEffects: VisualEffect[], kind: VisualEffectKind): Map<string, VisualEffect> {
  const index = new Map<string, VisualEffect>();
  for (const effect of visualEffects) {
    if (effect.kind !== kind || !effect.entityKey) {
      continue;
    }
    const existing = index.get(effect.entityKey);
    if (!existing || effect.age < existing.age) {
      index.set(effect.entityKey, effect);
    }
  }
  return index;
}

function pulseScaleFromEffect(effect: VisualEffect | undefined): number {
  if (!effect) {
    return 1;
  }
  const remainingRatio = 1 - effect.age / effect.lifetime;
  return 1 + ATTACK_PULSE_SCALE * remainingRatio;
}

// Brief white flash + squash/stretch on whichever specific hero/enemy sprite
// a 'hitReaction' effect is attributed to (see VisualEffectKind's doc
// comment) - wraps just the sprite/silhouette draw call, not the whole
// entity (shadow/name label stay undistorted). heavy hits (crit landed, or a
// hero going down) get a stronger flash+squash than a plain hit.
const HIT_FLASH_BRIGHTNESS = 1.6;
const HIT_SQUASH_AMOUNT = 0.14;

function drawEntityWithHitReaction(
  ctx: CanvasRenderingContext2D,
  hitEffect: VisualEffect | undefined,
  x: number,
  y: number,
  draw: () => void,
): void {
  if (!hitEffect) {
    draw();
    return;
  }
  const intensity = Math.max(0, 1 - hitEffect.age / hitEffect.lifetime);
  const heavyMultiplier = hitEffect.isCritical ? 1.5 : 1;
  ctx.save();
  ctx.translate(x, y);
  const squash = HIT_SQUASH_AMOUNT * intensity * heavyMultiplier;
  ctx.scale(1 + squash, 1 - squash);
  ctx.translate(-x, -y);
  ctx.filter = `brightness(${1 + intensity * HIT_FLASH_BRIGHTNESS * heavyMultiplier})`;
  draw();
  ctx.restore();
}

function drawVisualEffect(ctx: CanvasRenderingContext2D, effect: VisualEffect): void {
  const progress = effect.age / effect.lifetime;
  const fadeAlpha = 1 - progress;

  switch (effect.kind) {
    case 'attackFlash': {
      if (effect.targetX === undefined || effect.targetY === undefined) {
        return;
      }
      ctx.strokeStyle = `rgba(255, 255, 255, ${fadeAlpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(effect.x, effect.y);
      ctx.lineTo(effect.targetX, effect.targetY);
      ctx.stroke();
      return;
    }
    case 'deathBurst': {
      const radius = ENEMY_RADIUS + progress * DEATH_BURST_MAX_GROWTH;
      ctx.strokeStyle = `rgba(255, 140, 0, ${fadeAlpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    case 'damageNumber': {
      // How much of the target's max HP this single hit was - 0 for a
      // graze, saturating at 1 once a hit is ~25%+ of maxHp ("execute"-sized)
      // - see DamageSystem.applyDamage/applyDamageToHero for where this is
      // computed. Drives font size/rise/punch on top of the existing crit-
      // vs-plain split, so a genuinely huge hit still reads as huge even if
      // it wasn't a crit roll.
      const magnitude = Math.min(1, (effect.amountRatio ?? 0) * 4);

      if (!effect.isCritical) {
        // Plain hits: small, white, no scale animation - kept cheap since
        // these are by far the most common effect in a busy fight. Still
        // grows a little with magnitude so a heavy non-crit hit doesn't look
        // identical to a graze.
        const fontSize = 13 + magnitude * 9;
        const rise = DAMAGE_NUMBER_RISE + magnitude * 18;
        const y = effect.y - progress * rise;
        ctx.font = `${Math.round(fontSize)}px sans-serif`;
        ctx.fillStyle = `rgba(255, 255, 255, ${fadeAlpha})`;
        ctx.textAlign = 'center';
        ctx.fillText(`-${Math.round(effect.amount ?? 0)}`, effect.x, y);
        return;
      }

      // Crits: big, hot-colored (yellow fading to red as it dies so the
      // color shift itself reads as "impact fading"), with a punch-in scale
      // that overshoots then settles - the whole "hit harder" read comes from
      // stacking size + color + this motion, not any one of them alone.
      const rise = CRITICAL_DAMAGE_NUMBER_RISE + magnitude * 25;
      const y = effect.y - progress * rise;
      const punch = Math.max(0, 1 - progress * 3);
      const scale = 1 + punch * (0.9 + magnitude * 0.7);
      const colorMix = Math.min(1, progress * 1.5);
      const red = 255;
      const green = Math.round(214 * (1 - colorMix));
      ctx.save();
      ctx.translate(effect.x, y);
      ctx.scale(scale, scale);
      ctx.font = `bold ${24 + Math.round(magnitude * 8)}px sans-serif`;
      ctx.fillStyle = `rgba(${red}, ${green}, 0, ${fadeAlpha})`;
      ctx.textAlign = 'center';
      ctx.fillText(`-${Math.round(effect.amount ?? 0)}`, 0, 0);
      ctx.restore();
      return;
    }
    case 'healNumber': {
      const y = effect.y - progress * HEAL_NUMBER_RISE;
      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = `rgba(105, 240, 174, ${fadeAlpha})`;
      ctx.textAlign = 'center';
      ctx.fillText(`+${Math.round(effect.amount ?? 0)}`, effect.x, y);
      return;
    }
    case 'levelUp': {
      const y = effect.y - HERO_RADIUS - 20 - progress * LEVEL_UP_RISE;
      ctx.font = 'bold 16px sans-serif';
      ctx.fillStyle = `rgba(255, 215, 0, ${fadeAlpha})`;
      ctx.textAlign = 'center';
      ctx.fillText(t('hero.levelUp'), effect.x, y);
      return;
    }
    case 'milestoneUnlock': {
      const y = effect.y - HERO_RADIUS - 20 - progress * MILESTONE_UNLOCK_RISE;
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = `rgba(255, 215, 0, ${fadeAlpha})`;
      ctx.textAlign = 'center';
      ctx.fillText(t('hero.milestoneUnlock'), effect.x, y);
      return;
    }
    case 'skillImpact': {
      const maxRadius = effect.radius ?? 40;
      const radius = maxRadius * progress;
      ctx.fillStyle = `rgba(255, 87, 34, ${fadeAlpha * 0.5})`;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 193, 7, ${fadeAlpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    case 'lightningBolt': {
      if (effect.targetX === undefined || effect.targetY === undefined) {
        return;
      }
      ctx.strokeStyle = `rgba(255, 235, 59, ${fadeAlpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(effect.x, effect.y);
      ctx.lineTo(effect.targetX, effect.targetY);
      ctx.stroke();
      return;
    }
    case 'healPulse': {
      const maxRadius = effect.radius ?? 40;
      const radius = maxRadius * progress;
      ctx.strokeStyle = `rgba(105, 240, 174, ${fadeAlpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    case 'shieldBreak': {
      const radius = ENEMY_RADIUS + progress * 12;
      ctx.strokeStyle = `rgba(64, 196, 255, ${fadeAlpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    case 'revive': {
      const radius = ENEMY_RADIUS + progress * 16;
      ctx.strokeStyle = `rgba(192, 202, 51, ${fadeAlpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    case 'summon': {
      const maxRadius = effect.radius ?? 24;
      const radius = maxRadius * progress;
      ctx.strokeStyle = `rgba(106, 27, 154, ${fadeAlpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    case 'waveClear': {
      const y = effect.y - 30 - progress * MILESTONE_UNLOCK_RISE;
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = `rgba(255, 215, 0, ${fadeAlpha})`;
      ctx.textAlign = 'center';
      ctx.fillText(t('wave.cleared'), effect.x, y);
      return;
    }
    case 'hitReaction': {
      // Never drawn directly - CanvasRenderer looks these up by entityKey
      // (see buildEntityEffectIndex/drawEntityWithHitReaction) and reacts on
      // the specific hero/enemy sprite instead of drawing a standalone shape.
      return;
    }
    case 'particleBurst': {
      const particles = effect.particles ?? [];
      const color = effect.color ?? '#ffffff';
      for (const particle of particles) {
        const traveled = particle.speed * effect.age;
        const px = effect.x + Math.cos(particle.angle) * traveled;
        // Slight upward drift on top of the radial spread - reads as a
        // "pop" rather than particles just sliding outward flat.
        const py = effect.y + Math.sin(particle.angle) * traveled - effect.age * 24;
        const particleSize = Math.max(0.5, 2.2 * fadeAlpha);
        ctx.fillStyle = colorWithAlpha(color, fadeAlpha);
        ctx.beginPath();
        ctx.arc(px, py, particleSize, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
  }
}

// Matches index.css's --rarity-* palette (hardcoded here since canvas fill
// styles can't reference CSS custom properties) - same rarity identity the
// roster list/detail panel already color hero names by, extended to the
// in-combat name label. Rainbow has no single solid color in CSS either
// (see .rarity-rainbow's gradient text) - borrows its brightest gradient
// stop as a stand-in solid accent, same choice GachaPanel's reveal cards use.
const RARITY_NAME_COLOR: Record<GachaRarity, string> = {
  white: '#c7cbd6',
  green: '#52d17c',
  blue: '#4da3ff',
  purple: '#c07bff',
  gold: '#ffb648',
  red: '#ff3b3b',
  rainbow: '#69f0ae',
};

function drawHero(
  ctx: CanvasRenderingContext2D,
  hero: HeroState,
  attackFlashByEntity: Map<string, VisualEffect>,
  hitReactionByEntity: Map<string, VisualEffect>,
  nowSeconds: number,
): HpBarRequest {
  const heroStyle = getHeroVisualStyle(getVisualTierForLevel(hero.level));
  const pulseScale = pulseScaleFromEffect(attackFlashByEntity.get(heroEntityKey(hero.id)));
  const heroRadius = HERO_RADIUS * heroStyle.radiusMultiplier * pulseScale;

  // Downed (HeroState.isDowned, see DamageSystem.applyDamageToHero) heroes
  // stay on the field - dimmed and desaturated rather than removed, so the
  // squad-wipe lose condition (WaveSystem.tickWaveProgress's checkSquadWipe)
  // reads visually before it actually triggers, instead of heroes just
  // vanishing one by one with no feedback.
  ctx.save();
  if (hero.isDowned) {
    ctx.globalAlpha = 0.45;
    ctx.filter = 'grayscale(1)';
  } else if (heroStyle.glowColor) {
    ctx.fillStyle = heroStyle.glowColor;
    ctx.beginPath();
    ctx.arc(hero.position.x, hero.position.y, heroRadius + 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sprites are keyed by class (warrior/mage/paladin/summoner), not by the
  // 100-entry roster id - see assetLoader.getHeroSpriteSrc's doc comment.
  // getEffectiveHeroClass accounts for an evolved hero's branch-shifted
  // class, so an evolved mage that branched into a different class still
  // gets the right *base* sprite as a fallback below.
  const heroClass = getEffectiveHeroClass(hero);

  // Evolution-aware: a hero that's committed to a branch (HeroSystem.
  // evolveHero, permanent, see HeroState.evolutionBranchId) prefers its own
  // evolved art over the plain class one - falls back to the base class
  // sprite if the evolved file isn't there yet, so evolving doesn't
  // regress a hero from "real sprite" back to "geometric shape" just because
  // its specific evolved art hasn't been dropped in.
  //
  // Hero art is a walk/attack pair of static illustrations, not a frame
  // sheet (see getHeroSpriteSrc's doc comment) - the animation state picks
  // which file to load. Not every class/branch has an attack pose drawn yet,
  // so a missing attack file falls back to that same source's walk pose
  // rather than the geometric fallback - a hero mid-swing should still show
  // its real art, just without the swing itself, instead of regressing to a
  // colored circle for the ~0.2s attack window (see ATTACK_ANIM_WINDOW_SECONDS).
  const animState = getHeroAnimationState(hero);
  const evolvedSprite = hero.evolutionBranchId
    ? (getImage(getHeroEvolvedSpriteSrc(hero.evolutionBranchId, animState)) ?? getImage(getHeroEvolvedSpriteSrc(hero.evolutionBranchId, 'walk')))
    : undefined;
  const sprite = evolvedSprite ?? getImage(getHeroSpriteSrc(heroClass, animState)) ?? getImage(getHeroSpriteSrc(heroClass, 'walk'));

  drawGroundShadow(ctx, hero.position.x, hero.position.y + heroRadius * 0.9, heroRadius * 0.8);

  ctx.font = '10px sans-serif';
  ctx.fillStyle = RARITY_NAME_COLOR[getHeroDefinition(hero.id).rarity];
  ctx.textAlign = 'center';
  ctx.fillText(hero.name, hero.position.x, hero.position.y - heroRadius - 18);

  const hitEffect = hitReactionByEntity.get(heroEntityKey(hero.id));
  drawEntityWithHitReaction(ctx, hitEffect, hero.position.x, hero.position.y, () => {
    if (sprite) {
      const size = heroRadius * 2;
      // smooth=false (not true) - hero art is pixel art now (see
      // scripts/pixel_sprites.py), so it wants the same crisp nearest-
      // neighbor scaling as every other sprite category, not the bilinear
      // smoothing a hi-res illustration would've wanted.
      drawEntitySprite(ctx, sprite, animState, nowSeconds, hero.position.x, hero.position.y, size, needsFlip('hero'), false);
    } else {
      drawHeroSilhouette(ctx, heroClass, hero.position.x, hero.position.y, heroRadius, heroStyle.color);
      drawFallbackGlyph(ctx, hero.position.x, hero.position.y, heroClass.charAt(0).toUpperCase(), heroRadius * 0.75);
    }
  });

  ctx.restore();

  return { x: hero.position.x, y: hero.position.y - HERO_RADIUS - 12, ratio: hero.currentHp / hero.maxHp };
}

// Pets are static-stat combatants with no evolution tier - one plain style
// keeps them visually secondary to heroes, used only as a fallback when no
// dedicated sprite has been dropped in yet (see drawPet).
const PET_VISUAL_COLOR = '#26a69a';

// Gentle vertical bob so a following pet reads as "floating" rather than
// glued in place - amplitude is small and per-pet phase (via bobSeed) keeps
// a multi-pet squad from all bobbing in lockstep.
const PET_BOB_AMPLITUDE = 3;
const PET_BOB_SPEED = 2.4;

function drawPet(ctx: CanvasRenderingContext2D, pet: PetState, bobSeed: number, nowSeconds: number): void {
  const bobY = pet.position.y + Math.sin(nowSeconds * PET_BOB_SPEED + bobSeed) * PET_BOB_AMPLITUDE;
  // spriteId is a cosmetic alias over the save-critical roster id (e.g.
  // pet-1 -> "baby_dragon") - see PetDefinition.spriteId's doc comment.
  // Falls back to the raw id for any pet that hasn't been given one yet.
  const spriteKey = getPetDefinition(pet.id).spriteId ?? pet.id;
  const sprite = getImage(getPetSpriteSrc(spriteKey));

  drawGroundShadow(ctx, pet.position.x, bobY + PET_RADIUS * 0.85, PET_RADIUS * 0.75);

  if (sprite) {
    const size = PET_RADIUS * 2;
    // Pets never attack (PetSystem.ts - no combat AI), so this is always
    // 'walk' - the bob above is the only motion a pet ever needs on top of
    // its own walk-cycle frames.
    drawEntitySprite(ctx, sprite, 'walk', nowSeconds, pet.position.x, bobY, size, needsFlip('pet'));
    return;
  }

  drawPetSilhouette(ctx, pet.position.x, bobY, PET_RADIUS, PET_VISUAL_COLOR);
  // Pets have no display name (only heroes/named monsters do) - the roster
  // number (petRosterConfig id is "pet-N") is the only stable per-pet glyph
  // available, and doubles as a duplicate-tell in a multi-pet squad.
  drawFallbackGlyph(ctx, pet.position.x, bobY, pet.id.replace('pet-', ''), PET_RADIUS * 0.85);
}

// Status rings are what make an archetype's threat readable at a glance
// instead of just "another colored circle" - each one ties directly to the
// condition driving the actual behavior (MovementSystem/DamageSystem read
// the exact same archetype fields).
function drawEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: EnemyState,
  hitReactionByEntity: Map<string, VisualEffect>,
  nowSeconds: number,
): HpBarRequest {
  const archetype = enemyArchetypes[enemy.archetypeId];
  const enemyStyle = getEnemyVisualStyle(enemy.visualId);
  const enemyRadius = ENEMY_RADIUS * enemyStyle.radiusMultiplier;

  // Ambient identity marker - always visible, not just while healing, so a
  // Healer reads as "support" on sight.
  if (archetype.healAbility) {
    ctx.strokeStyle = 'rgba(105, 240, 174, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(enemy.position.x, enemy.position.y, enemyRadius + 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Same "always visible" identity marker as Healer's, purple instead of
  // green so a Witch reads as "summoner" on sight.
  if (archetype.summonAbility) {
    ctx.strokeStyle = 'rgba(106, 27, 154, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(enemy.position.x, enemy.position.y, enemyRadius + 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Sprites are keyed by shared sprite type (goblin/slime/zombie/witch/
  // demon_boss - see ENEMY_SPRITE_TYPE), not archetypeId or visualId
  // directly - hand-authoring one sheet per archetype isn't the intended art
  // budget, so several archetypes intentionally share a visual identity.
  const spriteType = ENEMY_SPRITE_TYPE[enemy.archetypeId];
  const sprite = getImage(getEnemySpriteSrc(spriteType));

  drawGroundShadow(ctx, enemy.position.x, enemy.position.y + enemyRadius * 0.85, enemyRadius * 0.8);

  const hitEffect = hitReactionByEntity.get(enemyEntityKey(enemy.instanceId));
  drawEntityWithHitReaction(ctx, hitEffect, enemy.position.x, enemy.position.y, () => {
    if (sprite) {
      const size = enemyRadius * 2;
      drawEntitySprite(ctx, sprite, getEnemyAnimationState(enemy), nowSeconds, enemy.position.x, enemy.position.y, size, needsFlip('enemy'));
    } else {
      drawProceduralEnemySilhouette(ctx, spriteType, enemy.position.x, enemy.position.y, enemyRadius, enemyStyle.color);
      drawFallbackGlyph(ctx, enemy.position.x, enemy.position.y, enemy.archetypeId.charAt(0).toUpperCase(), enemyRadius * 0.75);
    }
  });

  const isEnraged = !!archetype.berserker && enemy.currentHp / enemy.maxHp <= archetype.berserker.hpRatioThreshold;
  if (isEnraged) {
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(enemy.position.x, enemy.position.y, enemyRadius + 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (enemy.shieldActive) {
    ctx.strokeStyle = '#40c4ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(enemy.position.x, enemy.position.y, enemyRadius + 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Runtime state (charges left), not an archetype-static flag like
  // hasShield - dashed so it reads distinctly from the shield ring above.
  if (enemy.revivesRemaining > 0) {
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#c0ca33';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(enemy.position.x, enemy.position.y, enemyRadius + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Only set for archetypes with a genuine special mechanic (see
  // Enemy.ts.isNamedArchetype) - a plain mob stays unlabeled so this reads as
  // "this one's different", not background noise in a 10-enemy horde.
  if (enemy.name) {
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.textAlign = 'center';
    ctx.fillText(enemy.name, enemy.position.x, enemy.position.y - enemyRadius - 18);
  }

  return { x: enemy.position.x, y: enemy.position.y - enemyRadius - 12, ratio: enemy.currentHp / enemy.maxHp };
}

// How fast (logical px/sec) the background pans left while the squad is
// advancing (no enemies on field) - tuned to read as a brisk march, not a
// blur, at the 400x300 logical resolution everything else here is authored
// against.
const BACKGROUND_SCROLL_SPEED = 36;

// Module-level, not GameState - this is pure presentation (same "not worth
// a state field" precedent as assetLoader's imageCache), and resetting it on
// reload/biome-change is harmless since it's just a tiling phase.
let backgroundScrollX = 0;
let lastScrollTimestampMs: number | null = null;

// Advances the shared scroll phase once per rendered frame - only when
// nothing is fighting; a live encounter (state.enemies.length > 0) freezes
// the world in place so the squad visibly "holds ground" instead of sliding
// out from under the fight. Clamped delta guards against a huge jump after
// the tab was backgrounded (rAF throttles/stops while hidden) or on the very
// first frame (lastScrollTimestampMs still null).
function advanceBackgroundScroll(hasActiveEncounter: boolean, nowMs: number): void {
  if (lastScrollTimestampMs === null) {
    lastScrollTimestampMs = nowMs;
    return;
  }
  const deltaSeconds = Math.min((nowMs - lastScrollTimestampMs) / 1000, 0.1);
  lastScrollTimestampMs = nowMs;

  if (!hasActiveEncounter) {
    backgroundScrollX += BACKGROUND_SCROLL_SPEED * deltaSeconds;
  }
}

// Exported so BattleScreen can call this directly at full device-pixel
// resolution (canvas.width x canvas.height), at the identity transform,
// *before* it applies the scale+offset transform that confines everything
// else (renderScene's entities, effects, tower) to the fixed 400x300 logical
// letterbox box. Previously this only ever ran inside renderScene, i.e.
// already inside that letterboxed transform - the background was cover-fit
// correctly, but only within the scaled sub-rectangle, so any viewport whose
// aspect ratio wasn't 4:3 showed solid-color letterbox bars (BattleScreen's
// old fillRect) outside it instead of background. Calling this once against
// the real canvas dimensions before the letterbox transform is what actually
// makes the image cover the full screen edge-to-edge on any aspect ratio -
// the cover-fit math below was already correct, it just needed the right
// dimensions and the right transform to run in.
//
// hasActiveEncounter drives the same "pause the march while fighting" scroll
// behavior as before - folded in here (rather than left as a separate call
// in renderScene) since this is now the sole place background-related state
// is touched per frame.
export function drawBackground(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, biome: BiomeDefinition, hasActiveEncounter: boolean): void {
  advanceBackgroundScroll(hasActiveEncounter, performance.now());

  const image = getBackgroundImage(biome.backgroundImage);
  if (!image) {
    ctx.fillStyle = biome.fallbackColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    return;
  }

  // "Cover" fit (like CSS object-fit: cover), not a plain stretch - scale
  // uniformly (never independent x/y) so the image is never squashed,
  // cropping whichever axis overflows. Fed the real canvas dimensions (see
  // doc comment above), this fills every pixel of whatever the actual screen
  // aspect ratio is, not just a fixed 4:3 sub-rectangle - unlike the old
  // static draw this no longer centers horizontally either, since the tiling
  // loop below needs the full drawWidth to repeat edge-to-edge.
  // Rounded to whole device pixels (ceil, not round, so this never shrinks
  // below the true cover-fit size and leaves a gap) - see the tiling loop
  // below for why this matters far more here than it would for a single
  // static draw. Math.ceil on the *dimensions* rather than flooring the
  // draw position alone: if only the position were snapped but drawWidth
  // stayed fractional, each successive tile in the same frame's loop would
  // re-drift back into fractional territory (position + fractional pitch).
  const scale = Math.max(canvasWidth / image.width, canvasHeight / image.height);
  const drawWidth = Math.ceil(image.width * scale);
  const drawHeight = Math.ceil(image.height * scale);
  const offsetY = Math.floor((canvasHeight - drawHeight) / 2);

  // Mirror-tiled scroll ("ping-pong"/MIRRORED_REPEAT wrapping): plain repeat
  // (A, A, A, ...) puts the source image's right edge directly against its
  // own left edge at every seam - for a real photo/illustration (not a
  // hand-authored seamless texture) those two edges look nothing alike, so
  // every tile boundary reads as a visible hard cut. Alternating normal and
  // horizontally-flipped copies (A, flip(A), A, flip(A), ...) fixes this by
  // construction rather than requiring seamless source art: at an A->flip(A)
  // boundary, both sides sample the exact same pixels near A's own right
  // edge (a flip is a reflection, so it's continuous at the reflection
  // axis); at the next flip(A)->A boundary, both sides likewise sample A's
  // own left edge. Every seam is therefore pixel-continuous regardless of
  // what the source image's edges actually look like. tileIndex is the
  // tile's position in the infinite strip (not just this loop's local
  // counter) - deriving it from (x + backgroundScrollX) rather than
  // resetting per-frame keeps a given piece of world "mirrored" or not
  // consistently as it scrolls, instead of flickering between orientations.
  //
  // wrappedOffset is floored (not left fractional) before it seeds the loop.
  // backgroundScrollX itself stays a continuous float (so long-run scroll
  // speed averages out correctly over many frames), but drawing at a
  // fractional screen position with imageSmoothingEnabled=false is exactly
  // what caused the reported flicker: nearest-neighbor sampling has to pick
  // a source texel for every destination pixel, and which texel that is can
  // flip inconsistently as a sub-pixel offset drifts through fractional
  // values frame to frame - worse for the mirrored tiles specifically, since
  // their flip is a separate transform (translate + scale(-1,1)) whose own
  // floating-point composition doesn't necessarily round identically to the
  // non-flipped tiles' direct positioning. Snapping to whole pixels removes
  // that ambiguity entirely - confirmed by diffing 120 consecutive frames
  // before/after this change (worst-frame avg pixel delta dropped from 43 to
  // near zero; see commit message for the full before/after numbers).
  const wrappedOffset = Math.floor(((backgroundScrollX % drawWidth) + drawWidth) % drawWidth);
  for (let x = -wrappedOffset - drawWidth; x < canvasWidth; x += drawWidth) {
    const tileIndex = Math.floor((x + backgroundScrollX) / drawWidth);
    const isMirrored = (((tileIndex % 2) + 2) % 2) === 1;

    if (isMirrored) {
      ctx.save();
      ctx.translate(x + drawWidth, offsetY);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0, drawWidth, drawHeight);
      ctx.restore();
    } else {
      ctx.drawImage(image, x, offsetY, drawWidth, drawHeight);
    }
  }
}

// Soft radial darkening toward the viewport edges - screen-space (not
// world-space), so BattleScreen calls this at the same untransformed
// full-resolution pass as drawBackground rather than inside renderScene's
// letterboxed 400x300 space. Purely atmospheric: pulls the eye toward the
// middle of the fight without ever obscuring anything drawn there.
export function drawVignette(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  const innerRadius = Math.min(canvasWidth, canvasHeight) * 0.35;
  const outerRadius = Math.max(canvasWidth, canvasHeight) * 0.75;
  const gradient = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, outerRadius);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
}

type DeploySlotState = 'empty' | 'occupied' | 'locked';

// Drawn on top of everything else, only while a roster card is actively
// being dragged (BattleScreen decides that, this just draws whatever slot
// list it's handed). Occupied cells are dimmed, empty cells pulse-glow to
// read as "drop here", and locked cells (beyond the squad's current
// wave-gated cap - see mapConfig.layoutSlotPositions' doc comment) render as
// a flat hatched grey so the full 3x3 shape is always visible, but the
// player can see at a glance which cells aren't usable yet rather than
// those cells simply not existing on screen.
function drawDeploySlot(ctx: CanvasRenderingContext2D, position: Position, state: DeploySlotState): void {
  const half = DEPLOY_SLOT_SIZE / 2;
  const x = position.x - half;
  const y = position.y - half;

  if (state === 'locked') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(x, y, DEPLOY_SLOT_SIZE, DEPLOY_SLOT_SIZE);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x, y, DEPLOY_SLOT_SIZE, DEPLOY_SLOT_SIZE);
    ctx.setLineDash([]);
    return;
  }

  if (state === 'occupied') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(x, y, DEPLOY_SLOT_SIZE, DEPLOY_SLOT_SIZE);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, DEPLOY_SLOT_SIZE, DEPLOY_SLOT_SIZE);
    return;
  }

  ctx.fillStyle = 'rgba(76, 175, 80, 0.18)';
  ctx.fillRect(x, y, DEPLOY_SLOT_SIZE, DEPLOY_SLOT_SIZE);
  ctx.strokeStyle = 'rgba(129, 255, 133, 0.9)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(x, y, DEPLOY_SLOT_SIZE, DEPLOY_SLOT_SIZE);
  ctx.setLineDash([]);
}

// occupiedSlotIndices is a set of grid-cell indices, not a count - slots are
// addressed by persistent HeroState.deployedSlotIndex now (see mapConfig.
// layoutSlotPositions' doc comment), so "the first N slots are occupied"
// (a simple count) no longer holds once a hero can occupy any specific cell.
// unlockedCount is separate from that - it's the squad's current wave-gated
// cap (squadConfig.getMaxDeployedHeroes), not an occupancy count: cells at/
// after this index are always locked regardless of occupiedSlotIndices
// (nothing can occupy a cell that isn't unlocked yet).
export function drawDeploySlots(
  ctx: CanvasRenderingContext2D,
  slots: Position[],
  occupiedSlotIndices: Set<number>,
  unlockedCount: number,
): void {
  slots.forEach((slot, index) => {
    const state: DeploySlotState = index >= unlockedCount ? 'locked' : occupiedSlotIndices.has(index) ? 'occupied' : 'empty';
    drawDeploySlot(ctx, slot, state);
  });
}

// Drawn while the player is dragging an already-deployed hero/pet around the
// battle canvas to swap it with another slot (as opposed to drawDeploySlots,
// which is for dragging a fresh unit in from the roster panel). ringColor
// distinguishes "this is the one you picked up" from "drop here to swap".
export function drawSwapHighlight(ctx: CanvasRenderingContext2D, position: Position, radius: number, ringColor: string): void {
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(position.x, position.y, radius + 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

// Faint copy of the dragged unit following the pointer, so it's clear what's
// being carried even once it's away from its original spot.
export function drawSwapGhost(ctx: CanvasRenderingContext2D, kind: 'hero' | 'pet', x: number, y: number): void {
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = kind === 'hero' ? HERO_VISUAL_TIERS[0].color : PET_VISUAL_COLOR;
  ctx.beginPath();
  ctx.arc(x, y, kind === 'hero' ? HERO_RADIUS : PET_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// Below this, a shake is imperceptible - skipping the save/translate/restore
// entirely avoids paying for it every frame once a shake has mostly decayed.
const SCREEN_SHAKE_MIN_INTENSITY = 0.05;

// Draws everything confined to the fixed 400x300 logical letterbox box
// (tower, heroes, pets, enemies, visual effects) - the background is no
// longer this function's concern, see drawBackground's doc comment for why
// it moved to its own call at a different transform/resolution entirely.
// This also means no clearRect here: drawBackground already repaints every
// pixel of the canvas every frame (real image or fallback color, either way
// fully opaque), so clearing this sub-region first would just erase the
// background BattleScreen already drew there a moment ago before entities
// get a chance to draw on top of it.
export function renderScene(
  ctx: CanvasRenderingContext2D,
  heroes: HeroState[],
  pets: PetState[],
  enemies: EnemyState[],
  visualEffects: VisualEffect[],
  screenShakeIntensity: number,
): void {
  const nowMs = performance.now();
  const nowSeconds = nowMs / 1000;

  // Resizing the canvas element (BattleScreen's ResizeObserver) resets all
  // context state, including this - set on every frame rather than once, so
  // pixel art sprites always scale in crisp nearest-neighbor steps instead
  // of the browser's default blur, however the canvas got resized.
  ctx.imageSmoothingEnabled = false;

  const isShaking = screenShakeIntensity > SCREEN_SHAKE_MIN_INTENSITY;
  if (isShaking) {
    ctx.save();
    // Uniform random in [-intensity, intensity] on each axis independently -
    // a shared magnitude but an uncorrelated direction per axis reads as a
    // jolt, not a diagonal slide.
    ctx.translate(
      (Math.random() * 2 - 1) * screenShakeIntensity,
      (Math.random() * 2 - 1) * screenShakeIntensity,
    );
  }

  // Per-entity attribution (see buildEntityEffectIndex) rather than a single
  // shared pulse/flash - each hero only pulses on its own attack, each hero/
  // enemy only flashes on its own hit, not the whole squad's.
  const attackFlashByEntity = buildEntityEffectIndex(visualEffects, 'attackFlash');
  const hitReactionByEntity = buildEntityEffectIndex(visualEffects, 'hitReaction');
  // Bodies first, then every collected bar in one batched pass (see
  // drawHpBarsBatched's doc comment for what this saves and the draw-order
  // trade-off that comes with it) - heroes and enemies batch separately so
  // this doesn't touch the hero-group-before-enemy-group ordering that
  // already existed.
  const heroHpBars: HpBarRequest[] = [];
  for (const hero of heroes) {
    heroHpBars.push(drawHero(ctx, hero, attackFlashByEntity, hitReactionByEntity, nowSeconds));
  }
  drawHpBarsBatched(ctx, heroHpBars);

  pets.forEach((pet, index) => {
    drawPet(ctx, pet, index * 1.7, nowSeconds);
  });

  const enemyHpBars: HpBarRequest[] = [];
  for (const enemy of enemies) {
    enemyHpBars.push(drawEnemy(ctx, enemy, hitReactionByEntity, nowSeconds));
  }
  drawHpBarsBatched(ctx, enemyHpBars);

  for (const effect of visualEffects) {
    drawVisualEffect(ctx, effect);
  }

  if (isShaking) {
    ctx.restore();
  }
}
