import { computeScaledValue } from '../utils/scaling';

export type AscensionShopId = 'attackDamage' | 'maxHp' | 'goldGain' | 'expGain' | 'damageReduction' | 'criticalChance';

export interface AscensionShopDefinition {
  maxLevel: number;
  // Cost in ascension points to go from level N to N+1 - see getAscensionShopCost.
  baseCost: number;
  costGrowth: number;
  // Meaning depends on the node: most are "+X% per level" multipliers
  // (attackDamage/maxHp/goldGain/expGain), while criticalChance/
  // damageReduction are flat +X per level, capped by maxValue.
  valuePerLevel: number;
  maxValue?: number;
}

// Spent with ascensionPoints (see ascensionConfig.ts/AscensionSystem.ts) -
// unlike talentConfig.ts these levels are never reset by ascend() itself,
// they're the permanent payoff for ascending. Same shape/getters as the
// talent tree on purpose so both panels behave identically to the player.
export const ascensionShopConfig: Record<AscensionShopId, AscensionShopDefinition> = {
  attackDamage: { maxLevel: 50, baseCost: 1, costGrowth: 1.2, valuePerLevel: 0.05 },
  maxHp: { maxLevel: 50, baseCost: 1, costGrowth: 1.2, valuePerLevel: 0.05 },
  goldGain: { maxLevel: 30, baseCost: 1, costGrowth: 1.25, valuePerLevel: 0.08 },
  expGain: { maxLevel: 30, baseCost: 1, costGrowth: 1.25, valuePerLevel: 0.08 },
  damageReduction: { maxLevel: 20, baseCost: 2, costGrowth: 1.3, valuePerLevel: 0.015, maxValue: 0.3 },
  criticalChance: { maxLevel: 15, baseCost: 2, costGrowth: 1.3, valuePerLevel: 0.01 },
};

// Pure getters over `Record<AscensionShopId, number>` + the config above -
// same split rationale as talentConfig.ts (HeroStatsSystem/DamageSystem/
// MovementSystem read these without importing AscensionShopSystem, avoiding
// a cycle with its upgrade function).
export function getAscensionShopLevel(levels: Record<string, number>, id: AscensionShopId): number {
  return levels[id] ?? 0;
}

export function getAscensionShopCost(id: AscensionShopId, level: number): number {
  const def = ascensionShopConfig[id];
  return computeScaledValue(def.baseCost, def.costGrowth, level);
}

export function isAscensionShopMaxed(levels: Record<string, number>, id: AscensionShopId): boolean {
  return getAscensionShopLevel(levels, id) >= ascensionShopConfig[id].maxLevel;
}

// Multiplicative nodes (attackDamage/maxHp/goldGain/expGain) - "1 + N * valuePerLevel".
export function getAscensionShopMultiplier(levels: Record<string, number>, id: AscensionShopId): number {
  return 1 + getAscensionShopLevel(levels, id) * ascensionShopConfig[id].valuePerLevel;
}

// Flat/capped nodes (criticalChance/damageReduction) - "N * valuePerLevel",
// clamped to maxValue when the definition sets one.
export function getAscensionShopFlatBonus(levels: Record<string, number>, id: AscensionShopId): number {
  const def = ascensionShopConfig[id];
  const raw = getAscensionShopLevel(levels, id) * def.valuePerLevel;
  return def.maxValue !== undefined ? Math.min(raw, def.maxValue) : raw;
}
