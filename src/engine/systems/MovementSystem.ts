import { mapConfig } from '../../data/mapConfig';
import { enemyArchetypes } from '../../data/enemyArchetypes';
import { getTalentFlatBonus } from '../../data/talentConfig';
import { retryCurrentWave } from './WaveSystem';
import type { GameState } from '../types';

// Recomputed every tick from live HP (not a one-way "enraged" flag), so a
// Berserker healed back above the threshold (see EnemyAbilitySystem) visibly
// calms back down instead of staying sped up forever. Frost tower slow (see
// TowerSystem.tickTowerCombat) stacks on top multiplicatively.
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
  const damageReduction = getTalentFlatBonus(state.talentLevels, 'damageReduction');

  for (const enemy of state.enemies) {
    if (enemy.slowRemaining > 0) {
      enemy.slowRemaining = Math.max(0, enemy.slowRemaining - deltaSeconds);
      if (enemy.slowRemaining === 0) {
        enemy.slowMultiplier = 1;
      }
    }

    const direction = enemy.position.x >= base.position.x ? -1 : 1;
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
