import { getExpToNextLevel, heroBaseConfig } from '../../data/heroConfig';
import type { HeroState, Position } from '../types';

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
    skills: {},
    position: { ...position },
  };
}
