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
}
