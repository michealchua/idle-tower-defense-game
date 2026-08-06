import { heroUpgradeConfig, type UpgradeableStat } from '../../data/heroConfig';
import { computeScaledValue } from '../../data/scaling';
import { recomputeHeroStats } from './HeroStatsSystem';
import type { GameState, HeroState } from '../types';

export function getUpgradeCost(stat: UpgradeableStat, level: number): number {
  const { baseCost, costGrowth } = heroUpgradeConfig[stat];
  return computeScaledValue(baseCost, costGrowth, level);
}

// maxValue caps how much this hero's OWN upgrade track can contribute -
// checked against the raw upgrade-derived value, not the hero's full
// effective stat (which also includes level/equipment/pet bonuses).
export function isHeroUpgradeMaxed(hero: HeroState, stat: UpgradeableStat): boolean {
  const { maxValue, valuePerLevel } = heroUpgradeConfig[stat];
  if (maxValue === undefined) {
    return false;
  }
  return hero.upgrades[stat] * valuePerLevel >= maxValue;
}

// Previews a bulk buy (the +1/+10/+100 buttons in HeroPanel) without
// spending anything - `levels` is how many of `count` are actually
// purchasable before hitting maxValue, `cost` is the gold for just those
// levels. A plain loop is fine here: count never exceeds 100.
export function previewHeroUpgradeBulk(
  hero: HeroState,
  stat: UpgradeableStat,
  count: number,
): { cost: number; levels: number } {
  const { maxValue, valuePerLevel } = heroUpgradeConfig[stat];
  let level = hero.upgrades[stat];
  let cost = 0;
  let levels = 0;

  for (let i = 0; i < count; i += 1) {
    if (maxValue !== undefined && level * valuePerLevel >= maxValue) {
      break;
    }
    cost += getUpgradeCost(stat, level);
    level += 1;
    levels += 1;
  }

  return { cost, levels };
}

// Buys up to `count` levels for one hero's one stat, stopping early at
// maxValue or whenever gold runs out - so a "+100" click on a near-maxed or
// under-funded stat still buys whatever it can instead of buying nothing.
export function applyHeroUpgrade(state: GameState, heroId: string, stat: UpgradeableStat, count: number): boolean {
  if (state.isGameOver) {
    return false;
  }

  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (!hero) {
    return false;
  }

  const { maxValue, valuePerLevel } = heroUpgradeConfig[stat];
  let purchased = 0;

  for (let i = 0; i < count; i += 1) {
    if (maxValue !== undefined && hero.upgrades[stat] * valuePerLevel >= maxValue) {
      break;
    }
    const cost = getUpgradeCost(stat, hero.upgrades[stat]);
    if (state.gold < cost) {
      break;
    }
    state.gold -= cost;
    state.goldSpentTotal += cost;
    hero.upgrades[stat] += 1;
    purchased += 1;
  }

  if (purchased === 0) {
    return false;
  }

  recomputeHeroStats(state);
  return true;
}
