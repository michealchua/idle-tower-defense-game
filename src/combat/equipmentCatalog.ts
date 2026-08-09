import { EquipmentRarity, EquipmentSlot, RARITY_BASE_EXP_VALUE, RARITY_GLOW_COLOR, type EquipmentItem, type StatModifiers } from './Equipment';

/** `/sprites/equipment/<itemId>.png` - one sprite file per template (16 total), not per-instance, same "keyed by identity, not by every drop" convention assetLoader.ts's getHeroSpriteSrc/getEnemySpriteSrc already follow. GameRenderer falls back to a solid-color placeholder (same as hero/enemy sprites) for as long as the file isn't actually present under public/. */
export function equipmentSpriteSrc(itemId: string): string {
  return `/sprites/equipment/${itemId}.png`;
}

/** Author-time template a random drop is rolled from - generateRandomEquipment clones one of these into a fresh, independently-instanced EquipmentItem. Never handed out directly. */
export interface EquipmentTemplate {
  itemId: string;
  name: string;
  slot: EquipmentSlot;
  rarity: EquipmentRarity;
  modifiers: StatModifiers;
}

/** A handful of hand-authored templates per slot, spread across all 4 rarities - enough for generateRandomEquipment's rarity-then-uniform-pick roll to have real variety without needing a procedural stat-roll system yet. */
export const equipmentTemplates: EquipmentTemplate[] = [
  // Weapons - boost attack, higher rarities add crit on top.
  { itemId: 'weapon-common-shortsword', name: '短剑', slot: EquipmentSlot.Weapon, rarity: EquipmentRarity.Common, modifiers: { attack: { flat: 5 } } },
  { itemId: 'weapon-rare-longsword', name: '精钢长剑', slot: EquipmentSlot.Weapon, rarity: EquipmentRarity.Rare, modifiers: { attack: { flat: 12, percent: 0.05 } } },
  { itemId: 'weapon-epic-warblade', name: '战刃', slot: EquipmentSlot.Weapon, rarity: EquipmentRarity.Epic, modifiers: { attack: { flat: 25, percent: 0.1 }, crit: { flat: 0.05 } } },
  { itemId: 'weapon-legendary-dawnbringer', name: '曙光之刃', slot: EquipmentSlot.Weapon, rarity: EquipmentRarity.Legendary, modifiers: { attack: { flat: 50 }, crit: { flat: 0.1 } } },

  // Armor - boost maxHp, higher rarities add defense on top.
  { itemId: 'armor-common-leather', name: '皮甲', slot: EquipmentSlot.Armor, rarity: EquipmentRarity.Common, modifiers: { maxHp: { flat: 30 } } },
  { itemId: 'armor-rare-chainmail', name: '锁子甲', slot: EquipmentSlot.Armor, rarity: EquipmentRarity.Rare, modifiers: { maxHp: { flat: 100 }, defense: { flat: 5 } } },
  { itemId: 'armor-epic-plate', name: '板甲', slot: EquipmentSlot.Armor, rarity: EquipmentRarity.Epic, modifiers: { maxHp: { flat: 180, percent: 0.08 }, defense: { flat: 12 } } },
  { itemId: 'armor-legendary-aegis', name: '天穹之壁', slot: EquipmentSlot.Armor, rarity: EquipmentRarity.Legendary, modifiers: { maxHp: { flat: 300, percent: 0.15 }, defense: { flat: 25 } } },

  // Boots - boost attackSpeed, higher rarities add a little maxHp.
  { itemId: 'boots-common-cloth', name: '布靴', slot: EquipmentSlot.Boots, rarity: EquipmentRarity.Common, modifiers: { attackSpeed: { flat: 0.05 } } },
  { itemId: 'boots-rare-lightfoot', name: '轻盈之靴', slot: EquipmentSlot.Boots, rarity: EquipmentRarity.Rare, modifiers: { attackSpeed: { flat: 0.1, percent: 0.05 } } },
  { itemId: 'boots-epic-windwalker', name: '疾风战靴', slot: EquipmentSlot.Boots, rarity: EquipmentRarity.Epic, modifiers: { attackSpeed: { flat: 0.15, percent: 0.1 }, maxHp: { flat: 40 } } },
  { itemId: 'boots-legendary-tempest', name: '风暴之靴', slot: EquipmentSlot.Boots, rarity: EquipmentRarity.Legendary, modifiers: { attackSpeed: { flat: 0.25, percent: 0.15 }, maxHp: { flat: 80 } } },

  // Accessories - mixed bag, crit-leaning, higher rarities add attack.
  { itemId: 'accessory-common-charm', name: '护符', slot: EquipmentSlot.Accessory, rarity: EquipmentRarity.Common, modifiers: { crit: { flat: 0.02 } } },
  { itemId: 'accessory-rare-ring', name: '战术指环', slot: EquipmentSlot.Accessory, rarity: EquipmentRarity.Rare, modifiers: { crit: { flat: 0.04 }, attack: { flat: 6 } } },
  { itemId: 'accessory-epic-amulet', name: '灵魂坠饰', slot: EquipmentSlot.Accessory, rarity: EquipmentRarity.Epic, modifiers: { crit: { flat: 0.06 }, attack: { flat: 12, percent: 0.05 } } },
  { itemId: 'accessory-legendary-eye', name: '深渊之眼', slot: EquipmentSlot.Accessory, rarity: EquipmentRarity.Legendary, modifiers: { crit: { flat: 0.1 }, attack: { flat: 20, percent: 0.1 } } },
];

/** Relative drop weight per rarity - Common drops roughly 11x as often as Legendary, so a lucky Legendary still feels rare without being effectively unobtainable. */
const RARITY_WEIGHTS: Record<EquipmentRarity, number> = {
  [EquipmentRarity.Common]: 55,
  [EquipmentRarity.Rare]: 27,
  [EquipmentRarity.Epic]: 13,
  [EquipmentRarity.Legendary]: 5,
};

/**
 * Rarity-weighted roll, restricted to `allowedRarities` when given (step
 * 25's offline rewards pass [Common, Rare] here, so a napping player can
 * never walk away with an Epic/Legendary - those stay earnable only through
 * InventoryManager.rollLootFor's real elite/boss kills). Relative weights
 * between the allowed rarities are preserved exactly as RARITY_WEIGHTS
 * defines them - restricting the pool doesn't change Common's odds
 * relative to Rare, it just removes Epic/Legendary from consideration
 * entirely.
 */
function rollRarity(allowedRarities?: EquipmentRarity[]): EquipmentRarity {
  const entries = (Object.entries(RARITY_WEIGHTS) as [EquipmentRarity, number][]).filter(
    ([rarity]) => !allowedRarities || allowedRarities.includes(rarity),
  );
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * totalWeight;

  for (const [rarity, weight] of entries) {
    if (roll < weight) {
      return rarity;
    }
    roll -= weight;
  }
  // Unreachable except for floating-point edge cases right at the top of
  // the range - falls back to the last-listed (allowed) rarity rather than
  // ever returning undefined.
  return entries[entries.length - 1][0];
}

let nextInstanceSequence = 0;

/**
 * Rolls one random equipment template - rarity-weighted first (see
 * rollRarity/RARITY_WEIGHTS), then a uniform pick among that rarity's own
 * templates - and returns a fresh, independently-instanced EquipmentItem.
 * Never hands back a template reference directly, the same "instance !=
 * template" split EnemyFactory/HeroFactory already follow. `allowedRarities`
 * restricts which rarities can be rolled at all (omit for the normal
 * unrestricted in-run loot table); see rollRarity's doc comment.
 */
export function generateRandomEquipment(allowedRarities?: EquipmentRarity[]): EquipmentItem {
  const rarity = rollRarity(allowedRarities);
  const candidates = equipmentTemplates.filter((template) => template.rarity === rarity);
  const template = candidates[Math.floor(Math.random() * candidates.length)];

  nextInstanceSequence += 1;
  return {
    instanceId: `${template.itemId}-${nextInstanceSequence}`,
    itemId: template.itemId,
    name: template.name,
    slot: template.slot,
    rarity: template.rarity,
    modifiers: template.modifiers,
    level: 1,
    currentExp: 0,
    baseExpValue: RARITY_BASE_EXP_VALUE[template.rarity],
    spriteUrl: equipmentSpriteSrc(template.itemId),
    glowColor: RARITY_GLOW_COLOR[template.rarity],
  };
}
