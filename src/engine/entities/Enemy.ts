import { enemyBaseStats } from '../../data/enemyConfig';
import { enemyArchetypes, type EnemyArchetypeId } from '../../data/enemyArchetypes';
import { getScalingMultiplier } from '../../data/enemyScalingConfig';
import { getAscensionEnemyDamageMultiplier, getAscensionPowerMultiplier } from '../../data/ascensionConfig';
import { mapConfig } from '../../data/mapConfig';
import type { EnemyState } from '../types';

export function createEnemy(
  archetypeId: EnemyArchetypeId,
  difficultyScore: number,
  ascensionLevel: number,
  instanceId: number,
): EnemyState {
  const archetype = enemyArchetypes[archetypeId];
  const waveScale = getScalingMultiplier(difficultyScore);
  // "升华相对论" (ascensionConfig.ts) - maxHp gets the full symmetric
  // multiplier (matches HeroStatsSystem's hero/pet attackDamage boost, so
  // TTK stays put); damage-to-hero/base only gets the dampened half-strength
  // version since ascend() resets hero level/maxHp back to 1. Gold/exp
  // rewards are deliberately left off both - the ascension shop's goldGain
  // node is the intended way that economy improves post-ascension.
  const hpScale = waveScale * getAscensionPowerMultiplier(ascensionLevel);
  const damageScale = waveScale * getAscensionEnemyDamageMultiplier(ascensionLevel);

  return {
    instanceId,
    archetypeId,
    visualId: archetypeId,
    maxHp: Math.round(enemyBaseStats.maxHp * archetype.hpMultiplier * hpScale),
    currentHp: Math.round(enemyBaseStats.maxHp * archetype.hpMultiplier * hpScale),
    goldReward: Math.round(enemyBaseStats.goldReward * archetype.goldRewardMultiplier * waveScale),
    expReward: Math.round(enemyBaseStats.expReward * archetype.expRewardMultiplier * waveScale),
    // Speed scales with archetype only, never with difficulty score - if it
    // compounded indefinitely it would eventually break the hero's
    // engagement-window math (whether there's time to land hits in range).
    speed: enemyBaseStats.speed * archetype.speedMultiplier,
    damageToBase: Math.round(enemyBaseStats.damageToBase * archetype.damageToBaseMultiplier * damageScale),
    heroDamage: Math.round(enemyBaseStats.heroDamage * archetype.damageToBaseMultiplier * damageScale),
    heroAttackCooldownRemaining: 0,
    position: { ...mapConfig.spawnPosition },
    shieldActive: archetype.hasShield ?? false,
    abilityCooldownRemaining: 0,
    slowMultiplier: 1,
    slowRemaining: 0,
    revivesRemaining: archetype.revive?.maxRevives ?? 0,
  };
}
