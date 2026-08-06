import { getExpToNextLevel, type UpgradeableStat } from '../../data/heroConfig';
import { ascensionConfig } from '../../data/ascensionConfig';
import { getStrongestHeroLevel, recomputeHeroStats } from './HeroStatsSystem';
import { recomputeTowerStats } from './TowerSystem';
import type { GameState } from '../types';

export function canAscend(state: GameState): boolean {
  return getStrongestHeroLevel(state) >= ascensionConfig.unlockHeroLevel;
}

// Resets the run (level/exp/global upgrades/gold) in exchange for a
// permanent stat multiplier - unlocked heroes/pets, the equipment inventory,
// castle level, built towers, and the talent tree are all collection/
// structure progress and are deliberately left untouched.
export function ascend(state: GameState): boolean {
  if (!canAscend(state)) {
    return false;
  }

  state.ascensionLevel += 1;
  state.gold = 0;

  for (const stat of Object.keys(state.globalUpgrades) as UpgradeableStat[]) {
    state.globalUpgrades[stat] = 0;
  }

  for (const hero of state.heroes) {
    hero.level = 1;
    hero.exp = 0;
    hero.expToNextLevel = getExpToNextLevel(1);
    hero.unlockedMilestoneIds = [];
    hero.skills = {};
  }

  recomputeHeroStats(state);
  recomputeTowerStats(state);
  return true;
}
