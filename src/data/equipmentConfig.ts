import type { UpgradeableStat } from './heroConfig';
import { weightedPick } from './scaling';
import { MAX_STAR_LEVEL, type GachaRarity } from './gachaConfig';

export type EquipmentSlot = 'weapon' | 'armor' | 'trinket';
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
  // How many secondary affixes an item of this rarity rolls.
  affixCount: number;
  // [min, max] multiplier applied to affixBaseValueByStat when rolling each
  // affix's value - the "词条数值品质" quality band.
  affixRollRange: [number, number];
  // Purple+ always rolls at least one affix at the top of affixRollRange
  // ("必出1条极品词条").
  guaranteesPremiumAffix: boolean;
  // Gold only - see legendaryEffects above.
  hasLegendaryEffect: boolean;
  dropWeight: number;
  sellValue: number;
}

export const equipmentRarities: Record<EquipmentRarity, RarityDefinition> = {
  white: {
    baseMultiplier: 1,
    starGrowthRate: 0.1,
    affixCount: 0,
    affixRollRange: [0, 0],
    guaranteesPremiumAffix: false,
    hasLegendaryEffect: false,
    dropWeight: 55,
    sellValue: 5,
  },
  green: {
    baseMultiplier: 1.2,
    starGrowthRate: 0.12,
    affixCount: 1,
    affixRollRange: [0.5, 1.5],
    guaranteesPremiumAffix: false,
    hasLegendaryEffect: false,
    dropWeight: 27,
    sellValue: 15,
  },
  blue: {
    baseMultiplier: 1.5,
    starGrowthRate: 0.15,
    affixCount: 2,
    affixRollRange: [1.5, 3],
    guaranteesPremiumAffix: false,
    hasLegendaryEffect: false,
    dropWeight: 12,
    sellValue: 40,
  },
  purple: {
    baseMultiplier: 2,
    starGrowthRate: 0.2,
    affixCount: 3,
    affixRollRange: [3, 6],
    guaranteesPremiumAffix: true,
    hasLegendaryEffect: false,
    dropWeight: 5,
    sellValue: 120,
  },
  gold: {
    baseMultiplier: 3,
    starGrowthRate: 0.3,
    affixCount: 4,
    affixRollRange: [5, 10],
    guaranteesPremiumAffix: true,
    hasLegendaryEffect: true,
    dropWeight: 1,
    sellValue: 400,
  },
};

export interface SlotDefinition {
  possibleStats: UpgradeableStat[];
  baseValueByStat: Partial<Record<UpgradeableStat, number>>;
}

// Each slot rolls from its own stat pool so weapon/armor/trinket stay
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
    possibleStats: ['attackSpeed', 'attackRange'],
    baseValueByStat: { attackSpeed: 0.06, attackRange: 12 },
  },
};

// Smaller reference pool an item's *affixes* roll against - deliberately
// lower than equipmentSlots.baseValueByStat so a secondary stat never
// outshines a slot's own primary roll.
export const affixBaseValueByStat: Record<UpgradeableStat, number> = {
  attackDamage: 2,
  attackSpeed: 0.02,
  maxHp: 8,
  criticalChance: 0.02,
  attackRange: 6,
};

const ALL_STATS: UpgradeableStat[] = ['attackDamage', 'attackSpeed', 'maxHp', 'criticalChance', 'attackRange'];

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

export interface EquipmentAffix {
  stat: UpgradeableStat;
  value: number;
}

export interface EquipmentRoll {
  slot: EquipmentSlot;
  rarity: EquipmentRarity;
  stat: UpgradeableStat;
  value: number;
  affixes: EquipmentAffix[];
  legendaryEffectId?: string;
}

// Effective (star-scaled) value of an item's primary stat - the "升星成长
// 曲线" formula: base * (1 + starLevel * rarity growth rate).
export function getEquipmentMainStatValue(rarity: EquipmentRarity, baseValue: number, starLevel: number): number {
  const def = equipmentRarities[rarity];
  return baseValue * (1 + starLevel * def.starGrowthRate);
}

function rollAffixes(rarity: EquipmentRarity, excludeStat: UpgradeableStat): EquipmentAffix[] {
  const def = equipmentRarities[rarity];
  if (def.affixCount === 0) {
    return [];
  }

  const pool = ALL_STATS.filter((stat) => stat !== excludeStat);
  const stats = pool.sort(() => Math.random() - 0.5).slice(0, def.affixCount);
  const [minMult, maxMult] = def.affixRollRange;

  return stats.map((stat, index) => {
    // Force one roll to the top of the band on rarities that guarantee a
    // premium affix ("极品词条").
    const mult = def.guaranteesPremiumAffix && index === 0 ? maxMult : minMult + Math.random() * (maxMult - minMult);
    return { stat, value: roundStatValue(stat, affixBaseValueByStat[stat] * mult) };
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

  return {
    slot,
    rarity,
    stat,
    value: roundStatValue(stat, baseValue * def.baseMultiplier * variance),
    affixes: rollAffixes(rarity, stat),
    legendaryEffectId: def.hasLegendaryEffect ? pickLegendaryEffect() : undefined,
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
