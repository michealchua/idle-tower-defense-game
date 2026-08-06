import { createEnemy } from '../entities/Enemy';
import { getSpawnPacing } from '../../data/spawnConfig';
import { pickArchetypeForScore } from '../../data/enemySpawnTable';
import { getDifficultyScore } from './DifficultySystem';
import { mapConfig } from '../../data/mapConfig';
import type { EnemyArchetypeId } from '../../data/enemyArchetypes';
import type { GameState, Position } from '../types';

// The actual "create and add one enemy" primitive - tickSpawn wraps it with
// cooldown/cap/batch gating, debug tooling can call it directly to bypass
// all three. An explicit archetypeId (debug: "spawn a Tank") skips the
// weighted pick; omitting it (normal play) uses the difficulty-gated spawn
// table as usual. An explicit position (group spawns) skips the default
// spawnPosition so a batch can fan out instead of stacking on one point.
export function spawnEnemyNow(state: GameState, archetypeId?: EnemyArchetypeId, position?: Position): void {
  const difficultyScore = getDifficultyScore(state);
  const resolvedArchetypeId = archetypeId ?? pickArchetypeForScore(difficultyScore);

  const enemy = createEnemy(resolvedArchetypeId, difficultyScore, state.nextEnemyInstanceId);
  if (position) {
    enemy.position = position;
  }
  state.enemies.push(enemy);
  state.nextEnemyInstanceId += 1;
}

function randomIntInclusive(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// Vertical fan-out for a group spawn - every enemy in the batch keeps moving
// on its own row (MovementSystem only ever touches x), so a batch of 5-10
// reads as a spread-out wave crashing in rather than a single stack of
// overlapping circles.
const GROUP_SPAWN_ROW_SPACING = 30;

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

  const pacing = getSpawnPacing(getDifficultyScore(state));
  const availableSlots = pacing.maxConcurrentEnemies - state.enemies.length;

  if (availableSlots <= 0) {
    return;
  }

  const batchSize = Math.min(
    randomIntInclusive(pacing.spawnBatchSize.min, pacing.spawnBatchSize.max),
    availableSlots,
    wave.enemiesRemainingToSpawn,
  );

  for (let i = 0; i < batchSize; i += 1) {
    const rowOffset = (i - (batchSize - 1) / 2) * GROUP_SPAWN_ROW_SPACING;
    spawnEnemyNow(state, undefined, { x: mapConfig.spawnPosition.x, y: mapConfig.spawnPosition.y + rowOffset });
  }

  wave.enemiesRemainingToSpawn -= batchSize;
  state.spawnCooldownRemaining = pacing.spawnIntervalSeconds;
}
