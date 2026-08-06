import { enemyArchetypes, type SummonAbility } from '../../data/enemyArchetypes';
import { effectLifetimes } from '../../data/effectConfig';
import { distance } from './TargetingSystem';
import { spawnVisualEffect } from './EffectsSystem';
import { createEnemy } from '../entities/Enemy';
import { getDifficultyScore } from './DifficultySystem';
import type { EnemyState, GameState } from '../types';

function runHealAbility(state: GameState, enemy: EnemyState, radius: number, amount: number): void {
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
}

// Caps against this witch's own live summons (not a global minion count), so
// killing its minions lets it summon again before the cooldown otherwise
// would - see SummonAbility's doc comment in enemyArchetypes.ts.
function runSummonAbility(state: GameState, witch: EnemyState, ability: SummonAbility): void {
  const activeSummons = state.enemies.filter((other) => other.summonedByInstanceId === witch.instanceId).length;
  if (activeSummons >= ability.maxActiveSummons) {
    return;
  }

  const minion = createEnemy(ability.minionArchetypeId, getDifficultyScore(state), state.ascensionLevel, state.nextEnemyInstanceId);
  state.nextEnemyInstanceId += 1;
  minion.position = { ...witch.position };
  minion.summonedByInstanceId = witch.instanceId;
  state.enemies.push(minion);

  spawnVisualEffect(state, {
    kind: 'summon',
    x: witch.position.x,
    y: witch.position.y,
    lifetime: effectLifetimes.summon,
  });
}

// Only healAbility/summonAbility archetypes (Healer/Witch, today) do
// anything here - everything else just has abilityCooldownRemaining sitting
// at 0 forever, harmlessly.
export function tickEnemyAbilities(state: GameState, deltaSeconds: number): void {
  for (const enemy of state.enemies) {
    const archetype = enemyArchetypes[enemy.archetypeId];
    if (!archetype.healAbility && !archetype.summonAbility) {
      continue;
    }

    enemy.abilityCooldownRemaining = Math.max(0, enemy.abilityCooldownRemaining - deltaSeconds);
    if (enemy.abilityCooldownRemaining > 0) {
      continue;
    }

    if (archetype.healAbility) {
      runHealAbility(state, enemy, archetype.healAbility.radius, archetype.healAbility.amount);
      enemy.abilityCooldownRemaining = archetype.healAbility.intervalSeconds;
    } else if (archetype.summonAbility) {
      // Cooldown resets even when the summon cap blocked a spawn this tick -
      // it'll just re-check the (likely lower, since summons keep dying)
      // count next interval instead of retrying every tick.
      runSummonAbility(state, enemy, archetype.summonAbility);
      enemy.abilityCooldownRemaining = archetype.summonAbility.intervalSeconds;
    }
  }
}
