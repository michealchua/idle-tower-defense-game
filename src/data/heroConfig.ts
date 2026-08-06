import { computeScaledValue } from './scaling';

export const heroBaseConfig = {
  level: 1,
  maxHp: 100,
  attackDamage: 10,
  attackSpeed: 1,
  attackRange: 100,
  criticalChance: 0.05,
};

export type UpgradeCategory = 'combat' | 'survival' | 'utility';

export interface UpgradeDefinition {
  category: UpgradeCategory;
  baseCost: number;
  costGrowth: number;
  valuePerLevel: number;
  maxValue?: number;
}

export type UpgradeableStat = 'attackDamage' | 'attackSpeed' | 'maxHp' | 'criticalChance' | 'attackRange';

// `category` is metadata only - getUpgradeCost/upgradeStat never read it. It
// exists so the UI can later group these into Combat/Survival/Utility
// sections without touching the upgrade logic itself.
export const heroUpgradeConfig: Record<UpgradeableStat, UpgradeDefinition> = {
  attackDamage: { category: 'combat', baseCost: 10, costGrowth: 1.15, valuePerLevel: 2 },
  attackSpeed: { category: 'combat', baseCost: 15, costGrowth: 1.18, valuePerLevel: 0.05 },
  criticalChance: { category: 'combat', baseCost: 25, costGrowth: 1.25, valuePerLevel: 0.02, maxValue: 0.75 },
  maxHp: { category: 'survival', baseCost: 8, costGrowth: 1.12, valuePerLevel: 20 },
  attackRange: { category: 'utility', baseCost: 12, costGrowth: 1.15, valuePerLevel: 10 },
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
