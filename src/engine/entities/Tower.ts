import type { Position, TowerState } from '../types';

// attackDamage/attackSpeed/attackRange/goldPerSecond are seeded at 0 and
// immediately overwritten by TowerSystem.recomputeTowerStats - same contract
// as createHero/createPet, whose callers always recompute right after
// creation.
export function createTower(towerId: string, position: Position): TowerState {
  return {
    id: towerId,
    level: 1,
    position: { ...position },
    attackDamage: 0,
    attackSpeed: 0,
    attackRange: 0,
    attackCooldownRemaining: 0,
    goldPerSecond: 0,
  };
}
