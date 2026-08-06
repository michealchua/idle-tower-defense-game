import { getBaseMaxHpForCastleLevel, getCastleUpgradeCost } from '../../data/castleConfig';
import { getCastleBuildMaterialsPerSecond, type CastleTypeId } from '../../data/castleTypeConfig';
import { recomputeHeroStats } from './HeroStatsSystem';
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
  if (state.buildMaterials < cost) {
    return false;
  }

  state.buildMaterials -= cost;
  state.castleLevel += 1;
  recomputeBaseMaxHp(state);
  // castleLevel also scales whichever castleType bonus is active (military
  // attack%/arcane crit both feed cached hero stats; economic/defense are
  // read live each tick, see tickCastleIncome/MovementSystem).
  recomputeHeroStats(state);
  return true;
}

// Free and instant - there's only one castleLevel progression, switching
// type just changes which single bonus it feeds (see castleTypeConfig.ts).
// A no-op (returns false) if the requested type is already active, so
// re-clicking the current type doesn't churn state/re-render for nothing.
export function setCastleType(state: GameState, castleType: CastleTypeId): boolean {
  if (state.castleType === castleType) {
    return false;
  }

  state.castleType = castleType;
  recomputeHeroStats(state);
  return true;
}

// Economic castle type's passive income - called every GameLoop tick,
// mirroring the old goldTower's per-tick accumulation (see git history for
// TowerSystem.tickTowerCombat's 'economy' branch), but crediting
// buildMaterials instead of gold now that the two economies are isolated
// (see resourceConfig.ts). A no-op for every other castleType since
// getCastleBuildMaterialsPerSecond returns 0 unless it's active.
export function tickCastleIncome(state: GameState, deltaSeconds: number): void {
  state.buildMaterials += getCastleBuildMaterialsPerSecond(state.castleType, state.castleLevel) * deltaSeconds;
}
