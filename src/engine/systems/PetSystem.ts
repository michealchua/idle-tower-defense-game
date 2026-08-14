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

// Sets GameState.activePetId - the one pet drawing its auraEffect
// (PetAuraSystem.tickPetAura) and shown on the battlefield (see
// BattleScreen.tsx filtering `pets` down to just this id before handing them
// to CanvasRenderer.renderScene). Deploying a second pet swaps the first out
// automatically rather than requiring an explicit undeploy first - "at most
// one active" is enforced just by activePetId being a single id, not a set.
// Every owned pet (deployed or not) keeps contributing its passiveBonus
// regardless - see HeroStatsSystem.computePetPassiveBonuses, untouched by
// this.
export function deployPet(state: GameState, petId: string): boolean {
  if (!state.unlockedPetIds.includes(petId) || state.activePetId === petId) {
    return false;
  }
  state.activePetId = petId;
  // A differently-paced aura shouldn't inherit whatever countdown was mid-
  // flight for the previous pet (or none, for the first-ever deploy).
  state.petAuraCooldownRemaining = 0;
  const pet = state.pets.find((candidate) => candidate.id === petId);
  if (pet) {
    const [position] = layoutPetPositions(1);
    pet.position = position;
  }
  return true;
}

export function undeployPet(state: GameState): boolean {
  if (!state.activePetId) {
    return false;
  }
  state.activePetId = null;
  return true;
}
