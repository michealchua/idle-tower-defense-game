import { spawnVisualEffect } from './EffectsSystem';
import { getEnemiesInRange, heroDefaultStrategy, pickBestTarget } from './TargetingSystem';
import { calculateDamage, applyDamage } from './DamageSystem';
import { getDeployedHeroes } from './HeroStatsSystem';
import { effectLifetimes } from '../../data/effectConfig';
import type { GameState, Position } from '../types';

interface Attacker {
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
