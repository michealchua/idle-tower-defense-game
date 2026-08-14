import { createHero } from '../entities/Hero';
import { layoutSlotPositions } from '../../data/mapConfig';
import { getMaxDeployedHeroes } from '../../data/squadConfig';
import { equipmentSlots, getEquipmentScore, type EquipmentSlot } from '../../data/equipmentConfig';
import { heroEvolutionConfig, type HeroClass } from '../../data/heroConfig';
import { getHeroDefinition } from '../../data/heroRosterConfig';
import { recomputeHeroStats } from './HeroStatsSystem';
import { getGlobalWaveNumber } from './WaveSystem';
import type { GameState, HeroState } from '../types';

// Lowest-numbered cell (0..cap-1) not already claimed by another currently-
// deployed hero's deployedSlotIndex - used whenever a hero needs a slot
// assigned (fresh deploy/unlock) but hasn't picked a specific one via drag.
// null if every cell is taken (shouldn't happen: deployedHeroIds is capped
// at the same `cap` by deployHero/unlockHero below, so there's always at
// least one free cell whenever a new deploy is actually allowed to proceed).
function firstFreeSlotIndex(state: GameState, cap: number): number | null {
  const used = new Set(
    state.heroes
      .filter((hero) => state.deployedHeroIds.includes(hero.id))
      .map((hero) => hero.deployedSlotIndex),
  );
  for (let index = 0; index < cap; index += 1) {
    if (!used.has(index)) {
      return index;
    }
  }
  return null;
}

// Single-protagonist redesign: mapConfig.layoutSlotPositions() now always
// hands back exactly one position (mapConfig.heroPosition) since there's
// only ever one hero - no more per-hero deployedSlotIndex bookkeeping
// needed to figure out where it goes.
function relayoutDeployedHeroes(state: GameState): void {
  const [position] = layoutSlotPositions();

  for (const heroId of state.deployedHeroIds) {
    const hero = state.heroes.find((candidate) => candidate.id === heroId);
    if (!hero) {
      continue;
    }
    hero.deployedSlotIndex = 0;
    // Snaps both - a hero mid-walk when redeployed reappears at its slot
    // immediately rather than finishing its old walk first, same "no
    // interpolation, always authoritative" contract position already had
    // before movement existed.
    hero.position = { ...position };
    hero.homePosition = { ...position };
    hero.moveTargetEnemyInstanceId = null;
  }
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
  const hero = createHero(heroId, { x: 0, y: 0 });
  state.heroes.push(hero);

  const cap = getMaxDeployedHeroes(getGlobalWaveNumber(state.wave));
  if (state.deployedHeroIds.length < cap) {
    hero.deployedSlotIndex = firstFreeSlotIndex(state, cap);
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
  const cap = getMaxDeployedHeroes(getGlobalWaveNumber(state.wave));
  if (state.deployedHeroIds.length >= cap) {
    return false;
  }

  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (hero) {
    hero.deployedSlotIndex = firstFreeSlotIndex(state, cap);
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

  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (hero) {
    hero.deployedSlotIndex = null;
  }
  state.deployedHeroIds.splice(index, 1);
  relayoutDeployedHeroes(state);
  recomputeHeroStats(state);
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

const EQUIPMENT_SLOT_IDS = Object.keys(equipmentSlots) as EquipmentSlot[];

// One-click "give this hero the best gear available" - per slot, compares
// whatever's currently worn against every same-slot inventory item by
// getEquipmentScore and swaps in the highest-scoring one, exactly like
// equipItemToHero would if the player picked that item themselves. A slot
// whose currently-equipped item already scores highest (including an empty
// inventory) is left untouched.
export function equipStrongestForHero(state: GameState, heroId: string): boolean {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (!hero) {
    return false;
  }

  let changed = false;
  for (const slot of EQUIPMENT_SLOT_IDS) {
    const current = hero.equipment[slot];
    let best = current;
    let bestScore = current ? getEquipmentScore(current) : -Infinity;
    for (const item of state.inventory) {
      if (item.slot !== slot) {
        continue;
      }
      const score = getEquipmentScore(item);
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    }
    if (best && best !== current) {
      const index = state.inventory.findIndex((item) => item.instanceId === best!.instanceId);
      state.inventory.splice(index, 1);
      if (current) {
        state.inventory.push(current);
      }
      hero.equipment[slot] = best;
      changed = true;
    }
  }

  if (changed) {
    recomputeHeroStats(state);
  }
  return changed;
}

// Unequips every slot at once - same effect as calling unequipHeroSlot four
// times, just one recomputeHeroStats instead of four.
export function unequipAllForHero(state: GameState, heroId: string): boolean {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (!hero) {
    return false;
  }

  let changed = false;
  for (const slot of EQUIPMENT_SLOT_IDS) {
    const item = hero.equipment[slot];
    if (item) {
      hero.equipment[slot] = null;
      state.inventory.push(item);
      changed = true;
    }
  }

  if (changed) {
    recomputeHeroStats(state);
  }
  return changed;
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
  if (!hero.ownedSkillIds.includes(branch.skillUnlock.skillId)) {
    hero.ownedSkillIds.push(branch.skillUnlock.skillId);
  }

  recomputeHeroStats(state);
  return true;
}

// How many of hero.ownedSkillIds can be equipped (actually casting, see
// SkillSystem.tickHeroSkills) at once - deliberately small so picking a
// loadout is a real decision, not "equip everything you own".
export const MAX_EQUIPPED_SKILLS = 4;

// Moves a skill from "owned" into the smaller "equipped" (actually casts)
// set - unordered membership, not slot-indexed (see HeroState.
// equippedSkillIds's doc comment), so the UI just needs to show whichever
// owned skills are/aren't currently in that set.
export function equipSkill(state: GameState, heroId: string, skillId: string): boolean {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (!hero || !hero.ownedSkillIds.includes(skillId) || hero.equippedSkillIds.includes(skillId)) {
    return false;
  }
  if (hero.equippedSkillIds.length >= MAX_EQUIPPED_SKILLS) {
    return false;
  }
  hero.equippedSkillIds.push(skillId);
  return true;
}

export function unequipSkill(state: GameState, heroId: string, skillId: string): boolean {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (!hero) {
    return false;
  }
  const index = hero.equippedSkillIds.indexOf(skillId);
  if (index === -1) {
    return false;
  }
  hero.equippedSkillIds.splice(index, 1);
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
