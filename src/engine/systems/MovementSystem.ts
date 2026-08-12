import { mapConfig } from '../../data/mapConfig';
import { enemyArchetypes } from '../../data/enemyArchetypes';
import { heroMovementConfig } from '../../data/heroConfig';
import { getTalentFlatBonus } from '../../data/talentConfig';
import { getAscensionShopFlatBonus } from '../../data/ascensionShopConfig';
import { retryCurrentWave } from './WaveSystem';
import { getDeployedHeroes } from './HeroStatsSystem';
import { distance, getEnemiesInRange, heroDefaultStrategy, pickBestTarget } from './TargetingSystem';
import type { GameState, Position } from '../types';

// Recomputed every tick from live HP (not a one-way "enraged" flag), so a
// Berserker healed back above the threshold (see EnemyAbilitySystem) visibly
// calms back down instead of staying sped up forever. Any future
// slow-granting effect (enemy.slowMultiplier - currently unused, nothing
// sets it) would stack on top multiplicatively.
function getEffectiveSpeed(enemy: GameState['enemies'][number]): number {
  const archetype = enemyArchetypes[enemy.archetypeId];
  const berserkerMultiplier =
    archetype.berserker && enemy.currentHp / enemy.maxHp <= archetype.berserker.hpRatioThreshold
      ? archetype.berserker.speedMultiplier
      : 1;
  return enemy.speed * berserkerMultiplier * enemy.slowMultiplier;
}

export function tickMovement(state: GameState, deltaSeconds: number): void {
  const { base } = state;
  const survivors: GameState['enemies'] = [];
  const damageReduction =
    getTalentFlatBonus(state.talentLevels, 'damageReduction') +
    getAscensionShopFlatBonus(state.ascensionShopLevels, 'damageReduction');

  for (const enemy of state.enemies) {
    if (enemy.slowRemaining > 0) {
      enemy.slowRemaining = Math.max(0, enemy.slowRemaining - deltaSeconds);
      if (enemy.slowRemaining === 0) {
        enemy.slowMultiplier = 1;
      }
    }

    const archetype = enemyArchetypes[enemy.archetypeId];
    const direction = enemy.position.x >= base.position.x ? -1 : 1;

    // Stationary archetypes (currently just Boss) close the distance until
    // they're within their own engage range, then hold - CombatSystem's
    // range checks are pure distance, not movement-state-dependent, so a
    // parked enemy is still fully attackable/attacking once in range. They
    // never reach baseArrivalDistance below, so they never damage the base.
    if (archetype.stationaryEngageDistance !== undefined) {
      if (Math.abs(enemy.position.x - base.position.x) > archetype.stationaryEngageDistance) {
        enemy.position.x += direction * getEffectiveSpeed(enemy) * deltaSeconds;
      }
      survivors.push(enemy);
      continue;
    }

    enemy.position.x += direction * getEffectiveSpeed(enemy) * deltaSeconds;

    const distanceToBase = Math.abs(enemy.position.x - base.position.x);
    if (distanceToBase <= mapConfig.baseArrivalDistance) {
      base.currentHp = Math.max(0, base.currentHp - enemy.damageToBase * (1 - damageReduction));
      if (base.currentHp <= 0) {
        // A failed wave retries the same chapter/wave rather than ending
        // the run - bail out immediately since retryCurrentWave already
        // reset state.enemies itself.
        retryCurrentWave(state);
        return;
      }
      continue;
    }

    survivors.push(enemy);
  }

  state.enemies = survivors;
}

// Moves position directly toward destination by at most maxStep, snapping
// exactly onto it once within arriveEpsilon instead of asymptotically
// crawling the last fraction of a pixel forever.
function moveToward(position: Position, destination: Position, maxStep: number): void {
  const dx = destination.x - position.x;
  const dy = destination.y - position.y;
  const remaining = Math.hypot(dx, dy);
  if (remaining <= heroMovementConfig.arriveEpsilon) {
    position.x = destination.x;
    position.y = destination.y;
    return;
  }
  const step = Math.min(maxStep, remaining);
  position.x += (dx / remaining) * step;
  position.y += (dy / remaining) * step;
}

// Heroes hold their deployed slot (homePosition) until an enemy wanders
// inside engageRange, walk out to meet it, hold once within attackRange
// (CombatSystem's own range check takes over from there - this never
// touches attackCooldownRemaining or deals damage itself), then drift back
// home once there's nothing left to fight. See heroMovementConfig's doc
// comment and HeroState.moveTargetEnemyInstanceId for the full contract.
export function tickHeroMovement(state: GameState, deltaSeconds: number): void {
  const { engageRange, moveSpeed } = heroMovementConfig;
  const maxStep = moveSpeed * deltaSeconds;

  for (const hero of getDeployedHeroes(state)) {
    let target =
      hero.moveTargetEnemyInstanceId !== null
        ? state.enemies.find((enemy) => enemy.instanceId === hero.moveTargetEnemyInstanceId)
        : undefined;

    // Dead (no longer in state.enemies) or wandered outside the leash from
    // home - either way, drop it and look for a fresh one below rather than
    // chasing indefinitely.
    if (target && distance(target.position, hero.homePosition) > engageRange) {
      target = undefined;
    }

    if (!target) {
      const candidates = getEnemiesInRange(state.enemies, hero.homePosition, engageRange);
      target =
        pickBestTarget(candidates, heroDefaultStrategy, { basePosition: state.base.position, originPosition: hero.homePosition }) ??
        undefined;
      hero.moveTargetEnemyInstanceId = target ? target.instanceId : null;
    }

    if (!target) {
      moveToward(hero.position, hero.homePosition, maxStep);
      continue;
    }

    // Already within attackRange - hold position and let CombatSystem fire;
    // re-checked every tick, so a target that walks further away is chased
    // again on a later tick without needing its own separate state.
    if (distance(hero.position, target.position) > hero.attackRange) {
      moveToward(hero.position, target.position, maxStep);
    }
  }
}
