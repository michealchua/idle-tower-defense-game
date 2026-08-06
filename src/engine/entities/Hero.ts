import { getExpToNextLevel, heroBaseConfig, heroUpgradeConfig, type UpgradeableStat } from '../../data/heroConfig';
import type { HeroState, Position } from '../types';

function createInitialHeroUpgrades(): Record<UpgradeableStat, number> {
  return Object.fromEntries(Object.keys(heroUpgradeConfig).map((stat) => [stat, 0])) as Record<UpgradeableStat, number>;
}

// Combat stats (attackDamage/maxHp/etc.) are seeded from heroBaseConfig here
// but immediately overwritten by HeroStatsSystem.recomputeHeroStats - every
// caller of createHero calls recompute right after, same as unlockHero does.
export function createHero(heroId: string, position: Position): HeroState {
  return {
    id: heroId,
    level: heroBaseConfig.level,
    maxHp: heroBaseConfig.maxHp,
    currentHp: heroBaseConfig.maxHp,
    attackDamage: heroBaseConfig.attackDamage,
    attackSpeed: heroBaseConfig.attackSpeed,
    attackRange: heroBaseConfig.attackRange,
    criticalChance: heroBaseConfig.criticalChance,
    attackCooldownRemaining: 0,
    exp: 0,
    expToNextLevel: getExpToNextLevel(heroBaseConfig.level),
    unlockedMilestoneIds: [],
    unlockedSkillIds: [],
    skills: {},
    upgrades: createInitialHeroUpgrades(),
    position: { ...position },
    equipment: { weapon: null, armor: null, trinket: null, boots: null },
  };
}

export { createInitialHeroUpgrades };
