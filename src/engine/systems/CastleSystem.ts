import { getBaseMaxHpForCastleLevel, getCastleUpgradeCost } from '../../data/castleConfig';
import type { GameState } from '../types';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

// The only place base.maxHp is derived from castle level - called at
// creation-equivalent time (nothing, since Base.ts already seeds level-1's
// value) and after every castle upgrade. Heals by the HP delta, same
// contract as HeroStatsSystem.recomputeHeroStats's maxHp handling.
function recomputeBaseMaxHp(state: GameState): void {
  const oldMaxHp = state.base.maxHp;
  const maxHp = getBaseMaxHpForCastleLevel(state.castleLevel);
  state.base.maxHp = maxHp;
  state.base.currentHp = clamp(state.base.currentHp + (maxHp - oldMaxHp), 1, maxHp);
}

export function upgradeCastle(state: GameState): boolean {
  const cost = getCastleUpgradeCost(state.castleLevel);
  if (state.gold < cost) {
    return false;
  }

  state.gold -= cost;
  state.goldSpentTotal += cost;
  state.castleLevel += 1;
  recomputeBaseMaxHp(state);
  return true;
}
