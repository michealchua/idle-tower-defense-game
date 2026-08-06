import { createEnemy } from '../entities/Enemy';
import { getSpawnPacing } from '../../data/spawnConfig';
import { pickArchetypeForScore } from '../../data/enemySpawnTable';
import { getDifficultyScore } from './DifficultySystem';
import { getStrongestHeroLevel } from './HeroStatsSystem';
import type { EnemyArchetypeId } from '../../data/enemyArchetypes';
import type { GameState } from '../types';

// The actual "create and add one enemy" primitive - tickSpawn wraps it with
// cooldown/cap gating, debug tooling can call it directly to bypass both.
// An explicit archetypeId (debug: "spawn a Tank") skips the weighted pick;
// omitting it (normal play) uses the difficulty-gated spawn table as usual.
export function spawnEnemyNow(state: GameState, archetypeId?: EnemyArchetypeId): void {
  const difficultyScore = getDifficultyScore(state);
  const resolvedArchetypeId = archetypeId ?? pickArchetypeForScore(difficultyScore);

  state.enemies.push(createEnemy(resolvedArchetypeId, difficultyScore, state.nextEnemyInstanceId));
  state.nextEnemyInstanceId += 1;
}

export function tickSpawn(state: GameState, deltaSeconds: number): void {
  state.spawnCooldownRemaining = Math.max(0, state.spawnCooldownRemaining - deltaSeconds);

  if (state.spawnCooldownRemaining > 0) {
    return;
  }

  const wave = state.wave;

  // Boss waves spawn exactly one enemy (the boss itself) instead of pulling
  // from the weighted table - bossSpawned guards against respawning it once
  // it's already down; WaveSystem resets the flag on retry/advance.
  if (wave.isBossWave) {
    if (wave.bossSpawned || !wave.bossKind) {
      return;
    }
    spawnEnemyNow(state, wave.bossKind);
    wave.bossSpawned = true;
    return;
  }

  // Normal wave's roster is exhausted - wait for the remaining enemies to
  // die so WaveSystem.tickWaveProgress can advance, don't spawn more.
  if (wave.enemiesRemainingToSpawn <= 0) {
    return;
  }

  const pacing = getSpawnPacing(getStrongestHeroLevel(state));

  if (state.enemies.length >= pacing.maxConcurrentEnemies) {
    return;
  }

  spawnEnemyNow(state);
  wave.enemiesRemainingToSpawn -= 1;
  state.spawnCooldownRemaining = pacing.spawnIntervalSeconds;
}
