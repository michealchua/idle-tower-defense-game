import type { UpgradeableStat } from '../../data/heroConfig';
import { getHeroDefinition } from '../../data/heroRosterConfig';
import { getPetDefinition } from '../../data/petRosterConfig';
import type { UnlockCondition } from '../../data/unlockConditionConfig';
import { unlockHero } from './HeroSystem';
import { unlockPet } from './PetSystem';
import type { GameState } from '../types';

// Narrow, structural view of GameState - just enough to evaluate any
// UnlockCondition. The Zustand store snapshot (useGameStore.ts) exposes
// every one of these fields under the same names, so the UI can call
// getConditionStatuses directly on store state (no full GameState needed)
// to render a live unlock-progress checklist.
export interface UnlockConditionCheckState {
  unlockedHeroIds: string[];
  unlockedPetIds: string[];
  heroes: { id: string; level: number; upgrades: Record<UpgradeableStat, number> }[];
  goldSpentTotal: number;
  ascensionLevel: number;
}

export interface UnlockConditionStatus {
  condition: UnlockCondition;
  isMet: boolean;
}

function isConditionMet(state: UnlockConditionCheckState, condition: UnlockCondition): boolean {
  switch (condition.type) {
    case 'requiresHero':
      return state.unlockedHeroIds.includes(condition.heroId);
    case 'requiresPet':
      return state.unlockedPetIds.includes(condition.petId);
    case 'heroLevel': {
      const hero = state.heroes.find((candidate) => candidate.id === condition.heroId);
      return !!hero && hero.level >= condition.level;
    }
    case 'heroUpgradeLevel':
      return state.heroes.some((hero) => hero.upgrades[condition.stat] >= condition.level);
    case 'goldSpent':
      return state.goldSpentTotal >= condition.amount;
    case 'ascensionLevel':
      return state.ascensionLevel >= condition.level;
    default:
      return false;
  }
}

// Drives the condition-progress display in HeroPanel/PetPanel - every entry
// in the array, met or not, so the UI can render a full checklist.
export function getConditionStatuses(
  state: UnlockConditionCheckState,
  conditions: UnlockCondition[],
): UnlockConditionStatus[] {
  return conditions.map((condition) => ({ condition, isMet: isConditionMet(state, condition) }));
}

export function canUnlockHeroByCondition(state: GameState, heroId: string): boolean {
  if (state.unlockedHeroIds.includes(heroId)) {
    return false;
  }
  const conditions = getHeroDefinition(heroId).unlockConditions;
  return !!conditions && conditions.every((condition) => isConditionMet(state, condition));
}

export function unlockHeroByCondition(state: GameState, heroId: string): boolean {
  if (!canUnlockHeroByCondition(state, heroId)) {
    return false;
  }
  return unlockHero(state, heroId);
}

export function canUnlockPetByCondition(state: GameState, petId: string): boolean {
  if (state.unlockedPetIds.includes(petId)) {
    return false;
  }
  const conditions = getPetDefinition(petId).unlockConditions;
  return !!conditions && conditions.every((condition) => isConditionMet(state, condition));
}

export function unlockPetByCondition(state: GameState, petId: string): boolean {
  if (!canUnlockPetByCondition(state, petId)) {
    return false;
  }
  return unlockPet(state, petId);
}
