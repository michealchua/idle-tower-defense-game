import { enemyBaseStats } from '../../data/enemyConfig';
import { enemyArchetypes, type EnemyArchetypeId } from '../../data/enemyArchetypes';
import { getScalingMultiplier } from '../../data/enemyScalingConfig';
import { mapConfig } from '../../data/mapConfig';
import type { EnemyState } from '../types';

export function createEnemy(archetypeId: EnemyArchetypeId, difficultyScore: number, instanceId: number): EnemyState {
  const archetype = enemyArchetypes[archetypeId];
  const scale = getScalingMultiplier(difficultyScore);

  return {
    instanceId,
    archetypeId,
    visualId: archetypeId,
    maxHp: Math.round(enemyBaseStats.maxHp * archetype.hpMultiplier * scale),
    currentHp: Math.round(enemyBaseStats.maxHp * archetype.hpMultiplier * scale),
    goldReward: Math.round(enemyBaseStats.goldReward * archetype.goldRewardMultiplier * scale),
    expReward: Math.round(enemyBaseStats.expReward * archetype.expRewardMultiplier * scale),
    // Speed scales with archetype only, never with difficulty score - if it
    // compounded indefinitely it would eventually break the hero's
    // engagement-window math (whether there's time to land hits in range).
    speed: enemyBaseStats.speed * archetype.speedMultiplier,
    damageToBase: Math.round(enemyBaseStats.damageToBase * archetype.damageToBaseMultiplier * scale),
    heroDamage: Math.round(enemyBaseStats.heroDamage * archetype.damageToBaseMultiplier * scale),
    heroAttackCooldownRemaining: 0,
    position: { ...mapConfig.spawnPosition },
    shieldActive: archetype.hasShield ?? false,
    abilityCooldownRemaining: 0,
    slowMultiplier: 1,
    slowRemaining: 0,
    revivesRemaining: archetype.revive?.maxRevives ?? 0,
  };
}
