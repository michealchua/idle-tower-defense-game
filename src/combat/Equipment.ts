// Equipment data model (step 19) - deliberately independent of BattleHero's
// own level-growth system: an equipped item layers flat/percent bonuses on
// top of whatever BattleHero.upgrade()/evolveInto already produced, rather
// than replacing or otherwise interacting with either (see BattleHero's
// levelStats/computeFinalStat doc comments for exactly how the two combine).

export enum EquipmentSlot {
  Weapon = 'weapon',
  Armor = 'armor',
  Boots = 'boots',
  Accessory = 'accessory',
}

export enum EquipmentRarity {
  Common = 'common',
  Rare = 'rare',
  Epic = 'epic',
  Legendary = 'legendary',
}

/**
 * One stat's bonus from a single item - either or both of `flat`/`percent`
 * can be set (e.g. a plain weapon might carry only `flat`, a ring only
 * `percent`). `percent` is a fraction (0.1 = +10%), applied against the
 * stat's pre-equipment, post-level value only - see BattleHero.
 * computeFinalStat's doc comment for the exact combined formula.
 */
export interface StatModifierValue {
  flat?: number;
  percent?: number;
}

/**
 * One modifier entry per stat an item can affect - every field optional,
 * an item only sets the ones it actually rolled. Keys deliberately mirror
 * BattleHero's internal levelStats keys (maxHp/attack/defense/attackSpeed/
 * crit) so BattleHero.computeFinalStat can index straight into this object
 * without a translation layer.
 */
export interface StatModifiers {
  maxHp?: StatModifierValue;
  attack?: StatModifierValue;
  defense?: StatModifierValue;
  attackSpeed?: StatModifierValue;
  crit?: StatModifierValue;
}

/**
 * A single, already-rolled piece of equipment - what actually lives in
 * InventoryManager and in a BattleHero's equipment slots. Not a template:
 * two drops of the same base item still get their own instanceId, the same
 * "instance vs template" split BattleEnemy/BattleHero already follow for
 * their own archetypes/HeroTemplates (see equipmentCatalog.ts's
 * EquipmentTemplate, which is what this gets cloned from).
 */
export interface EquipmentItem {
  instanceId: string;
  /** equipmentCatalog.ts template id this instance was rolled from. */
  itemId: string;
  name: string;
  slot: EquipmentSlot;
  rarity: EquipmentRarity;
  modifiers: StatModifiers;
  /** Enhancement level - starts at 1, capped at RARITY_MAX_LEVEL[rarity]. Every level above 1 scales *this item's own* modifiers up by equipmentLevelMultiplier - see BattleHero.computeFinalStat, which is what actually applies it. */
  level: number;
  /** Exp already banked toward the next level - see expThresholdForLevel/applyEnhancementExp. Reset (minus overflow) each time a level-up actually triggers. */
  currentExp: number;
  /** Exp this item grants when consumed as "fodder" by another item's enhancement (step 20) - see RARITY_BASE_EXP_VALUE. Fixed at roll time, independent of the item's own level/currentExp. */
  baseExpValue: number;
  /** Path to this item's own sprite art (step 21) - GameRenderer draws it as an overlay layer on top of a hero's base sprite (weapon) or a small icon over its body (armor). Optional: a test-run.ts-style manually-constructed item with no sprite simply isn't drawn as an overlay (still shows up fine everywhere else - inventory panel, stat math, etc). */
  spriteUrl?: string;
  /** Aura/particle glow color, set for Epic/Legendary rarities (see RARITY_GLOW_COLOR) - GameRenderer draws a breathing aura under any hero wearing gear with this set, and uses it for the high-enhancement sprite glow too (see applyEnhancementExp's level threshold in GameRenderer). Optional/undefined for Common/Rare gear, which has no aura. */
  glowColor?: string;
}

/** Aura/glow color per rarity - only Epic and Legendary gear glows; Common/Rare entries are simply absent (a Partial, not defaulted to undefined explicitly) so `RARITY_GLOW_COLOR[rarity]` reads as "no glow" for them without a special case at every call site. */
export const RARITY_GLOW_COLOR: Partial<Record<EquipmentRarity, string>> = {
  [EquipmentRarity.Epic]: '#8A2BE2',
  [EquipmentRarity.Legendary]: '#FFD700',
};

/** Per-rarity enhancement level cap - higher-rarity gear has more headroom to grow into, rather than every item topping out at the same level. */
export const RARITY_MAX_LEVEL: Record<EquipmentRarity, number> = {
  [EquipmentRarity.Common]: 5,
  [EquipmentRarity.Rare]: 10,
  [EquipmentRarity.Epic]: 15,
  [EquipmentRarity.Legendary]: 20,
};

/** Base "fodder value" (exp granted when consumed by another item's enhancement) per rarity - what equipmentCatalog.generateRandomEquipment seeds a fresh item's baseExpValue with. A spare Legendary meaningfully accelerates enhancement; a spare Common barely does - matches the intent of "消耗不需要的装备作为狗粮". */
export const RARITY_BASE_EXP_VALUE: Record<EquipmentRarity, number> = {
  [EquipmentRarity.Common]: 10,
  [EquipmentRarity.Rare]: 30,
  [EquipmentRarity.Epic]: 80,
  [EquipmentRarity.Legendary]: 200,
};

/** Exp required to go from `level` to `level + 1` - grows geometrically so late levels cost meaningfully more fodder than early ones, not a flat threshold forever (same growth-rate pattern BattleHero's own getUpgradeCost uses). */
export function expThresholdForLevel(level: number): number {
  return Math.round(50 * 1.25 ** (level - 1));
}

/** Multiplier applied to every one of an item's own flat/percent modifiers, driven by its enhancement level - +10% of the item's own base numbers per level above 1 (level 1 = 1.0x, i.e. no change). */
export function equipmentLevelMultiplier(level: number): number {
  return 1 + (level - 1) * 0.1;
}

/**
 * Adds `expAmount` to `item.currentExp`, leveling it up - possibly
 * multiple times off one large infusion - for as long as there's enough
 * banked to clear expThresholdForLevel(item.level) and item.level is still
 * under its rarity's RARITY_MAX_LEVEL cap. Overflow exp beyond a level-up
 * threshold carries over into the next level's own progress rather than
 * being discarded. Mutates `item` in place (this is the single, shared
 * enhancement-math entrypoint both InventoryManager.enhanceEquipment and
 * GameManager's equipped-item path call, so bag items and worn items level
 * up identically) and returns how many levels it actually gained. Once
 * maxLevel is reached, currentExp is pinned at 0 and any further exp is
 * simply dropped rather than banked uselessly forever.
 */
export function applyEnhancementExp(item: EquipmentItem, expAmount: number): number {
  const maxLevel = RARITY_MAX_LEVEL[item.rarity];
  if (item.level >= maxLevel) {
    return 0;
  }

  item.currentExp += expAmount;
  let levelsGained = 0;

  while (item.level < maxLevel) {
    const threshold = expThresholdForLevel(item.level);
    if (item.currentExp < threshold) {
      break;
    }
    item.currentExp -= threshold;
    item.level += 1;
    levelsGained += 1;
  }

  if (item.level >= maxLevel) {
    item.currentExp = 0;
  }

  return levelsGained;
}
