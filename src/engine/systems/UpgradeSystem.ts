import { heroUpgradeConfig, type UpgradeableStat } from '../../data/heroConfig';
import { computeScaledValue } from '../../data/scaling';
import { recomputeHeroStats } from './HeroStatsSystem';
import type { GameState } from '../types';

export function getUpgradeCost(stat: UpgradeableStat, level: number): number {
  const { baseCost, costGrowth } = heroUpgradeConfig[stat];
  return computeScaledValue(baseCost, costGrowth, level);
}

// maxValue caps how much this upgrade TRACK alone can contribute - checked
// against the raw upgrade-derived value, not any specific hero's effective
// stat, since different heroes have different template multipliers and
// there's no longer one canonical "the hero" to check against.
export function isUpgradeMaxed(state: GameState, stat: UpgradeableStat): boolean {
  const { maxValue, valuePerLevel } = heroUpgradeConfig[stat];
  if (maxValue === undefined) {
    return false;
  }
  return state.globalUpgrades[stat] * valuePerLevel >= maxValue;
}

export function applyUpgrade(state: GameState, stat: UpgradeableStat): boolean {
  if (state.isGameOver || isUpgradeMaxed(state, stat)) {
    return false;
  }

  const level = state.globalUpgrades[stat];
  const cost = getUpgradeCost(stat, level);

  if (state.gold < cost) {
    return false;
  }

  state.gold -= cost;
  state.goldSpentTotal += cost;
  state.globalUpgrades[stat] = level + 1;

  recomputeHeroStats(state);
  return true;
}
