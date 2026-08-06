import { getExpToNextLevel } from '../../data/heroConfig';
import { ascensionConfig } from '../../data/ascensionConfig';
import { diamondsPerAscend } from '../../data/diamondConfig';
import { createInitialHeroUpgrades } from '../entities/Hero';
import { getStrongestHeroLevel, recomputeHeroStats } from './HeroStatsSystem';
import { createInitialWaveState } from './WaveSystem';
import type { GameState } from '../types';

// Reaching requiredChapter means the run has already beaten
// (requiredChapter - 1)'s wave 10 boss and advanced into requiredChapter's
// wave 1 - see WaveSystem.advanceToNextWave, which is what bumps
// wave.chapter.
export function canAscend(state: GameState): boolean {
  return getStrongestHeroLevel(state) >= ascensionConfig.unlockHeroLevel && state.wave.chapter >= ascensionConfig.requiredChapter;
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
  }

  state.wave = createInitialWaveState();
  state.enemies = [];
  state.base.currentHp = state.base.maxHp;
  state.spawnCooldownRemaining = 0;

  recomputeHeroStats(state);
  return true;
}
