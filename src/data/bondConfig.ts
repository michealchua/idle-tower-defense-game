import { getHeroDefinition } from './heroRosterConfig';

// Class/theme tag each hero carries (heroRosterConfig.ts assigns one per
// hero) - fielding several heroes sharing a bond grants a team-wide
// percentage bonus, same "1 + sum" multiplier shape as talentConfig.ts.
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
  // +X% bonus once this many deployed heroes share the bond.
  bonus: number;
}

export interface BondDefinition {
  thresholds: BondThreshold[];
}

// Same threshold curve for every bond and both stats it feeds (no per-bond
// specialization yet) - keeps the first version simple, tune later like
// every other placeholder curve in this project. Only counts deployed
// heroes (see getBondMultiplier), so it's a real squad-composition choice
// bounded by the 9-slot deploy cap (castleConfig.getMaxDeployedHeroes).
const sharedThresholds: BondThreshold[] = [
  { count: 2, bonus: 0.04 },
  { count: 4, bonus: 0.09 },
  { count: 6, bonus: 0.16 },
];

export const bondConfig: Record<BondId, BondDefinition> = {
  warrior: { thresholds: sharedThresholds },
  mage: { thresholds: sharedThresholds },
  archer: { thresholds: sharedThresholds },
  guardian: { thresholds: sharedThresholds },
  support: { thresholds: sharedThresholds },
  assassin: { thresholds: sharedThresholds },
  summoner: { thresholds: sharedThresholds },
  special: { thresholds: sharedThresholds },
};

function countDeployedByBond(deployedHeroIds: string[]): Partial<Record<BondId, number>> {
  const counts: Partial<Record<BondId, number>> = {};
  for (const heroId of deployedHeroIds) {
    const bondId = getHeroDefinition(heroId).bondId;
    counts[bondId] = (counts[bondId] ?? 0) + 1;
  }
  return counts;
}

// The highest threshold each active bond has reached, summed into a single
// "1 + sum" multiplier - applied to attackDamage/maxHp in
// HeroStatsSystem.recomputeHeroStats alongside the talent/ascension/castle
// multipliers, which is why the return shape matches getTalentMultiplier
// instead of a raw bonus number.
export function getBondMultiplier(deployedHeroIds: string[]): number {
  const counts = countDeployedByBond(deployedHeroIds);
  let totalBonus = 0;

  for (const bondId of bondIds) {
    const count = counts[bondId] ?? 0;
    const thresholds = bondConfig[bondId].thresholds;
    let bestBonus = 0;
    for (const threshold of thresholds) {
      if (count >= threshold.count) {
        bestBonus = threshold.bonus;
      }
    }
    totalBonus += bestBonus;
  }

  return 1 + totalBonus;
}

// Drives the bond summary UI (HeroPanel) - which bonds are currently active
// and at what count, without exposing the raw multiplier math.
export function getActiveBondCounts(deployedHeroIds: string[]): Partial<Record<BondId, number>> {
  return countDeployedByBond(deployedHeroIds);
}
