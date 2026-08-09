import { RARITY_MAX_LEVEL, applyEnhancementExp, type EquipmentItem } from './Equipment';
import { generateRandomEquipment } from './equipmentCatalog';
import { getActiveBiomeMechanics } from './activeBiome';
import { talentManager } from './TalentManager';

/** Chance [0,1] that a defeated elite/boss enemy drops a random equipment item into the player's inventory - see rollLootFor. */
const ELITE_LOOT_DROP_CHANCE = 0.6;

export type EnhanceEquipmentResult =
  | { success: true; item: EquipmentItem; expGained: number; levelsGained: number }
  | { success: false; reason: 'unknown_target' | 'target_is_food' | 'unknown_food_item' | 'no_food_items' | 'already_max_level' };

/**
 * Global, run-scoped player inventory of unequipped EquipmentItems - owned
 * by GameManager, one instance per run (same lifecycle as CombatEngine/
 * WaveManager). Equipping an item moves it conceptually onto a BattleHero
 * (via BattleHero.equipItem) rather than being tracked here - GameManager.
 * tryEquipItem/tryUnequipItem are what keep this manager and a hero's own
 * equipment slots in sync (removing from the bag on equip, returning
 * whatever was previously worn back into it).
 */
export class InventoryManager {
  private readonly items = new Map<string, EquipmentItem>();

  getItems(): EquipmentItem[] {
    return [...this.items.values()];
  }

  getItem(instanceId: string): EquipmentItem | undefined {
    return this.items.get(instanceId);
  }

  addItem(item: EquipmentItem): void {
    this.items.set(item.instanceId, item);
  }

  /** True if `instanceId` actually named something in the bag (and it's now removed) - false for an unknown id, so callers can tell "nothing to remove" apart from a real removal. */
  removeItem(instanceId: string): boolean {
    return this.items.delete(instanceId);
  }

  /**
   * Rolls ELITE_LOOT_DROP_CHANCE against a defeated enemy being elite
   * (BattleEnemy.isElite - true for boss_demon, see EnemyFactory) and, on
   * success, generates one random equipment item, adds it straight into
   * the bag, and returns it. Returns null on a non-elite kill or a whiffed
   * roll, so GameManager only fires its loot-drop notification when a drop
   * actually happened.
   */
  rollLootFor(isElite: boolean): EquipmentItem | null {
    if (!isElite) {
      return null;
    }
    // Ancient Ruins' +20% loot-drop-chance biome buff (step 22) applied
    // first, then step 23's Loot Luck talent stacked additively on top -
    // the two are independent bonus sources (one per-run/environmental, one
    // permanent/meta), so they add rather than one overriding the other.
    const biomeChance = getActiveBiomeMechanics()?.modifyLootChance?.(ELITE_LOOT_DROP_CHANCE) ?? ELITE_LOOT_DROP_CHANCE;
    const dropChance = Math.min(1, biomeChance + talentManager.getLootChanceBonus());
    if (Math.random() >= dropChance) {
      return null;
    }
    const item = generateRandomEquipment();
    this.addItem(item);
    return item;
  }

  /**
   * Consumes `foodItemIds` as fodder to level up `targetId` - both must
   * currently be sitting in this bag (an equipped target goes through
   * GameManager.tryEnhanceEquipment instead, which resolves it from a
   * hero's equipment slot and only delegates back here for the bag-only
   * case). Sums every food item's baseExpValue, applies it to the target
   * via the shared applyEnhancementExp (same math an equipped target's
   * enhancement uses), then deletes every food item from the bag
   * outright - fodder is destroyed, not returned, on both success and
   * (deliberately - see below) a would-be-partial validation failure.
   *
   * Every food item id is validated *before* anything is mutated or
   * removed, so a bad id anywhere in the list fails the whole call
   * atomically rather than partially consuming some items and not others.
   */
  enhanceEquipment(targetId: string, foodItemIds: string[]): EnhanceEquipmentResult {
    const target = this.items.get(targetId);
    if (!target) {
      return { success: false, reason: 'unknown_target' };
    }
    if (foodItemIds.length === 0) {
      return { success: false, reason: 'no_food_items' };
    }
    if (foodItemIds.includes(targetId)) {
      return { success: false, reason: 'target_is_food' };
    }
    if (target.level >= RARITY_MAX_LEVEL[target.rarity]) {
      return { success: false, reason: 'already_max_level' };
    }

    const foodItems: EquipmentItem[] = [];
    for (const foodItemId of foodItemIds) {
      const foodItem = this.items.get(foodItemId);
      if (!foodItem) {
        return { success: false, reason: 'unknown_food_item' };
      }
      foodItems.push(foodItem);
    }

    const totalExp = foodItems.reduce((sum, item) => sum + item.baseExpValue, 0);
    const levelsGained = applyEnhancementExp(target, totalExp);

    for (const foodItemId of foodItemIds) {
      this.items.delete(foodItemId);
    }

    return { success: true, item: target, expGained: totalExp, levelsGained };
  }
}
