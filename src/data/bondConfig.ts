import { getHeroDefinition } from './heroRosterConfig';

// Class/theme tag each hero carries (heroRosterConfig.ts assigns one per
// hero) - fielding several heroes sharing a bond grants a team-wide bonus,
// same "1 + sum" threshold shape as talentConfig.ts.
export type BondId = 'warrior' | 'mage' | 'archer' | 'guardian' | 'support' | 'assassin' | 'summoner' | 'special';

export const bondIds: BondId[] = [
  'warrior',
  'mage',
  'archer',
  'guardian',
  'support',
  'assassin',
  'summoner',
  'special',
];

export interface BondThreshold {
  count: number;
  // +X% (or +X flat, for criticalChance) bonus once this many deployed
  // heroes share the bond.
  bonus: number;
}

// Plan section 14: "羁绊不应只有+Attack...可以改变玩法" - each bond feeds a
// different mechanic instead of every bond boosting the same attackDamage/
// maxHp pair. See getBondEffects for how each maps to a real system:
//   warrior  -> attackDamage%      (HeroStatsSystem)
//   guardian -> maxHp%             (HeroStatsSystem) - 圣骑士/坦克 tankiness
//   mage     -> skill damage%      (SkillSystem aoeDamage/chainDamage)
//   archer   -> criticalChance+    (HeroStatsSystem, flat like talent/ascension shop)
//   assassin -> attackSpeed%       (HeroStatsSystem)
//   support  -> heal power%        (SkillSystem healAlly) - 牧师阵营强化治疗
//   summoner -> pet attackDamage%  (HeroStatsSystem.recomputePetStats) - 召唤军团强化召唤物
//   special  -> gold/exp gain%     (DamageSystem.handleDeath) - 特殊/辅助 utility, not combat power
export type BondEffectId =
  | 'attackDamage'
  | 'maxHp'
  | 'skillDamage'
  | 'criticalChance'
  | 'attackSpeed'
  | 'healPower'
  | 'petDamage'
  | 'resourceGain';

export interface BondDefinition {
  thresholds: BondThreshold[];
  effect: BondEffectId;
}

// Same threshold curve for every bond (only what it boosts differs) - keeps
// the tuning surface small, same "tune later" precedent as every other curve
// in this project. Only counts deployed heroes (see getBondEffects), so it's
// a real squad-composition choice bounded by the 9-slot deploy cap
// (squadConfig.getMaxDeployedHeroes).
const sharedThresholds: BondThreshold[] = [
  { count: 2, bonus: 0.04 },
  { count: 4, bonus: 0.09 },
  { count: 6, bonus: 0.16 },
];

// criticalChance is a flat +X (like talentConfig's flat nodes), not a %
// multiplier - the thresholds read as +4%/+9%/+16% crit chance directly,
// scaled down so it stays sane alongside heroBaseConfig.criticalChance's
// 0.05 baseline instead of the 16% a %-multiplier read would imply.
const criticalChanceThresholds: BondThreshold[] = [
  { count: 2, bonus: 0.02 },
  { count: 4, bonus: 0.045 },
  { count: 6, bonus: 0.08 },
];

export const bondConfig: Record<BondId, BondDefinition> = {
  warrior: { thresholds: sharedThresholds, effect: 'attackDamage' },
  guardian: { thresholds: sharedThresholds, effect: 'maxHp' },
  mage: { thresholds: sharedThresholds, effect: 'skillDamage' },
  archer: { thresholds: criticalChanceThresholds, effect: 'criticalChance' },
  assassin: { thresholds: sharedThresholds, effect: 'attackSpeed' },
  support: { thresholds: sharedThresholds, effect: 'healPower' },
  summoner: { thresholds: sharedThresholds, effect: 'petDamage' },
  special: { thresholds: sharedThresholds, effect: 'resourceGain' },
};

function countDeployedByBond(deployedHeroIds: string[]): Partial<Record<BondId, number>> {
  const counts: Partial<Record<BondId, number>> = {};
  for (const heroId of deployedHeroIds) {
    const bondId = getHeroDefinition(heroId).bondId;
    counts[bondId] = (counts[bondId] ?? 0) + 1;
  }
  return counts;
}

function getBondBonus(bondId: BondId, counts: Partial<Record<BondId, number>>): number {
  const count = counts[bondId] ?? 0;
  const thresholds = bondConfig[bondId].thresholds;
  let bestBonus = 0;
  for (const threshold of thresholds) {
    if (count >= threshold.count) {
      bestBonus = threshold.bonus;
    }
  }
  return bestBonus;
}

export interface BondEffects {
  attackDamageMultiplier: number;
  maxHpMultiplier: number;
  skillDamageMultiplier: number;
  // Flat add, not a multiplier - see criticalChanceThresholds above.
  criticalChanceBonus: number;
  attackSpeedMultiplier: number;
  healPowerMultiplier: number;
  petDamageMultiplier: number;
  resourceGainMultiplier: number;
}

// One bond per effect today (see bondConfig above), but sums every bond
// mapped to a given effect rather than assuming a 1:1 relationship, so a
// future bond added to an existing effect just works. Multiplier fields are
// "1 + sum" (neutral when no bond is active); criticalChanceBonus is a raw
// sum, added the same way talent/ascension-shop crit bonuses already are
// in HeroStatsSystem.
export function getBondEffects(deployedHeroIds: string[]): BondEffects {
  const counts = countDeployedByBond(deployedHeroIds);

  function sumFor(effect: BondEffectId): number {
    let total = 0;
    for (const bondId of bondIds) {
      if (bondConfig[bondId].effect === effect) {
        total += getBondBonus(bondId, counts);
      }
    }
    return total;
  }

  return {
    attackDamageMultiplier: 1 + sumFor('attackDamage'),
    maxHpMultiplier: 1 + sumFor('maxHp'),
    skillDamageMultiplier: 1 + sumFor('skillDamage'),
    criticalChanceBonus: sumFor('criticalChance'),
    attackSpeedMultiplier: 1 + sumFor('attackSpeed'),
    healPowerMultiplier: 1 + sumFor('healPower'),
    petDamageMultiplier: 1 + sumFor('petDamage'),
    resourceGainMultiplier: 1 + sumFor('resourceGain'),
  };
}

// Drives the bond summary UI (HeroPanel) - which bonds are currently active
// and at what count, without exposing the raw multiplier math.
export function getActiveBondCounts(deployedHeroIds: string[]): Partial<Record<BondId, number>> {
  return countDeployedByBond(deployedHeroIds);
}
