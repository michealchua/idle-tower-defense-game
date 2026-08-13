import { mapConfig } from '../../data/mapConfig';
import { enemyArchetypes } from '../../data/enemyArchetypes';
import { heroMovementConfig } from '../../data/heroConfig';
import { getAliveDeployedHeroes } from './HeroStatsSystem';
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

// No base-HP mechanic anymore (see BaseState's doc comment) - every
// archetype now just closes in on base.position and holds once within
// mapConfig.baseArrivalDistance of it, the same "close in then hold" shape
// stationary archetypes (currently just Boss) already used for their own
// (typically larger) stationaryEngageDistance. An enemy that reaches the
// line no longer damages/despawns anything; it just parks there, still
// fully attackable/attacking via CombatSystem's ordinary range checks, until
// the squad kills it or the wave resets.
export function tickMovement(state: GameState, deltaSeconds: number): void {
  const { base } = state;

  for (const enemy of state.enemies) {
    if (enemy.slowRemaining > 0) {
      enemy.slowRemaining = Math.max(0, enemy.slowRemaining - deltaSeconds);
      if (enemy.slowRemaining === 0) {
        enemy.slowMultiplier = 1;
      }
    }

    const archetype = enemyArchetypes[enemy.archetypeId];
    const holdDistance = archetype.stationaryEngageDistance ?? mapConfig.baseArrivalDistance;
    const direction = enemy.position.x >= base.position.x ? -1 : 1;

    if (Math.abs(enemy.position.x - base.position.x) > holdDistance) {
      enemy.position.x += direction * getEffectiveSpeed(enemy) * deltaSeconds;
    }
  }
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

  for (const hero of getAliveDeployedHeroes(state)) {
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
