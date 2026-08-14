import { getExpToNextLevel, heroBaseConfig, heroUpgradeConfig, type UpgradeableStat } from '../../data/heroConfig';
import { getHeroDefinition, STARTER_SKILL_IDS } from '../../data/heroRosterConfig';
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
    // Fixed per roster id (see HeroDefinition.name's doc comment), not
    // rolled fresh here anymore - CodexPanel needs to show the same name
    // before this hero is ever unlocked, so the identity has to already
    // exist on the definition rather than being invented at instance-
    // creation time.
    name: getHeroDefinition(heroId).name,
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
    ownedSkillIds: [...STARTER_SKILL_IDS],
    equippedSkillIds: [...STARTER_SKILL_IDS],
    skills: {},
    upgrades: createInitialHeroUpgrades(),
    position: { ...position },
    homePosition: { ...position },
    moveTargetEnemyInstanceId: null,
    deployedSlotIndex: null,
    equipment: { weapon: null, armor: null, trinket: null, boots: null },
    evolutionBranchId: null,
    isDowned: false,
  };
}

export { createInitialHeroUpgrades };
