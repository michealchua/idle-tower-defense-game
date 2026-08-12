import type { UpgradeableStat } from './heroConfig';
import { weightedPick } from '../utils/scaling';
import { MAX_STAR_LEVEL, type GachaRarity } from './gachaConfig';

export type EquipmentSlot = 'weapon' | 'armor' | 'trinket' | 'boots';
// Reuses the same white/green/blue/purple/gold ladder as hero/pet gacha
// rarity (see gachaConfig.ts) instead of a second common/rare/epic/legendary
// vocabulary - one rarity concept, one set of i18n labels (locales/zh-CN.ts
// `rarity.*`).
export type EquipmentRarity = GachaRarity;

export interface LegendaryEffectDefinition {
  id: string;
  labelKey: string;
}

// Flavor/labels only - not wired into CombatSystem/SkillSystem yet. Each
// gold item is tagged with one of these so it reads as mechanically special
// in the UI, but no on-hit trigger exists in the engine today. Wiring an
// actual proc system is a separate feature.
export const legendaryEffects: LegendaryEffectDefinition[] = [
  { id: 'lightningOnHit', labelKey: 'equipment.legendaryEffectLightning' },
  { id: 'lifestealOnCrit', labelKey: 'equipment.legendaryEffectLifesteal' },
  { id: 'hasteOnKill', labelKey: 'equipment.legendaryEffectHaste' },
];

export interface RarityDefinition {
  // 0-star multiplier on a slot's base stat value (the "跨品质阶跃式膨胀" step).
  baseMultiplier: number;
  // Fraction added to baseMultiplier per star, so an item's effective
  // multiplier is baseMultiplier * (1 + starLevel * starGrowthRate) - higher
  // rarities both start higher and climb faster per star.
  starGrowthRate: number;
  // How many 副词条 (substats) an item of this rarity rolls - white/green: 1,
  // blue/purple: 2, gold/red: 3, rainbow: 4. Only 3 UpgradeableStats remain
  // once the item's own main stat is excluded, so rainbow's 4th substat
  // wraps back around and stacks a repeated stat - see rollSubstats.
  substatCount: number;
  // [min, max] multiplier applied to substatBaseValueByStat when rolling
  // each substat's value - the "词条数值品质" quality band.
  substatRollRange: [number, number];
  // Purple+ always rolls at least one substat at the top of
  // substatRollRange ("必出1条极品词条").
  guaranteesPremiumSubstat: boolean;
  // Gold only - see legendaryEffects above.
  hasLegendaryEffect: boolean;
  dropWeight: number;
  sellValue: number;
  // reforgeDust returned by EquipmentSystem.salvageEquipment when this
  // rarity's item is broken down - see resourceConfig.ts's ledger.
  reforgeDustValue: number;
}

export const equipmentRarities: Record<EquipmentRarity, RarityDefinition> = {
  white: {
    baseMultiplier: 1,
    starGrowthRate: 0.1,
    substatCount: 1,
    substatRollRange: [0.2, 0.4],
    guaranteesPremiumSubstat: false,
    hasLegendaryEffect: false,
    dropWeight: 55,
    sellValue: 5,
    reforgeDustValue: 3,
  },
  green: {
    baseMultiplier: 1.2,
    starGrowthRate: 0.12,
    substatCount: 1,
    substatRollRange: [0.5, 1.5],
    guaranteesPremiumSubstat: false,
    hasLegendaryEffect: false,
    dropWeight: 27,
    sellValue: 15,
    reforgeDustValue: 8,
  },
  blue: {
    baseMultiplier: 1.5,
    starGrowthRate: 0.15,
    substatCount: 2,
    substatRollRange: [1.5, 3],
    guaranteesPremiumSubstat: false,
    hasLegendaryEffect: false,
    dropWeight: 12,
    sellValue: 40,
    reforgeDustValue: 20,
  },
  purple: {
    baseMultiplier: 2,
    starGrowthRate: 0.2,
    substatCount: 2,
    substatRollRange: [3, 6],
    guaranteesPremiumSubstat: true,
    hasLegendaryEffect: false,
    dropWeight: 5,
    sellValue: 120,
    reforgeDustValue: 50,
  },
  gold: {
    baseMultiplier: 3,
    starGrowthRate: 0.3,
    substatCount: 3,
    substatRollRange: [5, 10],
    guaranteesPremiumSubstat: true,
    hasLegendaryEffect: true,
    dropWeight: 1,
    sellValue: 400,
    reforgeDustValue: 130,
  },
  red: {
    baseMultiplier: 4.5,
    starGrowthRate: 0.4,
    substatCount: 3,
    substatRollRange: [8, 16],
    guaranteesPremiumSubstat: true,
    hasLegendaryEffect: true,
    dropWeight: 0.3,
    sellValue: 1200,
    reforgeDustValue: 350,
  },
  rainbow: {
    baseMultiplier: 6.5,
    starGrowthRate: 0.55,
    substatCount: 4,
    substatRollRange: [12, 24],
    guaranteesPremiumSubstat: true,
    hasLegendaryEffect: true,
    dropWeight: 0.05,
    sellValue: 4000,
    reforgeDustValue: 900,
  },
};

export interface SlotDefinition {
  possibleStats: UpgradeableStat[];
  baseValueByStat: Partial<Record<UpgradeableStat, number>>;
}

// Each slot rolls from its own stat pool so weapon/armor/trinket/boots stay
// thematically distinct instead of being interchangeable stat-sticks.
export const equipmentSlots: Record<EquipmentSlot, SlotDefinition> = {
  weapon: {
    possibleStats: ['attackDamage', 'criticalChance'],
    baseValueByStat: { attackDamage: 4, criticalChance: 0.03 },
  },
  armor: {
    possibleStats: ['maxHp'],
    baseValueByStat: { maxHp: 15 },
  },
  trinket: {
    possibleStats: ['attackSpeed'],
    baseValueByStat: { attackSpeed: 0.06 },
  },
  boots: {
    possibleStats: ['maxHp', 'attackSpeed'],
    baseValueByStat: { maxHp: 10, attackSpeed: 0.04 },
  },
};

// Smaller reference pool an item's *substats* (副词条) roll against -
// deliberately lower than equipmentSlots.baseValueByStat so a secondary
// stat never outshines a slot's own primary roll.
export const substatBaseValueByStat: Record<UpgradeableStat, number> = {
  attackDamage: 2,
  attackSpeed: 0.02,
  maxHp: 8,
  criticalChance: 0.02,
};

const ALL_STATS: UpgradeableStat[] = ['attackDamage', 'attackSpeed', 'maxHp', 'criticalChance'];

export const equipmentDropConfig = {
  dropChance: 0.18,
};

function pickRarity(): EquipmentRarity {
  const entries = Object.entries(equipmentRarities) as [EquipmentRarity, RarityDefinition][];
  return weightedPick(entries.map(([id, def]) => ({ id, weight: def.dropWeight })));
}

function roundStatValue(stat: UpgradeableStat, value: number): number {
  if (stat === 'attackSpeed' || stat === 'criticalChance') {
    return Math.round(value * 100) / 100;
  }
  return Math.max(1, Math.round(value));
}

export interface EquipmentSubstat {
  stat: UpgradeableStat;
  value: number;
}

export interface EquipmentRoll {
  slot: EquipmentSlot;
  rarity: EquipmentRarity;
  stat: UpgradeableStat;
  value: number;
  substats: EquipmentSubstat[];
  legendaryEffectId?: string;
  setId?: EquipmentSetId;
}

//套装 (set) system - a hero wearing multiple pieces tagged with the same
// setId gets extra stat bonuses at 2 and 4 pieces, on top of each item's own
// main stat/affixes. Sets are per-hero (see HeroState.equipment), not a
// squad-wide effect.
export type EquipmentSetId = 'ironWill' | 'stormblade' | 'shadowVeil';

export interface EquipmentSetBonus {
  count: 2 | 4;
  statBonuses: Partial<Record<UpgradeableStat, number>>;
  // Flavor-only label for the 4pc bonus, same convention as legendaryEffects
  // above - not wired into CombatSystem, just surfaced in the UI.
  specialEffectLabelKey?: string;
}

export interface EquipmentSetDefinition {
  id: EquipmentSetId;
  nameKey: string;
  bonuses: EquipmentSetBonus[];
}

export const equipmentSets: Record<EquipmentSetId, EquipmentSetDefinition> = {
  ironWill: {
    id: 'ironWill',
    nameKey: 'equipment.setIronWill',
    bonuses: [
      { count: 2, statBonuses: { maxHp: 40 } },
      { count: 4, statBonuses: { maxHp: 100 }, specialEffectLabelKey: 'equipment.setIronWillEffect' },
    ],
  },
  stormblade: {
    id: 'stormblade',
    nameKey: 'equipment.setStormblade',
    bonuses: [
      { count: 2, statBonuses: { attackDamage: 12 } },
      { count: 4, statBonuses: { attackDamage: 30, criticalChance: 0.05 }, specialEffectLabelKey: 'equipment.setStormbladeEffect' },
    ],
  },
  shadowVeil: {
    id: 'shadowVeil',
    nameKey: 'equipment.setShadowVeil',
    bonuses: [
      { count: 2, statBonuses: { criticalChance: 0.04 } },
      { count: 4, statBonuses: { criticalChance: 0.08, attackSpeed: 0.1 }, specialEffectLabelKey: 'equipment.setShadowVeilEffect' },
    ],
  },
};

// Only blue+ items can roll as part of a set - keeps white/green drops as
// plain stat-sticks and set pieces feeling like a mid/high-rarity hook.
const SET_ELIGIBLE_RARITIES: EquipmentRarity[] = ['blue', 'purple', 'gold', 'red', 'rainbow'];
const SET_ITEM_CHANCE = 0.25;

function pickSetId(): EquipmentSetId {
  const ids = Object.keys(equipmentSets) as EquipmentSetId[];
  return ids[Math.floor(Math.random() * ids.length)];
}

// Structural subset of engine/types.ts's EquipmentItem - defined locally
// instead of imported to avoid a circular dependency (types.ts imports
// EquipmentSlot/EquipmentRarity/EquipmentSubstat from this file already).
// Any real EquipmentItem satisfies this shape.
interface SetTaggedItem {
  setId?: EquipmentSetId;
}

// Counts how many of a hero's equipped items belong to each set, and returns
// every bonus tier that count actually unlocks (2pc, plus 4pc once all four
// slots share a set). Order follows equipmentSets' declaration order.
export function getActiveSetBonuses(
  equipment: Partial<Record<EquipmentSlot, SetTaggedItem | null>>,
): { set: EquipmentSetDefinition; count: number; activeBonuses: EquipmentSetBonus[] }[] {
  const counts: Partial<Record<EquipmentSetId, number>> = {};
  for (const item of Object.values(equipment)) {
    if (item?.setId) {
      counts[item.setId] = (counts[item.setId] ?? 0) + 1;
    }
  }

  const results: { set: EquipmentSetDefinition; count: number; activeBonuses: EquipmentSetBonus[] }[] = [];
  for (const [setId, count] of Object.entries(counts) as [EquipmentSetId, number][]) {
    if (count < 2) {
      continue;
    }
    const set = equipmentSets[setId];
    const activeBonuses = set.bonuses.filter((bonus) => count >= bonus.count);
    results.push({ set, count, activeBonuses });
  }
  return results;
}

// Flattens every active set-bonus tier's statBonuses into one bonus object,
// the same shape computeHeroEquipmentBonuses (HeroStatsSystem.ts) already
// works with for main stats/affixes.
export function getEquipmentSetStatBonuses(
  equipment: Partial<Record<EquipmentSlot, SetTaggedItem | null>>,
): Partial<Record<UpgradeableStat, number>> {
  const bonuses: Partial<Record<UpgradeableStat, number>> = {};
  for (const { activeBonuses } of getActiveSetBonuses(equipment)) {
    for (const tier of activeBonuses) {
      for (const [stat, value] of Object.entries(tier.statBonuses) as [UpgradeableStat, number][]) {
        bonuses[stat] = (bonuses[stat] ?? 0) + value;
      }
    }
  }
  return bonuses;
}

// Effective (star-scaled) value of an item's primary stat - the "升星成长
// 曲线" formula: base * (1 + starLevel * rarity growth rate).
export function getEquipmentMainStatValue(rarity: EquipmentRarity, baseValue: number, starLevel: number): number {
  const def = equipmentRarities[rarity];
  return baseValue * (1 + starLevel * def.starGrowthRate);
}

// Rarity ladder in ascending power order - same ordering EquipmentPanel's
// own RARITY_RANK sort already uses, kept here too since HeroSystem's
// equip-strongest needs it without importing a component file.
const RARITY_ORDER: EquipmentRarity[] = ['white', 'green', 'blue', 'purple', 'gold', 'red', 'rainbow'];

// Single comparable "how good is this item" number backing HeroSystem.
// equipStrongestForHero - no in-game currency/stat concept unifies items
// across different main stats (attackDamage vs maxHp aren't directly
// comparable), so this leans on the same signal a player judges gear by at a
// glance: rarity first (dominant term), then star level, then the item's own
// scaled main-stat value as a same-rarity/same-star tiebreaker only (its
// range - a few dozen at most - is deliberately far too small to ever
// outweigh a rarity or star difference).
export function getEquipmentScore(item: { rarity: EquipmentRarity; stat: UpgradeableStat; value: number; starLevel: number }): number {
  const mainStatValue = getEquipmentMainStatValue(item.rarity, item.value, item.starLevel);
  return RARITY_ORDER.indexOf(item.rarity) * 10000 + item.starLevel * 1000 + mainStatValue;
}

// Exported for EquipmentSystem.reforgeEquipment, which re-rolls just an
// existing item's substats (kind/value) without touching its slot/rarity/
// main stat/set/legendary effect.
export function rollSubstats(rarity: EquipmentRarity, excludeStat: UpgradeableStat): EquipmentSubstat[] {
  const def = equipmentRarities[rarity];
  if (def.substatCount === 0) {
    return [];
  }

  const pool = ALL_STATS.filter((stat) => stat !== excludeStat);
  const shuffledPool = [...pool].sort(() => Math.random() - 0.5);
  const [minMult, maxMult] = def.substatRollRange;

  return Array.from({ length: def.substatCount }, (_, index) => {
    // Cycles back through the pool once a rarity rolls more substats than
    // there are non-main stats to draw from (rainbow's 4th line, since only
    // 3 UpgradeableStats remain once the main stat is excluded) - a
    // repeated stat just stacks, same net effect as if it had rolled twice.
    const stat = shuffledPool[index % shuffledPool.length];
    // Force one roll to the top of the band on rarities that guarantee a
    // premium substat ("必出1条极品词条").
    const mult = def.guaranteesPremiumSubstat && index === 0 ? maxMult : minMult + Math.random() * (maxMult - minMult);
    return { stat, value: roundStatValue(stat, substatBaseValueByStat[stat] * mult) };
  });
}

function pickLegendaryEffect(): string {
  return legendaryEffects[Math.floor(Math.random() * legendaryEffects.length)].id;
}

// Pure - no GameState access. EquipmentSystem wraps this with instance-id
// assignment and chance-gating, same split as enemyArchetypes/enemySpawnTable
// (pure data + picker) vs. SpawnSystem (state-aware wiring). Items always
// drop at 0 stars (see StarUpSystem-style star-up in EquipmentSystem.ts).
export function rollEquipment(): EquipmentRoll {
  const slotIds = Object.keys(equipmentSlots) as EquipmentSlot[];
  const slot = slotIds[Math.floor(Math.random() * slotIds.length)];
  const slotDef = equipmentSlots[slot];
  const stat = slotDef.possibleStats[Math.floor(Math.random() * slotDef.possibleStats.length)];
  const rarity = pickRarity();
  const baseValue = slotDef.baseValueByStat[stat] ?? 0;
  const variance = 0.85 + Math.random() * 0.3;
  const def = equipmentRarities[rarity];

  const rollsSet = SET_ELIGIBLE_RARITIES.includes(rarity) && Math.random() < SET_ITEM_CHANCE;

  return {
    slot,
    rarity,
    stat,
    value: roundStatValue(stat, baseValue * def.baseMultiplier * variance),
    substats: rollSubstats(rarity, stat),
    legendaryEffectId: def.hasLegendaryEffect ? pickLegendaryEffect() : undefined,
    setId: rollsSet ? pickSetId() : undefined,
  };
}

export function getEquipmentStarUpCost(rarity: EquipmentRarity, currentStar: number): number | undefined {
  if (currentStar >= MAX_STAR_LEVEL) {
    return undefined;
  }
  // Placeholder curve, same reasoning as gachaConfig's star-up costs - not
  // taken from a reference table, tune later. Scales with rarity's sell
  // value (a proxy for how "expensive" that tier already is) and grows
  // per star the same way heroUpgradeConfig's costGrowth does.
  const def = equipmentRarities[rarity];
  const growth = 1.6;
  return Math.round(def.sellValue * 20 * growth ** currentStar);
}

// Reforging re-rolls an item's substats in place (kind and value both) - the
// cost is pegged to that same rarity's own reforgeDustValue (what one such
// item returns on salvage), scaled up so reforging one item costs more dust
// than breaking down a single same-rarity item gives back - the player has
// to actually farm/salvage a few to afford it.
export function getReforgeCost(rarity: EquipmentRarity): number {
  return Math.round(equipmentRarities[rarity].reforgeDustValue * 2.5);
}
