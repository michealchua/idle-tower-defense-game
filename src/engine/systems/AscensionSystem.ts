import { getExpToNextLevel } from '../../data/heroConfig';
import { ascensionConfig } from '../../data/ascensionConfig';
import { diamondsPerAscend } from '../../data/diamondConfig';
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
// bonus - unlocked heroes/pets, the equipment inventory, the talent tree,
// and the ascension shop levels themselves are all collection/permanent
// progress and are deliberately left untouched.
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
    // ownedSkillIds is NOT reset here - permanent collection, same category
    // as heroShards (see HeroState.ownedSkillIds's doc comment). Only the
    // player-chosen equipped loadout resets, since level/stats reset too -
    // re-picking a loadout for the fresh run is the point, not losing the
    // skills themselves.
    hero.equippedSkillIds = [];
    hero.skills = {};
    hero.upgrades = createInitialHeroUpgrades();
    hero.isDowned = false;
  }

  state.wave = createInitialWaveState();
  state.enemies = [];
  state.spawnCooldownRemaining = 0;

  recomputeHeroStats(state);
  return true;
}
