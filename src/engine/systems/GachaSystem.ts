import { weightedPick } from '../../data/scaling';
import { gachaPullConfig, gachaRarityConfig, type GachaRarity } from '../../data/gachaConfig';
import { heroRosterConfig } from '../../data/heroRosterConfig';
import { petRosterConfig } from '../../data/petRosterConfig';
import { unlockHero } from './HeroSystem';
import { unlockPet } from './PetSystem';
import type { GameState } from '../types';

export interface GachaPullResult {
  id: string;
  rarity: GachaRarity;
  isNewUnlock: boolean;
}

// Rolls a rarity by pullWeight, then picks uniformly among roster entries of
// that rarity. Falls back to the whole (gacha-eligible) roster if that
// rarity happens to have zero entries yet - the starter roster is small
// enough that some tiers can briefly be empty.
function pickRosterEntryByRarity<T extends { id: string; rarity: GachaRarity; unlockConditions?: unknown }>(
  roster: T[],
): T {
  // Condition-locked entries (unlockConditions set) never come out of the
  // gacha pool - they're only obtainable via UnlockSystem.
  const gachaPool = roster.filter((entry) => !entry.unlockConditions);
  const rarity = weightedPick(
    (Object.keys(gachaRarityConfig) as GachaRarity[]).map((id) => ({ id, weight: gachaRarityConfig[id].pullWeight })),
  );
  const pool = gachaPool.filter((entry) => entry.rarity === rarity);
  const candidates = pool.length > 0 ? pool : gachaPool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function pullHero(state: GameState): GachaPullResult | null {
  if (state.gold < gachaPullConfig.pullCostGold) {
    return null;
  }
  state.gold -= gachaPullConfig.pullCostGold;
  state.goldSpentTotal += gachaPullConfig.pullCostGold;

  const definition = pickRosterEntryByRarity(heroRosterConfig);
  const isNewUnlock = unlockHero(state, definition.id);
  if (!isNewUnlock) {
    state.heroShards[definition.id] += gachaRarityConfig[definition.rarity].shardsPerDuplicate;
  }

  return { id: definition.id, rarity: definition.rarity, isNewUnlock };
}

export function pullPet(state: GameState): GachaPullResult | null {
  if (state.gold < gachaPullConfig.pullCostGold) {
    return null;
  }
  state.gold -= gachaPullConfig.pullCostGold;
  state.goldSpentTotal += gachaPullConfig.pullCostGold;

  const definition = pickRosterEntryByRarity(petRosterConfig);
  const isNewUnlock = unlockPet(state, definition.id);
  if (!isNewUnlock) {
    state.petShards[definition.id] += gachaRarityConfig[definition.rarity].shardsPerDuplicate;
  }

  return { id: definition.id, rarity: definition.rarity, isNewUnlock };
}

// Atomic - the whole batch's cost (pullCostGold * count) must be affordable
// upfront, so a 10/100-pull never stops partway through because gold ran
// out mid-batch. Each individual pull still goes through pullHero/pullPet
// so unlocks, shard grants, and goldSpentTotal all behave exactly like a
// single pull repeated count times.
function pullMulti(state: GameState, count: number, pullOne: (state: GameState) => GachaPullResult | null): GachaPullResult[] {
  const totalCost = gachaPullConfig.pullCostGold * count;
  if (state.gold < totalCost) {
    return [];
  }

  const results: GachaPullResult[] = [];
  for (let i = 0; i < count; i += 1) {
    const result = pullOne(state);
    if (result) {
      results.push(result);
    }
  }
  return results;
}

export function pullHeroMulti(state: GameState, count: number): GachaPullResult[] {
  return pullMulti(state, count, pullHero);
}

export function pullPetMulti(state: GameState, count: number): GachaPullResult[] {
  return pullMulti(state, count, pullPet);
}
