import { t } from '../locales/i18n';
import { getVisualTierForLevel } from '../data/milestoneConfig';
import { enemyArchetypes } from '../data/enemyArchetypes';
import type { BiomeDefinition } from '../data/biomeConfig';
import { getImage } from './assetLoader';
import type { BaseState, EnemyState, HeroState, PetState, Position, VisualEffect } from '../engine/types';

// Exported so BattleScreen's canvas-native drag-to-swap can hit-test pointer
// coordinates against the same radii these are actually drawn at.
export const HERO_RADIUS = 20;
export const PET_RADIUS = 12;
const ENEMY_RADIUS = 16;
const BASE_SIZE = 36;
const HP_BAR_WIDTH = 40;
const HP_BAR_HEIGHT = 5;
const ATTACK_PULSE_SCALE = 0.2;
const DEATH_BURST_MAX_GROWTH = 20;
const DAMAGE_NUMBER_RISE = 40;
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

function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, ratio: number): void {
  const barX = x - HP_BAR_WIDTH / 2;
  ctx.fillStyle = '#333333';
  ctx.fillRect(barX, y, HP_BAR_WIDTH, HP_BAR_HEIGHT);
  ctx.fillStyle = ratio > 0.3 ? '#4caf50' : '#e53935';
  ctx.fillRect(barX, y, HP_BAR_WIDTH * Math.max(0, ratio), HP_BAR_HEIGHT);
}

function getHeroPulseScale(visualEffects: VisualEffect[]): number {
  const activeFlash = visualEffects.find((effect) => effect.kind === 'attackFlash');
  if (!activeFlash) {
    return 1;
  }
  const remainingRatio = 1 - activeFlash.age / activeFlash.lifetime;
  return 1 + ATTACK_PULSE_SCALE * remainingRatio;
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
      const y = effect.y - progress * DAMAGE_NUMBER_RISE;
      ctx.font = effect.isCritical ? 'bold 18px sans-serif' : '14px sans-serif';
      ctx.fillStyle = effect.isCritical ? `rgba(255, 152, 0, ${fadeAlpha})` : `rgba(255, 255, 255, ${fadeAlpha})`;
      ctx.textAlign = 'center';
      ctx.fillText(`-${effect.amount}`, effect.x, y);
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
  }
}

function drawHero(ctx: CanvasRenderingContext2D, hero: HeroState, pulseScale: number): void {
  const heroStyle = getHeroVisualStyle(getVisualTierForLevel(hero.level));
  const heroRadius = HERO_RADIUS * heroStyle.radiusMultiplier * pulseScale;

  if (heroStyle.glowColor) {
    ctx.fillStyle = heroStyle.glowColor;
    ctx.beginPath();
    ctx.arc(hero.position.x, hero.position.y, heroRadius + 8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = heroStyle.color;
  ctx.beginPath();
  ctx.arc(hero.position.x, hero.position.y, heroRadius, 0, Math.PI * 2);
  ctx.fill();
  drawHpBar(ctx, hero.position.x, hero.position.y - HERO_RADIUS - 12, hero.currentHp / hero.maxHp);
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

// Looked up by petRosterConfig id, same convention as biome.backgroundImage
// (served from public/, missing file just falls back silently - see
// assetLoader.getImage). Drop pet-N.png into public/sprites/pets/ to
// replace the placeholder circle with real pixel art, no code changes
// needed.
function getPetSpriteSrc(petId: string): string {
  return `/sprites/pets/${petId}.png`;
}

function drawPet(ctx: CanvasRenderingContext2D, pet: PetState, bobSeed: number, nowSeconds: number): void {
  const bobY = pet.position.y + Math.sin(nowSeconds * PET_BOB_SPEED + bobSeed) * PET_BOB_AMPLITUDE;
  const sprite = getImage(getPetSpriteSrc(pet.id));

  if (sprite) {
    const size = PET_RADIUS * 2;
    ctx.drawImage(sprite, pet.position.x - size / 2, bobY - size / 2, size, size);
    return;
  }

  ctx.fillStyle = PET_VISUAL_COLOR;
  ctx.beginPath();
  ctx.arc(pet.position.x, bobY, PET_RADIUS, 0, Math.PI * 2);
  ctx.fill();
}

// Status rings are what make an archetype's threat readable at a glance
// instead of just "another colored circle" - each one ties directly to the
// condition driving the actual behavior (MovementSystem/DamageSystem read
// the exact same archetype fields).
function drawEnemy(ctx: CanvasRenderingContext2D, enemy: EnemyState): void {
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

  ctx.fillStyle = enemyStyle.color;
  ctx.beginPath();
  ctx.arc(enemy.position.x, enemy.position.y, enemyRadius, 0, Math.PI * 2);
  ctx.fill();

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

  drawHpBar(ctx, enemy.position.x, enemy.position.y - enemyRadius - 12, enemy.currentHp / enemy.maxHp);
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

function drawBackground(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, biome: BiomeDefinition): void {
  const image = getImage(biome.backgroundImage);
  if (!image) {
    ctx.fillStyle = biome.fallbackColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    return;
  }

  // "Cover" fit (like CSS background-size: cover), not a plain stretch -
  // source art is 1920x1080 (16:9) while the logical canvas is 400x300
  // (4:3), so an independent x/y stretch would visibly squash it. Scale
  // uniformly to fill the canvas height completely; unlike the old static
  // draw this no longer centers horizontally, since the tiling loop below
  // needs the full drawWidth to repeat edge-to-edge.
  const scale = Math.max(canvasWidth / image.width, canvasHeight / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetY = (canvasHeight - drawHeight) / 2;

  // Seamless scroll: same image tiled left-to-right, panned by the shared
  // scroll phase and wrapped modulo one tile's width. Starting one tile
  // before the visible edge and walking right until past canvasWidth always
  // covers the full canvas regardless of how drawWidth compares to it.
  const wrappedOffset = ((backgroundScrollX % drawWidth) + drawWidth) % drawWidth;
  for (let x = -wrappedOffset - drawWidth; x < canvasWidth; x += drawWidth) {
    ctx.drawImage(image, x, offsetY, drawWidth, drawHeight);
  }
}

// Drawn on top of everything else, only while a roster card is actively
// being dragged (BattleScreen decides that, this just draws whatever slot
// list it's handed). occupiedCount slots are dimmed, the rest pulse-glow to
// read as "drop here".
function drawDeploySlot(ctx: CanvasRenderingContext2D, position: Position, occupied: boolean): void {
  const half = DEPLOY_SLOT_SIZE / 2;
  const x = position.x - half;
  const y = position.y - half;

  if (occupied) {
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

export function drawDeploySlots(ctx: CanvasRenderingContext2D, slots: Position[], occupiedCount: number): void {
  slots.forEach((slot, index) => {
    drawDeploySlot(ctx, slot, index < occupiedCount);
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

export function renderScene(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  biome: BiomeDefinition,
  heroes: HeroState[],
  pets: PetState[],
  enemies: EnemyState[],
  base: BaseState,
  visualEffects: VisualEffect[],
): void {
  const nowMs = performance.now();
  advanceBackgroundScroll(enemies.length > 0, nowMs);

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  drawBackground(ctx, canvasWidth, canvasHeight, biome);

  ctx.fillStyle = '#795548';
  ctx.fillRect(base.position.x - BASE_SIZE / 2, base.position.y - BASE_SIZE / 2, BASE_SIZE, BASE_SIZE);
  drawHpBar(ctx, base.position.x, base.position.y - BASE_SIZE / 2 - 12, base.currentHp / base.maxHp);

  // One shared pulse (any active attack flash) rather than per-hero
  // attribution - visual effects don't carry an owner id in v1, and a
  // slightly-off shared pulse is a fine tradeoff to avoid extending that
  // system just for this.
  const pulseScale = getHeroPulseScale(visualEffects);
  for (const hero of heroes) {
    drawHero(ctx, hero, pulseScale);
  }

  const nowSeconds = nowMs / 1000;
  pets.forEach((pet, index) => {
    drawPet(ctx, pet, index * 1.7, nowSeconds);
  });

  for (const enemy of enemies) {
    drawEnemy(ctx, enemy);
  }

  for (const effect of visualEffects) {
    drawVisualEffect(ctx, effect);
  }
}
