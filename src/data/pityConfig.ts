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

// Hard pity thresholds - the gold pool's 80 is the "祈愿抽卡" spec's number
// (80 pulls without an SSR-or-better forces the 80th), reusing the same
// "rarities: X or above resets/satisfies the counter" mechanism this pool
// already had rather than adding a parallel SSR-only concept. The premium
// pool's guarantee stays tighter (30): premiumPullWeight already skews
// toward red/rainbow (see gachaConfig.ts), so its pity is a shorter backstop
// on top of already-decent odds, while the gold pool's 80 is the longer "so
// a long free-to-play run never feels completely dry" floor.
export const gachaPityConfig: Record<PityPoolId, PityRule> = {
  heroGold: { rarities: ['gold', 'red', 'rainbow'], pullsUntilGuarantee: 80 },
  petGold: { rarities: ['gold', 'red', 'rainbow'], pullsUntilGuarantee: 80 },
  heroPremium: { rarities: ['red', 'rainbow'], pullsUntilGuarantee: 30 },
  petPremium: { rarities: ['red', 'rainbow'], pullsUntilGuarantee: 30 },
};
