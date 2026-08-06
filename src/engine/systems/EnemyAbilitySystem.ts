import { enemyArchetypes } from '../../data/enemyArchetypes';
import { effectLifetimes } from '../../data/effectConfig';
import { distance } from './TargetingSystem';
import { spawnVisualEffect } from './EffectsSystem';
import type { GameState } from '../types';

// Only healAbility archetypes (Healer, today) do anything here - everything
// else just has abilityCooldownRemaining sitting at 0 forever, harmlessly.
export function tickEnemyAbilities(state: GameState, deltaSeconds: number): void {
  for (const enemy of state.enemies) {
    const archetype = enemyArchetypes[enemy.archetypeId];
    if (!archetype.healAbility) {
      continue;
    }

    enemy.abilityCooldownRemaining = Math.max(0, enemy.abilityCooldownRemaining - deltaSeconds);
    if (enemy.abilityCooldownRemaining > 0) {
      continue;
    }

    const { radius, amount, intervalSeconds } = archetype.healAbility;
    const targets = state.enemies.filter(
      (other) => other.instanceId !== enemy.instanceId && distance(other.position, enemy.position) <= radius,
    );

    for (const target of targets) {
      target.currentHp = Math.min(target.maxHp, target.currentHp + amount);
    }

    if (targets.length > 0) {
      spawnVisualEffect(state, {
        kind: 'healPulse',
        x: enemy.position.x,
        y: enemy.position.y,
        radius,
        lifetime: effectLifetimes.healPulse,
      });
    }

    enemy.abilityCooldownRemaining = intervalSeconds;
  }
}
