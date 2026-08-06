import type { GachaRarity } from './gachaConfig';

// One counter per pull pool - gold/premium are tracked separately per
// roster (hero vs pet) since they're independent currencies/buttons in
// GachaPanel, so exhausting one pool's pity shouldn't silently consume
// progress toward another's.
export type PityPoolId = 'heroGold' | 'petGold' | 'heroPremium' | 'petPremium';

export interface PityRule {
  // Landing any of these rarities (naturally or forced) resets the pool's
  // counter to 0. Lowest tier first - GachaPanel uses rarities[0] as the
  // "X or better" label.
  rarities: GachaRarity[];
  // If the counter would reach this value without a natural hit, the next
  // pull is forced to roll only among `rarities` instead of the full table.
  pullsUntilGuarantee: number;
}

// Placeholder thresholds, tune later - same precedent as every other
// unspecified number in this project. The premium pool's guarantee is
// tighter than the gold pool's: premiumPullWeight already skews toward
// red/rainbow (see gachaConfig.ts), so its pity is a shorter backstop on
// top of already-decent odds, while the gold pool's is a longer "so a long
// run never feels completely dry" floor.
export const gachaPityConfig: Record<PityPoolId, PityRule> = {
  heroGold: { rarities: ['gold', 'red', 'rainbow'], pullsUntilGuarantee: 50 },
  petGold: { rarities: ['gold', 'red', 'rainbow'], pullsUntilGuarantee: 50 },
  heroPremium: { rarities: ['red', 'rainbow'], pullsUntilGuarantee: 30 },
  petPremium: { rarities: ['red', 'rainbow'], pullsUntilGuarantee: 30 },
};
