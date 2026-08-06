import { createHero } from '../entities/Hero';
import { layoutHeroPositions } from '../../data/mapConfig';
import { getMaxDeployedHeroes } from '../../data/castleConfig';
import type { EquipmentSlot } from '../../data/equipmentConfig';
import { heroEvolutionConfig, type HeroClass } from '../../data/heroConfig';
import { getHeroDefinition } from '../../data/heroRosterConfig';
import { recomputeHeroStats } from './HeroStatsSystem';
import type { GameState, HeroState } from '../types';

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

// Swaps two deployed heroes' squad-order slots - since relayoutDeployedHeroes
// derives on-field position purely from index in deployedHeroIds, swapping
// the array entries is all it takes to swap their positions too. Used by the
// canvas drag-to-reposition gesture (BattleScreen), not squad membership -
// stats are unaffected, so no recomputeHeroStats needed.
export function swapDeployedHeroes(state: GameState, heroIdA: string, heroIdB: string): boolean {
  const indexA = state.deployedHeroIds.indexOf(heroIdA);
  const indexB = state.deployedHeroIds.indexOf(heroIdB);
  if (indexA === -1 || indexB === -1 || indexA === indexB) {
    return false;
  }

  state.deployedHeroIds[indexA] = heroIdB;
  state.deployedHeroIds[indexB] = heroIdA;
  relayoutDeployedHeroes(state);
  return true;
}

// Equipment is per-hero (see HeroState.equipment) - equipping pulls an item
// out of the shared inventory pool and into this specific hero's slot,
// bumping whatever was already there back into inventory. Star-up/sell/roll
// stay hero-agnostic and live in EquipmentSystem.ts; only the "which hero
// wears this" decision lives here alongside the rest of hero-state mutation.
export function equipItemToHero(state: GameState, heroId: string, instanceId: number): boolean {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (!hero) {
    return false;
  }

  const index = state.inventory.findIndex((item) => item.instanceId === instanceId);
  if (index === -1) {
    return false;
  }

  const [item] = state.inventory.splice(index, 1);
  const currentlyEquipped = hero.equipment[item.slot];
  if (currentlyEquipped) {
    state.inventory.push(currentlyEquipped);
  }
  hero.equipment[item.slot] = item;

  recomputeHeroStats(state);
  return true;
}

export function unequipHeroSlot(state: GameState, heroId: string, slot: EquipmentSlot): boolean {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (!hero) {
    return false;
  }

  const item = hero.equipment[slot];
  if (!item) {
    return false;
  }

  hero.equipment[slot] = null;
  state.inventory.push(item);

  recomputeHeroStats(state);
  return true;
}

// 分支进化 gate - level-only (no gold/material cost, same precedent as the
// existing visual-tier evolution), and one-shot: once a branch is chosen
// there's no re-picking, see evolveHero below.
export function canEvolveHero(hero: HeroState): boolean {
  return !hero.evolutionBranchId && hero.level >= heroEvolutionConfig.unlockLevel;
}

// Commits one of the hero's heroRosterConfig.evolutionBranches choices -
// permanent (never reset by AscensionSystem.ascend, see HeroState.
// evolutionBranchId's doc comment). Grants the branch's exclusive skill
// immediately (no separate level gate) and recomputes stats so the
// statMultiplier boost (HeroStatsSystem.getEffectiveStatMultiplier) takes
// effect the same tick.
export function evolveHero(state: GameState, heroId: string, branchId: string): boolean {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (!hero || !canEvolveHero(hero)) {
    return false;
  }

  const branch = getHeroDefinition(heroId).evolutionBranches.find((candidate) => candidate.id === branchId);
  if (!branch) {
    return false;
  }

  hero.evolutionBranchId = branchId;
  if (!hero.unlockedSkillIds.includes(branch.skillUnlock.skillId)) {
    hero.unlockedSkillIds.push(branch.skillUnlock.skillId);
  }

  recomputeHeroStats(state);
  return true;
}

// Base class until evolved, then whatever class the chosen branch results
// in (see HeroEvolutionBranch.resultClass) - drives HeroPanel's class
// icon/label so it visibly changes the moment a hero evolves.
export function getEffectiveHeroClass(hero: HeroState): HeroClass {
  const definition = getHeroDefinition(hero.id);
  if (!hero.evolutionBranchId) {
    return definition.class;
  }
  const branch = definition.evolutionBranches.find((candidate) => candidate.id === hero.evolutionBranchId);
  return branch?.resultClass ?? definition.class;
}
