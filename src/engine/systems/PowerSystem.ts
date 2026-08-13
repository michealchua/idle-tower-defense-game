import { enemyScalingConfig, getScalingMultiplier } from '../../data/enemyScalingConfig';
import { heroBaseConfig } from '../../data/heroConfig';
import { baselineSquadSize } from '../../data/squadConfig';
import { getDeployedHeroes } from './HeroStatsSystem';
import { getGlobalWaveNumber } from './WaveSystem';
import type { GameState, HeroState, WaveState } from '../types';

// Single comparable "how strong is this hero" number (战力) - same
// "one number a player judges strength by at a glance" role
// equipmentConfig.getEquipmentScore fills for gear. attackDamage*attackSpeed
// *(1+critChance) approximates sustained DPS; maxHp is weighted in
// separately so a glass cannon and a tank with equal DPS don't read as
// equally strong. The x10/x0.5 weights aren't derived from any other
// formula - they're tuned so a fresh level-1 hero (heroBaseConfig: 10 atk,
// 1 atk/s, 5% crit, 100 hp) lands on a round ~155.
export function getHeroPower(hero: HeroState): number {
  const dps = hero.attackDamage * hero.attackSpeed * (1 + hero.criticalChance);
  return Math.round(dps * 10 + hero.maxHp * 0.5);
}

// Deployed only (benched heroes don't fight) - same squad this game already
// renders/combats with, see HeroStatsSystem.getDeployedHeroes.
export function getTeamPower(state: GameState): number {
  return getDeployedHeroes(state).reduce((sum, hero) => sum + getHeroPower(hero), 0);
}

// A full starting squad (squadConfig.baselineSquadSize) of fresh level-1
// heroes, in getHeroPower's units - the "you're expected to have this much
// power by stage 1" baseline every other stage's recommendation scales off.
function getBaselineSquadPower(): number {
  const dps = heroBaseConfig.attackDamage * heroBaseConfig.attackSpeed * (1 + heroBaseConfig.criticalChance);
  const baselineHeroPower = dps * 10 + heroBaseConfig.maxHp * 0.5;
  return baselineHeroPower * baselineSquadSize;
}

// Recommended team power for a given stage - deliberately stage-only (not
// DifficultySystem.getDifficultyScore's full score, which also factors in
// the player's own current hero level/upgrades), so this reads as "how
// strong should I be for THIS stage" rather than drifting as the player
// levels up. Reuses the exact multiplier curve enemies themselves scale by
// (enemyScalingConfig.getScalingMultiplier) so the recommendation and actual
// enemy toughness always move in lockstep.
export function getRecommendedPowerForStage(wave: WaveState): number {
  const stageIndex = getGlobalWaveNumber(wave);
  const stageScore = stageIndex * enemyScalingConfig.stage.weight;
  return Math.round(getBaselineSquadPower() * getScalingMultiplier(stageScore));
}
