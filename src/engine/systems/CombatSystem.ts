import { spawnVisualEffect } from './EffectsSystem';
import { distance, getEnemiesInRange, heroDefaultStrategy, pickBestTarget } from './TargetingSystem';
import { calculateDamage, applyDamage, applyDamageToHero } from './DamageSystem';
import { getDeployedHeroes } from './HeroStatsSystem';
import { effectLifetimes } from '../../data/effectConfig';
import { enemyHeroAttackIntervalSeconds } from '../../data/enemyConfig';
import { heroBaseConfig } from '../../data/heroConfig';
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
    lifetime: effectLifetimes.attackFlash,
  });

  applyDamage(state, target, damageResult);
}

export function tickCombat(state: GameState, deltaSeconds: number): void {
  for (const hero of getDeployedHeroes(state)) {
    tickAttackerCombat(state, hero, deltaSeconds);
  }
}

// Mirror of tickAttackerCombat, enemy-side - an enemy inside a hero's attack
// range chips away at a random in-range deployed hero on its own cooldown.
// Deliberately simple (no priority targeting) since this is supplementary
// attrition on the squad, not the primary lose condition (see
// applyDamageToHero) - MovementSystem/base HP remains the real threat.
export function tickEnemyAttacksOnHeroes(state: GameState, deltaSeconds: number): void {
  const heroes = getDeployedHeroes(state);
  if (heroes.length === 0) {
    return;
  }

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
    applyDamageToHero(state, target, enemy.heroDamage);
    enemy.heroAttackCooldownRemaining = enemyHeroAttackIntervalSeconds;
  }
}
