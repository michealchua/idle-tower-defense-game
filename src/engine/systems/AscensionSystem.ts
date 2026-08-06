import { getExpToNextLevel } from '../../data/heroConfig';
import { ascensionConfig } from '../../data/ascensionConfig';
import { diamondsPerAscend } from '../../data/diamondConfig';
import { getHeroDefinition } from '../../data/heroRosterConfig';
import { createInitialHeroUpgrades } from '../entities/Hero';
import { getStrongestHeroLevel, recomputeHeroStats } from './HeroStatsSystem';
import { createInitialWaveState, getGlobalWaveNumber } from './WaveSystem';
import type { GameState } from '../types';

// requiredWave is a global wave count (see WaveSystem.getGlobalWaveNumber),
// not chapter-relative - reaching it can (and by design, does) happen
// mid-fight against a boss wave, not only at a fresh chapter's wave 1.
export function canAscend(state: GameState): boolean {
  return getStrongestHeroLevel(state) >= ascensionConfig.unlockHeroLevel && getGlobalWaveNumber(state.wave) >= ascensionConfig.requiredWave;
}

// Resets the run (level/exp/per-hero upgrades/gold/stage progress) in
// exchange for ascensionPoints, spent in the ascension shop
// (ascensionShopConfig.ts/AscensionShopSystem.ts) for a permanent stat
// bonus - unlocked heroes/pets, the equipment inventory, castle level/type,
// the talent tree, and the ascension shop levels themselves are all
// collection/permanent progress and are deliberately left untouched.
export function ascend(state: GameState): boolean {
  if (!canAscend(state)) {
    return false;
  }

  state.ascensionLevel += 1;
  state.ascensionPoints += ascensionConfig.pointsPerAscend;
  state.diamonds += diamondsPerAscend;
  state.gold = 0;

  for (const hero of state.heroes) {
    hero.level = 1;
    hero.exp = 0;
    hero.expToNextLevel = getExpToNextLevel(1);
    hero.unlockedMilestoneIds = [];
    hero.unlockedSkillIds = [];
    hero.skills = {};
    hero.upgrades = createInitialHeroUpgrades();

    // evolutionBranchId itself is permanent (see its doc comment in
    // types.ts) - but it was granted its exclusive skill via
    // unlockedSkillIds, which the reset above just wiped. Re-add it
    // immediately rather than leaving an already-evolved hero's branch
    // skill locked behind re-leveling (its level-gated skillUnlocks are
    // fine relocking, that skill was never level-gated to begin with).
    if (hero.evolutionBranchId) {
      const branch = getHeroDefinition(hero.id).evolutionBranches.find((candidate) => candidate.id === hero.evolutionBranchId);
      if (branch) {
        hero.unlockedSkillIds.push(branch.skillUnlock.skillId);
      }
    }
  }

  state.wave = createInitialWaveState();
  state.enemies = [];
  state.base.currentHp = state.base.maxHp;
  state.spawnCooldownRemaining = 0;

  recomputeHeroStats(state);
  return true;
}
