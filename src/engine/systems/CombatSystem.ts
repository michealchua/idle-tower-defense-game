import { spawnVisualEffect } from './EffectsSystem';
import { distance, getEnemiesInRange, heroDefaultStrategy, pickBestTarget } from './TargetingSystem';
import { calculateDamage, applyDamage, applyDamageToHero } from './DamageSystem';
import { getAliveDeployedHeroes } from './HeroStatsSystem';
import { effectLifetimes } from '../../data/effectConfig';
import { enemyHeroAttackIntervalSeconds } from '../../data/enemyConfig';
import { heroBaseConfig } from '../../data/heroConfig';
import { getTalentFlatBonus } from '../../data/talentConfig';
import { getAscensionShopFlatBonus } from '../../data/ascensionShopConfig';
import { heroEntityKey } from '../entityKey';
import type { GameState, Position } from '../types';

interface Attacker {
  // Only heroes ever reach tickAttackerCombat (see tickCombat below - pets
  // have no attack stats).
  id: string;
  position: Position;
  attackRange: number;
  attackDamage: number;
  attackSpeed: number;
  attackCooldownRemaining: number;
  criticalChance?: number;
}

// Pets have no attack stats/combat role in v1 - they're passive stat-bonus
// providers only (see HeroStatsSystem.computePetPassiveBonuses), so this
// only ever runs for heroes now.
function tickAttackerCombat(state: GameState, attacker: Attacker, deltaSeconds: number): void {
  attacker.attackCooldownRemaining = Math.max(0, attacker.attackCooldownRemaining - deltaSeconds);

  if (attacker.attackCooldownRemaining > 0) {
    return;
  }

  const candidates = getEnemiesInRange(state.enemies, attacker.position, attacker.attackRange);
  const target = pickBestTarget(candidates, heroDefaultStrategy, {
    basePosition: state.base.position,
    originPosition: attacker.position,
  });

  if (!target) {
    return;
  }

  const damageResult = calculateDamage(attacker.attackDamage, attacker.criticalChance ?? 0);
  attacker.attackCooldownRemaining = 1 / attacker.attackSpeed;

  spawnVisualEffect(state, {
    kind: 'attackFlash',
    x: attacker.position.x,
    y: attacker.position.y,
    targetX: target.position.x,
    targetY: target.position.y,
    // Owner id for CanvasRenderer's per-hero attack pulse - see
    // drawHero/buildEntityEffectIndex. Only heroes ever reach here (see this
    // function's own doc comment), so attacker.id is always a HeroState.id.
    entityKey: heroEntityKey(attacker.id),
    lifetime: effectLifetimes.attackFlash,
  });

  applyDamage(state, target, damageResult);
}

export function tickCombat(state: GameState, deltaSeconds: number): void {
  for (const hero of getAliveDeployedHeroes(state)) {
    tickAttackerCombat(state, hero, deltaSeconds);
  }
}

// Mirror of tickAttackerCombat, enemy-side - an enemy inside a hero's attack
// range chips away at a random in-range deployed hero on its own cooldown.
// This is now the primary lose condition - see WaveSystem.tickWaveProgress's
// checkSquadWipe, which fails the wave once every deployed hero is downed.
export function tickEnemyAttacksOnHeroes(state: GameState, deltaSeconds: number): void {
  const heroes = getAliveDeployedHeroes(state);
  if (heroes.length === 0) {
    return;
  }

  // damageReduction (talentConfig.ts/ascensionShopConfig.ts) used to apply
  // to base chip damage before the base-HP mechanic was removed - now that
  // hero HP loss is the only lose condition (see WaveSystem.
  // tickWaveProgress's checkSquadWipe), it reduces hero chip damage instead,
  // same purchasable stat/UI, just repointed at the threat that actually
  // still exists.
  const damageReduction =
    getTalentFlatBonus(state.talentLevels, 'damageReduction') +
    getAscensionShopFlatBonus(state.ascensionShopLevels, 'damageReduction');

  for (const enemy of state.enemies) {
    enemy.heroAttackCooldownRemaining = Math.max(0, enemy.heroAttackCooldownRemaining - deltaSeconds);
    if (enemy.heroAttackCooldownRemaining > 0) {
      continue;
    }

    const inRange = heroes.filter((hero) => distance(hero.position, enemy.position) <= heroBaseConfig.attackRange);
    if (inRange.length === 0) {
      continue;
    }

    const target = inRange[Math.floor(Math.random() * inRange.length)];
    applyDamageToHero(state, target, enemy.heroDamage * (1 - damageReduction));
    enemy.heroAttackCooldownRemaining = enemyHeroAttackIntervalSeconds;
  }
}
