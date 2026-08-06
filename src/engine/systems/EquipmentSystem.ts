import {
  equipmentDropConfig,
  equipmentRarities,
  getEquipmentStarUpCost,
  getReforgeCost,
  rollEquipment,
  rollSubstats,
} from '../../data/equipmentConfig';
import { MAX_STAR_LEVEL } from '../../data/gachaConfig';
import { recomputeHeroStats } from './HeroStatsSystem';
import type { EquipmentItem, GameState } from '../types';

function createEquipmentItem(state: GameState): EquipmentItem {
  const roll = rollEquipment();
  const item: EquipmentItem = { instanceId: state.nextEquipmentInstanceId, starLevel: 0, ...roll };
  state.nextEquipmentInstanceId += 1;
  return item;
}

// Chance-gated - the debug panel's "force drop" button bypasses this by
// calling createEquipmentItem via debugForceDropEquipment instead.
export function rollEquipmentDrop(state: GameState): EquipmentItem | null {
  if (Math.random() >= equipmentDropConfig.dropChance) {
    return null;
  }

  const item = createEquipmentItem(state);
  state.inventory.push(item);
  return item;
}

export function debugForceDropEquipment(state: GameState): EquipmentItem {
  const item = createEquipmentItem(state);
  state.inventory.push(item);
  return item;
}

// Equip/unequip are per-hero now - see HeroSystem.equipItemToHero/
// unequipHeroSlot. Sell/salvage/star-up/reforge stay here since they don't
// care which hero (if any) currently wears the item.
export function sellItem(state: GameState, instanceId: number): boolean {
  const index = state.inventory.findIndex((item) => item.instanceId === instanceId);
  if (index === -1) {
    return false;
  }

  const [item] = state.inventory.splice(index, 1);
  state.gold += equipmentRarities[item.rarity].sellValue;
  return true;
}

// Alternative disposal path to sellItem - breaks the item down into
// reforgeDust (see resourceConfig.ts's ledger) instead of gold. Inventory
// only, same as sellItem - unequip a piece first if you want to salvage it.
export function salvageEquipment(state: GameState, instanceId: number): boolean {
  const index = state.inventory.findIndex((item) => item.instanceId === instanceId);
  if (index === -1) {
    return false;
  }

  const [item] = state.inventory.splice(index, 1);
  state.reforgeDust += equipmentRarities[item.rarity].reforgeDustValue;
  return true;
}

function findItemByInstanceId(state: GameState, instanceId: number): EquipmentItem | undefined {
  const inInventory = state.inventory.find((item) => item.instanceId === instanceId);
  if (inInventory) {
    return inInventory;
  }
  for (const hero of state.heroes) {
    const equipped = Object.values(hero.equipment).find((item) => item?.instanceId === instanceId);
    if (equipped) {
      return equipped;
    }
  }
  return undefined;
}

// Works on both equipped (by any hero) and inventory items - star level is a
// property of the item instance, not of where it's currently stored.
export function starUpEquipment(state: GameState, instanceId: number): boolean {
  const item = findItemByInstanceId(state, instanceId);
  if (!item || item.starLevel >= MAX_STAR_LEVEL) {
    return false;
  }

  const cost = getEquipmentStarUpCost(item.rarity, item.starLevel);
  if (cost === undefined || state.gold < cost) {
    return false;
  }

  state.gold -= cost;
  state.goldSpentTotal += cost;
  item.starLevel += 1;

  // Cheap either way - simpler than checking whether this specific item is
  // currently equipped on some hero before deciding to recompute.
  recomputeHeroStats(state);
  return true;
}

// 洗练 (reforge) - re-rolls an item's substats (kind and value both) in
// place, leaving slot/rarity/main stat/set/legendary effect untouched. Works
// on both equipped and inventory items, same as starUpEquipment - reforging
// your currently-worn gear is the common case, not an edge case.
export function reforgeEquipment(state: GameState, instanceId: number): boolean {
  const item = findItemByInstanceId(state, instanceId);
  if (!item) {
    return false;
  }

  const cost = getReforgeCost(item.rarity);
  if (state.reforgeDust < cost) {
    return false;
  }

  state.reforgeDust -= cost;
  item.substats = rollSubstats(item.rarity, item.stat);

  recomputeHeroStats(state);
  return true;
}
