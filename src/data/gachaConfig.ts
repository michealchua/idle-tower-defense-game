// red (至尊/"Supreme") and rainbow (彩/"Legendary") sit above gold - the two
// tiers whose breakthrough material is diamonds instead of a source stone
// (see BreakthroughMaterial below), gating them behind the premium currency
// rather than just gold/shards.
export type GachaRarity = 'white' | 'green' | 'blue' | 'purple' | 'gold' | 'red' | 'rainbow';

export type BreakthroughMaterial = 'epicSourceStone' | 'legendarySourceStone' | 'diamonds';

export interface StarUpStageCost {
  shards: number;
  gold: number;
  material?: number;
}

export interface GachaRarityDefinition {
  // Placeholder odds - not specified by the source tables, tune later.
  pullWeight: number;
  // Odds used by the diamond premium pool (see gachaPullConfig.
  // pullCostDiamonds/GachaSystem.pullHeroPremium) instead of pullWeight -
  // deliberately front-loaded toward purple+ so spending diamonds visibly
  // beats the gold pool's odds, not just its currency.
  premiumPullWeight: number;
  shardsPerDuplicate: number;
  breakthroughMaterial?: BreakthroughMaterial;
  // Index i = the cost to go from i★ to (i+1)★. Length 5 (0★→5★ max).
  starUpCosts: StarUpStageCost[];
}

// Costs are taken directly from the user's reference tables (point击泰坦 /
// 成长城堡-style), with 万 (×10,000) converted into the game's plain gold
// units. Pull odds and per-star stat bonus are NOT in those tables - see
// gachaPullConfig below, defaulted the same way every other unspecified
// number in this project has been.
// pullWeight (the gold-cost pool's odds) is tuned to the "祈愿抽卡" spec's
// four buckets - N 50% (white+green) / R 30% (blue) / SR 18% (purple) /
// SSR 2% (gold+red+rainbow combined, split between the three the same
// ~81:17:2 ratio the tiers already had) - summing to exactly 100. Only the
// gold pool was retuned; premiumPullWeight (the diamond pool) is
// deliberately left alone, it's a separate, already-more-generous curve.
export const gachaRarityConfig: Record<GachaRarity, GachaRarityDefinition> = {
  white: {
    pullWeight: 34,
    premiumPullWeight: 20,
    shardsPerDuplicate: 10,
    starUpCosts: [
      { shards: 10, gold: 1000 },
      { shards: 20, gold: 2000 },
      { shards: 30, gold: 3000 },
      { shards: 40, gold: 4000 },
      { shards: 50, gold: 5000 },
    ],
  },
  green: {
    pullWeight: 16,
    premiumPullWeight: 20,
    shardsPerDuplicate: 20,
    starUpCosts: [
      { shards: 20, gold: 2000 },
      { shards: 40, gold: 4000 },
      { shards: 60, gold: 6000 },
      { shards: 80, gold: 8000 },
      { shards: 100, gold: 10000 },
    ],
  },
  blue: {
    pullWeight: 30,
    premiumPullWeight: 20,
    shardsPerDuplicate: 30,
    starUpCosts: [
      { shards: 30, gold: 5000 },
      { shards: 60, gold: 10000 },
      { shards: 90, gold: 15000 },
      { shards: 120, gold: 20000 },
      { shards: 150, gold: 25000 },
    ],
  },
  purple: {
    pullWeight: 18,
    premiumPullWeight: 20,
    shardsPerDuplicate: 40,
    breakthroughMaterial: 'epicSourceStone',
    starUpCosts: [
      { shards: 20, gold: 10000, material: 0 },
      { shards: 40, gold: 30000, material: 0 },
      { shards: 60, gold: 80000, material: 1 },
      { shards: 80, gold: 200000, material: 3 },
      { shards: 120, gold: 500000, material: 6 },
    ],
  },
  gold: {
    pullWeight: 1.63,
    premiumPullWeight: 12,
    shardsPerDuplicate: 60,
    breakthroughMaterial: 'legendarySourceStone',
    starUpCosts: [
      { shards: 20, gold: 50000, material: 0 },
      { shards: 40, gold: 150000, material: 1 },
      { shards: 60, gold: 400000, material: 3 },
      { shards: 120, gold: 1000000, material: 7 },
      { shards: 180, gold: 2500000, material: 15 },
    ],
  },
  // Diamond-gated tiers - extremely rare from the gold-cost pool (see
  // gachaPullConfig), meaningfully more common from the diamond premium pool
  // (gachaPullConfig.premiumPullWeight).
  red: {
    pullWeight: 0.33,
    premiumPullWeight: 6,
    shardsPerDuplicate: 80,
    breakthroughMaterial: 'diamonds',
    starUpCosts: [
      { shards: 30, gold: 125000, material: 0 },
      { shards: 60, gold: 375000, material: 1 },
      { shards: 90, gold: 1000000, material: 2 },
      { shards: 150, gold: 2500000, material: 5 },
      { shards: 220, gold: 6000000, material: 10 },
    ],
  },
  rainbow: {
    pullWeight: 0.04,
    premiumPullWeight: 2,
    shardsPerDuplicate: 100,
    breakthroughMaterial: 'diamonds',
    starUpCosts: [
      { shards: 40, gold: 300000, material: 1 },
      { shards: 80, gold: 900000, material: 3 },
      { shards: 120, gold: 2500000, material: 6 },
      { shards: 200, gold: 6000000, material: 12 },
      { shards: 280, gold: 15000000, material: 25 },
    ],
  },
};

export const MAX_STAR_LEVEL = 5;

export const gachaPullConfig = {
  pullCostGold: 100,
  // Diamond premium pool (see GachaSystem.pullHeroPremium/pullPetPremium) -
  // better odds via premiumPullWeight above, same multi-pull sizes/no-bulk-
  // discount shape as the gold pool.
  pullCostDiamonds: 50,
  // Multi-pull sizes offered in GachaPanel, cheapest first. No bulk
  // discount - total cost is always pullCost* * count. The 100-pull
  // button only renders once the player can actually afford it (see
  // GachaPanel), the others always show.
  multiPullCounts: [10, 100],
};

// Placeholder - applied to attackDamage/maxHp only, same reasoning as
// ascensionConfig/evolutionConfig (a % on criticalChance/range is nonsensical).
export const starBonusPerStar = 0.08;

export function getStarUpCost(rarity: GachaRarity, currentStar: number): StarUpStageCost | undefined {
  return gachaRarityConfig[rarity].starUpCosts[currentStar];
}
