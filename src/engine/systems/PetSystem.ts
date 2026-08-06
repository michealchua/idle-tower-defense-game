import { createPet } from '../entities/Pet';
import { layoutPetPositions } from '../../data/mapConfig';
import { recomputeHeroStats } from './HeroStatsSystem';
import type { GameState } from '../types';

// Every owned pet renders and contributes its passive bonus - no
// deployed/benched split for pets (see HeroStatsSystem.computePetPassiveBonuses),
// so the whole collection gets laid out here instead of just a subset.
function relayoutPets(state: GameState): void {
  const positions = layoutPetPositions(state.pets.length);
  state.pets.forEach((pet, index) => {
    pet.position = positions[index];
  });
}

// Free primitive - acquisition (spending gold) happens one level up, in
// GachaSystem.pullPet (or UnlockSystem.unlockPetByCondition for
// condition-locked pets). Debug tools call this directly too, which is
// exactly why it stays cost-free here.
export function unlockPet(state: GameState, petId: string): boolean {
  if (state.unlockedPetIds.includes(petId)) {
    return false;
  }

  state.unlockedPetIds.push(petId);
  state.pets.push(createPet(petId, { x: 0, y: 0 }));
  relayoutPets(state);

  // Refreshes hero stats too (pet passive bonus changed) as well as this
  // pet's own attack stats.
  recomputeHeroStats(state);
  return true;
}
