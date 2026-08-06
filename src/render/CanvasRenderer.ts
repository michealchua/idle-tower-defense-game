import { t } from '../locales/i18n';
import { getVisualTierForLevel } from '../data/milestoneConfig';
import { enemyArchetypes } from '../data/enemyArchetypes';
import type { TowerId } from '../data/towerConfig';
import type { BaseState, EnemyState, HeroState, PetState, TowerState, VisualEffect } from '../engine/types';

const HERO_RADIUS = 20;
const PET_RADIUS = 12;
const ENEMY_RADIUS = 16;
const TOWER_SIZE = 22;
const BASE_SIZE = 36;
const HP_BAR_WIDTH = 40;
const HP_BAR_HEIGHT = 5;
const ATTACK_PULSE_SCALE = 0.2;
const DEATH_BURST_MAX_GROWTH = 20;
const DAMAGE_NUMBER_RISE = 40;
const LEVEL_UP_RISE = 30;
const MILESTONE_UNLOCK_RISE = 45;

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

// Pets are static-stat combatants with no evolution tier in v1 - one plain
// style keeps them visually secondary to heroes.
const PET_VISUAL_COLOR = '#26a69a';

// Keyed by TowerId - each tower kind gets a distinct color so its role
// (splash/slow/chain/economy) reads at a glance, same reasoning as
// ENEMY_VISUAL_STYLES below.
const TOWER_VISUAL_COLORS: Record<TowerId, string> = {
  cannonTower: '#ff7043',
  frostTower: '#4fc3f7',
  lightningTower: '#ffee58',
  goldTower: '#ffd54f',
};

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
  miniboss: { color: '#b71c1c', radiusMultiplier: 1.8 },
  boss: { color: '#000000', radiusMultiplier: 2.2 },
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
    case 'waveClear': {
      const y = effect.y - 30 - progress * MILESTONE_UNLOCK_RISE;
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = `rgba(255, 215, 0, ${fadeAlpha})`;
      ctx.textAlign = 'center';
      ctx.fillText(t('wave.cleared'), effect.x, y);
      return;
    }
    case 'towerSplash': {
      const maxRadius = effect.radius ?? 40;
      ctx.fillStyle = `rgba(255, 112, 67, ${fadeAlpha * 0.4})`;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, maxRadius, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'frostImpact': {
      const radius = (effect.radius ?? 20) * (0.6 + progress * 0.4);
      ctx.strokeStyle = `rgba(79, 195, 247, ${fadeAlpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.stroke();
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

function drawPet(ctx: CanvasRenderingContext2D, pet: PetState): void {
  ctx.fillStyle = PET_VISUAL_COLOR;
  ctx.beginPath();
  ctx.arc(pet.position.x, pet.position.y, PET_RADIUS, 0, Math.PI * 2);
  ctx.fill();
}

// Square instead of a circle so towers read as "structure" at a glance next
// to the round hero/pet/enemy units.
function drawTower(ctx: CanvasRenderingContext2D, tower: TowerState): void {
  ctx.fillStyle = TOWER_VISUAL_COLORS[tower.id as TowerId] ?? '#9e9e9e';
  ctx.fillRect(tower.position.x - TOWER_SIZE / 2, tower.position.y - TOWER_SIZE / 2, TOWER_SIZE, TOWER_SIZE);
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

  drawHpBar(ctx, enemy.position.x, enemy.position.y - enemyRadius - 12, enemy.currentHp / enemy.maxHp);
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  heroes: HeroState[],
  pets: PetState[],
  enemies: EnemyState[],
  base: BaseState,
  visualEffects: VisualEffect[],
  towers: TowerState[] = [],
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

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

  for (const pet of pets) {
    drawPet(ctx, pet);
  }

  for (const tower of towers) {
    drawTower(ctx, tower);
  }

  for (const enemy of enemies) {
    drawEnemy(ctx, enemy);
  }

  for (const effect of visualEffects) {
    drawVisualEffect(ctx, effect);
  }
}
