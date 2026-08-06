import {
  equipmentDropConfig,
  equipmentRarities,
  getEquipmentStarUpCost,
  rollEquipment,
  type EquipmentSlot,
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

// Equipment is one shared loadout applied to every deployed hero (see
// HeroStatsSystem.computeEquipmentBonuses), so equip/unequip/sell just
// mutate inventory/equipped and let recomputeHeroStats derive every hero's
// stats fresh - no manual add/remove bonus or currentHp clamping here
// anymore.
export function equipItem(state: GameState, instanceId: number): boolean {
  const index = state.inventory.findIndex((item) => item.instanceId === instanceId);
  if (index === -1) {
    return false;
  }

  const [item] = state.inventory.splice(index, 1);
  const currentlyEquipped = state.equipped[item.slot];
  if (currentlyEquipped) {
    state.inventory.push(currentlyEquipped);
  }
  state.equipped[item.slot] = item;

  recomputeHeroStats(state);
  return true;
}

export function unequipSlot(state: GameState, slot: EquipmentSlot): boolean {
  const item = state.equipped[slot];
  if (!item) {
    return false;
  }

  state.equipped[slot] = null;
  state.inventory.push(item);

  recomputeHeroStats(state);
  return true;
}

export function sellItem(state: GameState, instanceId: number): boolean {
  const index = state.inventory.findIndex((item) => item.instanceId === instanceId);
  if (index === -1) {
    return false;
  }

  const [item] = state.inventory.splice(index, 1);
  state.gold += equipmentRarities[item.rarity].sellValue;
  return true;
}

function findItemByInstanceId(state: GameState, instanceId: number): EquipmentItem | undefined {
  return (
    state.inventory.find((item) => item.instanceId === instanceId) ??
    Object.values(state.equipped).find((item) => item?.instanceId === instanceId) ??
    undefined
  );
}

// Works on both equipped and inventory items - star level is a property of
// the item instance, not of where it's currently stored.
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

  if (state.equipped[item.slot]?.instanceId === instanceId) {
    recomputeHeroStats(state);
  }
  return true;
}
