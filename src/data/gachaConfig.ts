export type GachaRarity = 'white' | 'green' | 'blue' | 'purple' | 'gold';

export type BreakthroughMaterial = 'epicSourceStone' | 'legendarySourceStone';

export interface StarUpStageCost {
  shards: number;
  gold: number;
  material?: number;
}

export interface GachaRarityDefinition {
  // Placeholder odds - not specified by the source tables, tune later.
  pullWeight: number;
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
export const gachaRarityConfig: Record<GachaRarity, GachaRarityDefinition> = {
  white: {
    pullWeight: 55,
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
    pullWeight: 27,
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
    pullWeight: 12,
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
    pullWeight: 5,
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
    pullWeight: 1,
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
};

export const MAX_STAR_LEVEL = 5;

export const gachaPullConfig = {
  // Placeholder - both pools cost gold since there's no separate summon
  // currency with a real income source yet.
  pullCostGold: 100,
  // Multi-pull sizes offered in GachaPanel, cheapest first. No bulk
  // discount - total cost is always pullCostGold * count. The 100-pull
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
