import { computeScaledValue } from './scaling';
import { baseConfig } from './baseConfig';
import { squadConfig } from './squadConfig';

// Placeholder curve, same "tune later" precedent as every other cost table
// in this project. Castle level is permanent collection/structure progress -
// it survives ascension (see AscensionSystem.ts, which never touches it),
// same as unlocked heroes/pets/equipment.
export const castleConfig = {
  // No hard cap in v1 - the cost curve is the real limiter.
  baseUpgradeCost: 500,
  upgradeCostGrowth: 1.35,
  // Additive to baseConfig.maxHp per level beyond 1 (level 1 = the
  // baseConfig.maxHp baseline, no bonus yet).
  maxHpPerLevel: 40,
  // +1 slot every N castle levels beyond 1, added on top of squadConfig's
  // level-1 baseline - existing squad caps only ever grow, never shrink
  // (until maxDeployedHeroesCap below).
  heroSlotEveryNLevels: 2,
};

export function getCastleUpgradeCost(currentLevel: number): number {
  return computeScaledValue(castleConfig.baseUpgradeCost, castleConfig.upgradeCostGrowth, currentLevel - 1);
}

export function getBaseMaxHpForCastleLevel(level: number): number {
  return baseConfig.maxHp + (level - 1) * castleConfig.maxHpPerLevel;
}

// Hard-capped at 9 - the deploy grid/bond system are both designed around a
// 9-hero squad ceiling, so castle-level growth stops adding slots once it
// gets there instead of growing without bound.
export const maxDeployedHeroesCap = 9;

export function getMaxDeployedHeroes(castleLevel: number): number {
  return Math.min(
    maxDeployedHeroesCap,
    squadConfig.maxDeployedHeroes + Math.floor((castleLevel - 1) / castleConfig.heroSlotEveryNLevels),
  );
}
