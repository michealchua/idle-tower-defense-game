import { createPet } from '../entities/Pet';
import { layoutPetPositions } from '../../data/mapConfig';
import { getMaxDeployedPets } from '../../data/castleConfig';
import { recomputeHeroStats } from './HeroStatsSystem';
import type { GameState } from '../types';

// Same idea as HeroSystem.relayoutDeployedHeroes - only the deployed subset
// gets a real combat/render position.
function relayoutDeployedPets(state: GameState): void {
  const positions = layoutPetPositions(state.deployedPetIds.length);
  state.deployedPetIds.forEach((petId, index) => {
    const pet = state.pets.find((candidate) => candidate.id === petId);
    if (pet) {
      pet.position = positions[index];
    }
  });
}

// Free primitive - acquisition (spending gold) now happens one level up, in
// GachaSystem.pullPet (or UnlockSystem.unlockPetByCondition for
// condition-locked pets). Debug tools call this directly too, which is
// exactly why it stays cost-free here.
//
// A newly unlocked pet auto-deploys if there's a free squad slot (its
// passive bonus only applies team-wide once deployed - see
// HeroStatsSystem.computePetPassiveBonuses); once the squad is full it joins
// the collection benched, and the player deploys it manually later.
export function unlockPet(state: GameState, petId: string): boolean {
  if (state.unlockedPetIds.includes(petId)) {
    return false;
  }

  state.unlockedPetIds.push(petId);
  state.pets.push(createPet(petId, { x: 0, y: 0 }));

  if (state.deployedPetIds.length < getMaxDeployedPets(state.castleLevel)) {
    state.deployedPetIds.push(petId);
    relayoutDeployedPets(state);
  }

  // Refreshes hero stats too (pet passive bonus changed) as well as this
  // pet's own attack stats.
  recomputeHeroStats(state);
  return true;
}

// Moves a benched pet into the active squad. Fails (no auto-swap) once the
// squad is full - undeploy someone first for a specific swap.
export function deployPet(state: GameState, petId: string): boolean {
  if (!state.unlockedPetIds.includes(petId) || state.deployedPetIds.includes(petId)) {
    return false;
  }
  if (state.deployedPetIds.length >= getMaxDeployedPets(state.castleLevel)) {
    return false;
  }

  state.deployedPetIds.push(petId);
  relayoutDeployedPets(state);
  recomputeHeroStats(state);
  return true;
}

export function undeployPet(state: GameState, petId: string): boolean {
  const index = state.deployedPetIds.indexOf(petId);
  if (index === -1) {
    return false;
  }

  state.deployedPetIds.splice(index, 1);
  relayoutDeployedPets(state);
  recomputeHeroStats(state);
  return true;
}

// See HeroSystem.swapDeployedHeroes - same reasoning, for pets.
export function swapDeployedPets(state: GameState, petIdA: string, petIdB: string): boolean {
  const indexA = state.deployedPetIds.indexOf(petIdA);
  const indexB = state.deployedPetIds.indexOf(petIdB);
  if (indexA === -1 || indexB === -1 || indexA === indexB) {
    return false;
  }

  state.deployedPetIds[indexA] = petIdB;
  state.deployedPetIds[indexB] = petIdA;
  relayoutDeployedPets(state);
  return true;
}
