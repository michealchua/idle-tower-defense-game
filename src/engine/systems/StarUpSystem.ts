import { MAX_STAR_LEVEL, gachaRarityConfig, getStarUpCost, type GachaRarity, type StarUpStageCost } from '../../data/gachaConfig';
import { getHeroDefinition } from '../../data/heroRosterConfig';
import { getPetDefinition } from '../../data/petRosterConfig';
import { recomputeHeroStats } from './HeroStatsSystem';
import type { GameState } from '../types';

interface StarUpTarget {
  rarity: GachaRarity;
  shards: Record<string, number>;
  stars: Record<string, number>;
  id: string;
}

function tryStarUp(state: GameState, target: StarUpTarget): boolean {
  const currentStar = target.stars[target.id] ?? 0;
  if (currentStar >= MAX_STAR_LEVEL) {
    return false;
  }

  const cost = getStarUpCost(target.rarity, currentStar);
  if (!cost) {
    return false;
  }

  const shardsAvailable = target.shards[target.id] ?? 0;
  if (shardsAvailable < cost.shards || state.gold < cost.gold) {
    return false;
  }

  if (cost.material !== undefined && cost.material > 0) {
    const materialKey = gachaRarityConfig[target.rarity].breakthroughMaterial;
    if (!materialKey || state[materialKey] < cost.material) {
      return false;
    }
    state[materialKey] -= cost.material;
  }

  target.shards[target.id] = shardsAvailable - cost.shards;
  state.gold -= cost.gold;
  state.goldSpentTotal += cost.gold;
  target.stars[target.id] = currentStar + 1;
  return true;
}

export function starUpHero(state: GameState, heroId: string): boolean {
  const definition = getHeroDefinition(heroId);
  const didStarUp = tryStarUp(state, {
    rarity: definition.rarity,
    shards: state.heroShards,
    stars: state.heroStars,
    id: heroId,
  });
  if (didStarUp) {
    recomputeHeroStats(state);
  }
  return didStarUp;
}

export function starUpPet(state: GameState, petId: string): boolean {
  const definition = getPetDefinition(petId);
  const didStarUp = tryStarUp(state, {
    rarity: definition.rarity,
    shards: state.petShards,
    stars: state.petStars,
    id: petId,
  });
  if (didStarUp) {
    recomputeHeroStats(state);
  }
  return didStarUp;
}

export interface StarUpPreview {
  currentStar: number;
  rarity: GachaRarity;
  // undefined once currentStar >= MAX_STAR_LEVEL - already maxed.
  nextCost?: StarUpStageCost;
}

export function getHeroStarUpPreview(state: GameState, heroId: string): StarUpPreview {
  const definition = getHeroDefinition(heroId);
  const currentStar = state.heroStars[heroId] ?? 0;
  return { currentStar, rarity: definition.rarity, nextCost: getStarUpCost(definition.rarity, currentStar) };
}

export function getPetStarUpPreview(state: GameState, petId: string): StarUpPreview {
  const definition = getPetDefinition(petId);
  const currentStar = state.petStars[petId] ?? 0;
  return { currentStar, rarity: definition.rarity, nextCost: getStarUpCost(definition.rarity, currentStar) };
}
