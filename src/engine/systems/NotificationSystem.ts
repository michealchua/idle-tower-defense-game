import type { GameState } from '../types';

// Nav-tab red-dot logic - see GameState.seenSkillIds/seenPetIds/
// unseenEquipmentCount's doc comment for what's tracked and why. Talent
// points (state.skillPoints) and ascension-ready (state.canAscend) need no
// entry here - they're plain "is this actionable right now" reads the UI
// already has, not a seen/unseen distinction.

export function hasUnseenSkills(state: GameState): boolean {
  const hero = state.heroes[0];
  return !!hero && hero.ownedSkillIds.some((id) => !state.seenSkillIds.includes(id));
}

export function hasUnseenPets(state: GameState): boolean {
  return state.unlockedPetIds.some((id) => !state.seenPetIds.includes(id));
}

// Called when the player opens the Hero panel (see App.tsx's handleTabClick)
// - snapshots every currently-owned skill as seen, so the dot clears until
// the next genuinely new one arrives.
export function markSkillsSeen(state: GameState): void {
  const hero = state.heroes[0];
  if (hero) {
    state.seenSkillIds = [...hero.ownedSkillIds];
  }
}

export function markPetsSeen(state: GameState): void {
  state.seenPetIds = [...state.unlockedPetIds];
}

export function markEquipmentSeen(state: GameState): void {
  state.unseenEquipmentCount = 0;
}
