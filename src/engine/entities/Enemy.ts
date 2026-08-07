import { enemyBaseStats } from '../../data/enemyConfig';
import { enemyArchetypes, type EnemyArchetype, type EnemyArchetypeId } from '../../data/enemyArchetypes';
import { getScalingMultiplier } from '../../data/enemyScalingConfig';
import { getAscensionEnemyDamageMultiplier, getAscensionPowerMultiplier } from '../../data/ascensionConfig';
import { mapConfig } from '../../data/mapConfig';
import { generateMonsterName } from '../../data/NameGenerator';
import type { EnemyState } from '../types';

// A name is only worth rolling for an archetype with a genuine special
// mechanic - miniboss/boss both already qualify on their own (miniboss via
// hasShield, boss via berserker), so there's no need to also list archetype
// ids by hand here. A plain stat-multiplier mob (normal/fast/tank/elite/
// swarm/brute/giant) stays nameless.
function isNamedArchetype(archetype: EnemyArchetype): boolean {
  return !!(archetype.healAbility || archetype.summonAbility || archetype.revive || archetype.hasShield || archetype.berserker);
}

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
    name: isNamedArchetype(archetype) ? generateMonsterName() : undefined,
  };
}
