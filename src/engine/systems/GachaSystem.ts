import { weightedPick } from '../../utils/scaling';
import { gachaPullConfig, gachaRarityConfig, type GachaRarity } from '../../data/gachaConfig';
import { diamondExchangeConfig, dailyLoginRewardConfig } from '../../data/diamondConfig';
import { gachaPityConfig, firstTenPullGuaranteeRarities, type PityPoolId } from '../../data/pityConfig';
import { incrementDailyQuestProgress } from './DailyQuestSystem';
import { panelUnlockWave } from '../../data/unlockConditionConfig';
import { heroRosterConfig } from '../../data/heroRosterConfig';
import { petRosterConfig } from '../../data/petRosterConfig';
import { unlockHero } from './HeroSystem';
import { unlockPet } from './PetSystem';
import { getGlobalWaveNumber } from './WaveSystem';
import type { GameState } from '../types';

export interface GachaPullResult {
  id: string;
  rarity: GachaRarity;
  isNewUnlock: boolean;
  // True when this pull's rarity was forced by pity rather than rolled
  // naturally - see resolveForcedRarities below.
  pityTriggered: boolean;
}

// Rolls a rarity by the given weight field (restricted to forcedRarities
// when pity kicks in), then picks uniformly among roster entries of that
// rarity. Falls back to the whole (gacha-eligible) roster if that rarity
// happens to have zero entries yet - every rarity tier has at least one
// roster entry today, but this keeps a future thin tier from ever returning
// undefined.
function pickRosterEntryByRarity<T extends { id: string; rarity: GachaRarity; unlockConditions?: unknown }>(
  roster: T[],
  weightField: 'pullWeight' | 'premiumPullWeight',
  forcedRarities?: GachaRarity[],
): T {
  // Condition-locked entries (unlockConditions set) never come out of the
  // gacha pool - they're only obtainable via UnlockSystem.
  const gachaPool = roster.filter((entry) => !entry.unlockConditions);
  const eligibleRarities = forcedRarities ?? (Object.keys(gachaRarityConfig) as GachaRarity[]);
  const rarity = weightedPick(eligibleRarities.map((id) => ({ id, weight: gachaRarityConfig[id][weightField] })));
  const pool = gachaPool.filter((entry) => entry.rarity === rarity);
  const candidates = pool.length > 0 ? pool : gachaPool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// About-to-be-the-Nth-pull check: if this pull would push the pool's
// pity counter to (or past) its guarantee without a natural hit, force the
// roll to only the pity-eligible rarities instead of the full table.
function resolveForcedRarities(state: GameState, pityPoolId: PityPoolId): GachaRarity[] | undefined {
  const rule = gachaPityConfig[pityPoolId];
  const pullsSincePity = state.pityCounters[pityPoolId];
  return pullsSincePity + 1 >= rule.pullsUntilGuarantee ? rule.rarities : undefined;
}

function pullOne<T extends { id: string; rarity: GachaRarity; unlockConditions?: unknown }>(
  state: GameState,
  roster: T[],
  weightField: 'pullWeight' | 'premiumPullWeight',
  shards: Record<string, number>,
  unlock: (state: GameState, id: string) => boolean,
  pityPoolId: PityPoolId,
  forcedRaritiesOverride?: GachaRarity[],
): GachaPullResult {
  const rule = gachaPityConfig[pityPoolId];
  const forcedRarities = forcedRaritiesOverride ?? resolveForcedRarities(state, pityPoolId);
  const definition = pickRosterEntryByRarity(roster, weightField, forcedRarities);

  state.pityCounters[pityPoolId] = rule.rarities.includes(definition.rarity) ? 0 : state.pityCounters[pityPoolId] + 1;
  incrementDailyQuestProgress(state, 'pullGacha');

  const isNewUnlock = unlock(state, definition.id);
  if (!isNewUnlock) {
    shards[definition.id] += gachaRarityConfig[definition.rarity].shardsPerDuplicate;
  }
  return { id: definition.id, rarity: definition.rarity, isNewUnlock, pityTriggered: forcedRarities !== undefined };
}

export function pullHero(state: GameState, forcedRarities?: GachaRarity[]): GachaPullResult | null {
  if (state.gold < gachaPullConfig.pullCostGold) {
    return null;
  }
  state.gold -= gachaPullConfig.pullCostGold;
  state.goldSpentTotal += gachaPullConfig.pullCostGold;
  return pullOne(state, heroRosterConfig, 'pullWeight', state.heroShards, unlockHero, 'heroGold', forcedRarities);
}

export function pullPet(state: GameState, forcedRarities?: GachaRarity[]): GachaPullResult | null {
  if (state.gold < gachaPullConfig.pullCostGold) {
    return null;
  }
  state.gold -= gachaPullConfig.pullCostGold;
  state.goldSpentTotal += gachaPullConfig.pullCostGold;
  return pullOne(state, petRosterConfig, 'pullWeight', state.petShards, unlockPet, 'petGold', forcedRarities);
}

// Same shape as pullHero/pullPet, spending diamonds at premiumPullWeight
// odds instead of gold at pullWeight odds - see gachaConfig.ts.
export function pullHeroPremium(state: GameState, forcedRarities?: GachaRarity[]): GachaPullResult | null {
  if (state.diamonds < gachaPullConfig.pullCostDiamonds) {
    return null;
  }
  state.diamonds -= gachaPullConfig.pullCostDiamonds;
  return pullOne(state, heroRosterConfig, 'premiumPullWeight', state.heroShards, unlockHero, 'heroPremium', forcedRarities);
}

export function pullPetPremium(state: GameState, forcedRarities?: GachaRarity[]): GachaPullResult | null {
  if (state.diamonds < gachaPullConfig.pullCostDiamonds) {
    return null;
  }
  state.diamonds -= gachaPullConfig.pullCostDiamonds;
  return pullOne(state, petRosterConfig, 'premiumPullWeight', state.petShards, unlockPet, 'petPremium', forcedRarities);
}

// Atomic - the whole batch's cost must be affordable upfront, so a 10/100-
// pull never stops partway through because the currency ran out mid-batch.
// Each individual pull still goes through pullOneOfKind so unlocks, shard
// grants, and (for gold pulls) goldSpentTotal all behave exactly like a
// single pull repeated count times.
function pullMulti(
  state: GameState,
  count: number,
  totalCost: number,
  currency: 'gold' | 'diamonds',
  pityPoolId: PityPoolId,
  pullOneOfKind: (state: GameState, forcedRarities?: GachaRarity[]) => GachaPullResult | null,
): GachaPullResult[] {
  if (state[currency] < totalCost) {
    return [];
  }

  // "新手绝对福利" - the player's very first ever 10-pull is guaranteed at
  // least one gold-or-better hit, but only on a premium (diamond) pool -
  // firstTenPullGuaranteeRarities has no entry for the gold-currency pools,
  // so guaranteeRarities is undefined there and this batch rolls with no
  // bonus at all, same as any other 10-pull. Only the first pull of the
  // batch gets the forced floor.
  const guaranteeRarities = count === 10 && !state.isFirstTenPullDone ? firstTenPullGuaranteeRarities[pityPoolId] : undefined;

  const results: GachaPullResult[] = [];
  for (let i = 0; i < count; i += 1) {
    const result = pullOneOfKind(state, i === 0 ? guaranteeRarities : undefined);
    if (result) {
      results.push(result);
    }
  }

  if (guaranteeRarities) {
    state.isFirstTenPullDone = true;
  }

  return results;
}

export function pullHeroMulti(state: GameState, count: number): GachaPullResult[] {
  return pullMulti(state, count, gachaPullConfig.pullCostGold * count, 'gold', 'heroGold', pullHero);
}

export function pullPetMulti(state: GameState, count: number): GachaPullResult[] {
  return pullMulti(state, count, gachaPullConfig.pullCostGold * count, 'gold', 'petGold', pullPet);
}

export function pullHeroPremiumMulti(state: GameState, count: number): GachaPullResult[] {
  return pullMulti(state, count, gachaPullConfig.pullCostDiamonds * count, 'diamonds', 'heroPremium', pullHeroPremium);
}

export function pullPetPremiumMulti(state: GameState, count: number): GachaPullResult[] {
  return pullMulti(state, count, gachaPullConfig.pullCostDiamonds * count, 'diamonds', 'petPremium', pullPetPremium);
}

// Called every GameLoop tick (see GameLoop.ts) - grants enough diamonds for
// exactly one free premium 10-pull the moment the run's global wave count
// reaches GachaPanel's own reveal gate (unlockConditionConfig.
// panelUnlockWave.gacha), so the "首次十连必出" promise above has something
// funded to trigger on. hasGrantedFirstGachaBonus makes this a one-shot -
// see its doc comment in engine/types.ts for why a second flag is needed
// alongside isFirstTenPullDone.
export function tickGachaWelcomeBonus(state: GameState): void {
  if (state.hasGrantedFirstGachaBonus) {
    return;
  }
  const requiredWave = panelUnlockWave.gacha;
  if (requiredWave === undefined || getGlobalWaveNumber(state.wave) < requiredWave) {
    return;
  }
  state.diamonds += gachaPullConfig.pullCostDiamonds * 10;
  state.hasGrantedFirstGachaBonus = true;
}

// Called every GameLoop tick, same shape as tickGachaWelcomeBonus above -
// grants dailyLoginRewardConfig.diamonds the first time this runs on a new
// calendar day (local time), stamping lastLoginDate so it won't fire again
// until the date changes. state.lastLoginDate starts null (see GameState.ts),
// which never equals a real date string, so the very first tick of a brand
// new game already counts as "today's first login" and grants immediately -
// no separate first-run special case needed. lastLoginDate is persisted via
// SaveSystem.ts, so this genuinely fires once per real calendar day across
// saved sessions, not once per page load.
export function tickDailyLoginReward(state: GameState): void {
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastLoginDate === today) {
    return;
  }
  state.diamonds += dailyLoginRewardConfig.diamonds;
  state.lastLoginDate = today;
}

// Fixed-chunk exchange (see diamondConfig.ts) - the "universal fallback" use
// for diamonds once premium pulls/breakthroughs aren't the priority.
export function exchangeDiamondsForGold(state: GameState): boolean {
  if (state.diamonds < diamondExchangeConfig.diamondsPerExchange) {
    return false;
  }
  state.diamonds -= diamondExchangeConfig.diamondsPerExchange;
  state.gold += diamondExchangeConfig.goldPerExchange;
  return true;
}
