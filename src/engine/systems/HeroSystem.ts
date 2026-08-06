import { createHero } from '../entities/Hero';
import { layoutHeroPositions } from '../../data/mapConfig';
import { getMaxDeployedHeroes } from '../../data/castleConfig';
import { recomputeHeroStats } from './HeroStatsSystem';
import type { GameState } from '../types';

// Repositions every currently-deployed hero across the row anchor so the
// active squad stays centered instead of growing lopsided as it changes
// size. Benched heroes keep whatever stale position they last had -
// harmless, since combat/skills/leveling/rendering all filter to
// deployedHeroIds and never read a benched hero's position.
function relayoutDeployedHeroes(state: GameState): void {
  const positions = layoutHeroPositions(state.deployedHeroIds.length);
  state.deployedHeroIds.forEach((heroId, index) => {
    const hero = state.heroes.find((candidate) => candidate.id === heroId);
    if (hero) {
      hero.position = positions[index];
    }
  });
}

// Free primitive - acquisition (spending gold) now happens one level up, in
// GachaSystem.pullHero (or UnlockSystem.unlockHeroByCondition for
// condition-locked heroes). Debug tools and the initial-state bootstrap call
// this directly too, which is exactly why it stays cost-free here.
//
// A newly unlocked hero auto-deploys if there's a free squad slot; once the
// squad is full it still joins the collection, just benched, and the player
// deploys it manually later (see deployHero).
export function unlockHero(state: GameState, heroId: string): boolean {
  if (state.unlockedHeroIds.includes(heroId)) {
    return false;
  }

  state.unlockedHeroIds.push(heroId);
  state.heroes.push(createHero(heroId, { x: 0, y: 0 }));

  if (state.deployedHeroIds.length < getMaxDeployedHeroes(state.castleLevel)) {
    state.deployedHeroIds.push(heroId);
    relayoutDeployedHeroes(state);
  }

  recomputeHeroStats(state);
  return true;
}

// Moves a benched hero into the active squad. Fails (no auto-swap) once the
// squad is full - the player undeploys someone first if they want a
// specific swap, rather than a deploy click silently benching whoever
// happened to be there.
export function deployHero(state: GameState, heroId: string): boolean {
  if (!state.unlockedHeroIds.includes(heroId) || state.deployedHeroIds.includes(heroId)) {
    return false;
  }
  if (state.deployedHeroIds.length >= getMaxDeployedHeroes(state.castleLevel)) {
    return false;
  }

  state.deployedHeroIds.push(heroId);
  relayoutDeployedHeroes(state);
  recomputeHeroStats(state);
  return true;
}

export function undeployHero(state: GameState, heroId: string): boolean {
  const index = state.deployedHeroIds.indexOf(heroId);
  if (index === -1) {
    return false;
  }

  state.deployedHeroIds.splice(index, 1);
  relayoutDeployedHeroes(state);
  recomputeHeroStats(state);
  return true;
}
