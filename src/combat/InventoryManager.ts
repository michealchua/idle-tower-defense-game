import type { EquipmentItem } from './Equipment';
import { generateRandomEquipment } from './equipmentCatalog';

/** Chance [0,1] that a defeated elite/boss enemy drops a random equipment item into the player's inventory - see rollLootFor. */
const ELITE_LOOT_DROP_CHANCE = 0.6;

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
    if (!isElite || Math.random() >= ELITE_LOOT_DROP_CHANCE) {
      return null;
    }
    const item = generateRandomEquipment();
    this.addItem(item);
    return item;
  }
}
