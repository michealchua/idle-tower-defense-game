import { computeScaledValue } from '../utils/scaling';

export const heroBaseConfig = {
  level: 1,
  maxHp: 100,
  attackDamage: 10,
  attackSpeed: 1,
  // Fixed, non-upgradeable - not part of UpgradeableStat below, so it can
  // never be rolled on equipment, bought as a hero upgrade, or granted by a
  // talent/ascension-shop bonus. Every hero/pet/tower still needs *some*
  // engagement range for TargetingSystem.getEnemiesInRange, this is just no
  // longer a player-facing stat.
  attackRange: 100,
  criticalChance: 0.05,
};

// MovementSystem.tickHeroMovement - heroes hold their deployed slot
// (homePosition) until an enemy wanders inside engageRange, walk out to meet
// it, stop once within attackRange to actually fight (CombatSystem's own
// range check), then drift back home once nothing's left to fight.
// engageRange is deliberately wider than attackRange so a hero starts
// closing the distance on an approaching enemy instead of only reacting once
// it's already close enough to hit - the two would otherwise be
// indistinguishable and a hero would never actually need to move.
export const heroMovementConfig = {
  engageRange: 160,
  moveSpeed: 60,
  // Once within this of a target position (home or an enemy), snap exactly
  // to it instead of asymptotically crawling the last fraction of a pixel
  // forever.
  arriveEpsilon: 2,
};

export type UpgradeCategory = 'combat' | 'survival' | 'utility';

export interface UpgradeDefinition {
  category: UpgradeCategory;
  baseCost: number;
  costGrowth: number;
  valuePerLevel: number;
  maxValue?: number;
}

export type UpgradeableStat = 'attackDamage' | 'attackSpeed' | 'maxHp' | 'criticalChance';

// `category` is metadata only - getUpgradeCost/applyHeroUpgrade never read
// it. It exists so the UI can later group these into Combat/Survival/Utility
// sections without touching the upgrade logic itself.
export const heroUpgradeConfig: Record<UpgradeableStat, UpgradeDefinition> = {
  attackDamage: { category: 'combat', baseCost: 10, costGrowth: 1.15, valuePerLevel: 2 },
  attackSpeed: { category: 'combat', baseCost: 15, costGrowth: 1.18, valuePerLevel: 0.05 },
  criticalChance: { category: 'combat', baseCost: 25, costGrowth: 1.25, valuePerLevel: 0.02, maxValue: 0.75 },
  maxHp: { category: 'survival', baseCost: 8, costGrowth: 1.12, valuePerLevel: 20 },
};

export const heroLevelConfig = {
  baseExpToNextLevel: 20,
  expGrowth: 1.15,
  perLevel: {
    attackDamage: 2,
    maxHp: 15,
    attackSpeed: 0.02,
  },
};

export function getExpToNextLevel(level: number): number {
  return computeScaledValue(heroLevelConfig.baseExpToNextLevel, heroLevelConfig.expGrowth, level - 1);
}

// Archetype tag every hero carries from heroRosterConfig.ts - orthogonal to
// bondId (bondConfig.ts): bond drives squad-composition synergy bonuses,
// class drives branch evolution (see heroEvolutionConfig/HeroDefinition.
// evolutionBranches below) and is purely flavor/UI otherwise.
export type HeroClass = 'warrior' | 'mage' | 'paladin' | 'summoner' | 'archer' | 'assassin' | 'priest' | 'special';

// 8 classes matching the plan's 战士/法师/圣骑士/召唤师/弓箭手/刺客/牧师/特殊职业 spread -
// generateHeroRoster (heroRosterConfig.ts) cycles this array by globalIndex, so
// the roster stays evenly distributed across all 8 as long as this list is.
export const heroClasses: HeroClass[] = [
  'warrior',
  'mage',
  'paladin',
  'summoner',
  'archer',
  'assassin',
  'priest',
  'special',
];

// 分支进化 - gacha pulls only ever produce a hero's base form (see
// heroRosterConfig.ts's generator); once a hero reaches this level it can
// pick one of its two evolutionBranches (HeroSystem.evolveHero), applying a
// large permanent statMultiplier boost and an exclusive skill. Unlike level/
// exp/upgrades, the chosen branch survives ascension - see AscensionSystem.
// ascend, which deliberately doesn't touch hero.evolutionBranchId.
export const heroEvolutionConfig = {
  unlockLevel: 30,
};
