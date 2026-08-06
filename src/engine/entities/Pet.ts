import type { PetState, Position } from '../types';

// attackDamage/attackSpeed/attackRange are seeded at 0 and immediately
// overwritten by HeroStatsSystem.recomputePetStats - same contract as
// createHero, whose caller always recomputes right after creation.
export function createPet(petId: string, position: Position): PetState {
  return {
    id: petId,
    position: { ...position },
    attackDamage: 0,
    attackSpeed: 0,
    attackRange: 0,
    attackCooldownRemaining: 0,
  };
}
