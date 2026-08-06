import {
  getAscensionShopCost,
  getAscensionShopLevel,
  isAscensionShopMaxed,
  type AscensionShopId,
} from '../../data/ascensionShopConfig';
import { recomputeHeroStats } from './HeroStatsSystem';
import type { GameState } from '../types';

export function upgradeAscensionShopNode(state: GameState, id: AscensionShopId): boolean {
  if (isAscensionShopMaxed(state.ascensionShopLevels, id)) {
    return false;
  }

  const cost = getAscensionShopCost(id, getAscensionShopLevel(state.ascensionShopLevels, id));
  if (state.ascensionPoints < cost) {
    return false;
  }

  state.ascensionPoints -= cost;
  state.ascensionShopLevels[id] = getAscensionShopLevel(state.ascensionShopLevels, id) + 1;

  // attackDamage/maxHp feed cached hero/pet stats; goldGain/expGain/
  // damageReduction/criticalChance are read live by DamageSystem/
  // MovementSystem/HeroStatsSystem each tick - recompute the cached stats so
  // the new bonus is live immediately.
  recomputeHeroStats(state);
  return true;
}
