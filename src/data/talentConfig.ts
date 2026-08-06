import { computeScaledValue } from './scaling';
import type { BossKind } from './waveConfig';

export type TalentId = 'goldGain' | 'expGain' | 'attackDamage' | 'maxHp' | 'damageReduction' | 'criticalChance';

export interface TalentDefinition {
  maxLevel: number;
  // Cost in skill points to go from level N to N+1 - see getTalentCost.
  baseCost: number;
  costGrowth: number;
  // Meaning depends on the node: most are "+X% per level" multipliers
  // (goldGain/expGain/attackDamage/maxHp), while criticalChance/
  // damageReduction are flat +X per level, capped by maxValue.
  valuePerLevel: number;
  maxValue?: number;
}

// Placeholder tree, tune later - same precedent as heroUpgradeConfig. Modeled
// after the reference game's SP-spend skill screen (gold+/xp+/atk/hp/shield/
// crit icons), minus the two purely-active abilities (time-freeze, poison)
// which would need new combat plumbing this pass doesn't cover.
export const talentConfig: Record<TalentId, TalentDefinition> = {
  goldGain: { maxLevel: 20, baseCost: 1, costGrowth: 1.3, valuePerLevel: 0.05 },
  expGain: { maxLevel: 20, baseCost: 1, costGrowth: 1.3, valuePerLevel: 0.05 },
  attackDamage: { maxLevel: 30, baseCost: 1, costGrowth: 1.25, valuePerLevel: 0.03 },
  maxHp: { maxLevel: 30, baseCost: 1, costGrowth: 1.25, valuePerLevel: 0.03 },
  damageReduction: { maxLevel: 20, baseCost: 2, costGrowth: 1.35, valuePerLevel: 0.02, maxValue: 0.5 },
  criticalChance: { maxLevel: 15, baseCost: 2, costGrowth: 1.3, valuePerLevel: 0.01 },
};

// Talent points are earned only by killing a wave's miniboss/boss (see
// DamageSystem.handleDeath) - there is deliberately no passive/idle income,
// so points stay tied to actually clearing content.
export const talentPointRewardConfig: Record<BossKind, number> = {
  miniboss: 1,
  boss: 3,
};

// Pure getters over `Record<TalentId, number>` + the config above - kept
// here (not in engine/systems/TalentSystem.ts) so HeroStatsSystem/
// MovementSystem can read talent bonuses without importing TalentSystem
// itself, which would create a cycle (TalentSystem.upgradeTalent already
// needs to call back into HeroStatsSystem to refresh stats after a purchase).
export function getTalentLevel(talentLevels: Record<string, number>, id: TalentId): number {
  return talentLevels[id] ?? 0;
}

export function getTalentCost(id: TalentId, level: number): number {
  const def = talentConfig[id];
  return computeScaledValue(def.baseCost, def.costGrowth, level);
}

export function isTalentMaxed(talentLevels: Record<string, number>, id: TalentId): boolean {
  return getTalentLevel(talentLevels, id) >= talentConfig[id].maxLevel;
}

// Multiplicative nodes (goldGain/expGain/attackDamage/maxHp) -
// "1 + N * valuePerLevel".
export function getTalentMultiplier(talentLevels: Record<string, number>, id: TalentId): number {
  return 1 + getTalentLevel(talentLevels, id) * talentConfig[id].valuePerLevel;
}

// Flat/capped nodes (criticalChance/damageReduction) - "N * valuePerLevel",
// clamped to maxValue when the definition sets one.
export function getTalentFlatBonus(talentLevels: Record<string, number>, id: TalentId): number {
  const def = talentConfig[id];
  const raw = getTalentLevel(talentLevels, id) * def.valuePerLevel;
  return def.maxValue !== undefined ? Math.min(raw, def.maxValue) : raw;
}
