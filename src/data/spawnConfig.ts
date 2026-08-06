export interface SpawnPacingTier {
  minDifficultyScore: number;
  spawnIntervalSeconds: number;
  maxConcurrentEnemies: number;
  // How many enemies spawn together at once each time the cooldown fires -
  // {1,1} early on keeps the field sparse (see enemyConfig.ts's "1-2 hits
  // per enemy" comment), escalating to genuine group spawns later so late
  // game reads as a wave crashing in rather than the same trickle sped up.
  spawnBatchSize: { min: number; max: number };
}

// Keyed off difficultyScore (DifficultySystem.getDifficultyScore) rather
// than hero level - level resets on ascension (see AscensionSystem.ascend)
// but a player re-clearing familiar early chapters shouldn't fall back to a
// one-at-a-time trickle, and difficultyScore keeps climbing with stage
// regardless. Thresholds are deliberately small next to
// enemyScalingConfig.curve's phase anchors (22.5/60/105, chapters ~15/40/70)
// - group spawns are meant to ramp up well before the HP/reward curve's own
// escalation kicks in, same early-unlock spirit as enemySpawnTable's
// minDifficultyScore values (0.3-1.2).
export const spawnPacingTiers: SpawnPacingTier[] = [
  { minDifficultyScore: 0, spawnIntervalSeconds: 4, maxConcurrentEnemies: 2, spawnBatchSize: { min: 1, max: 1 } },
  { minDifficultyScore: 3, spawnIntervalSeconds: 3, maxConcurrentEnemies: 6, spawnBatchSize: { min: 1, max: 2 } },
  { minDifficultyScore: 8, spawnIntervalSeconds: 2.5, maxConcurrentEnemies: 10, spawnBatchSize: { min: 2, max: 3 } },
  { minDifficultyScore: 20, spawnIntervalSeconds: 2, maxConcurrentEnemies: 14, spawnBatchSize: { min: 3, max: 5 } },
  { minDifficultyScore: 45, spawnIntervalSeconds: 1.5, maxConcurrentEnemies: 20, spawnBatchSize: { min: 5, max: 10 } },
];

// Tiers are ascending - keep scanning past a match so a higher score always
// wins, same "last qualifying entry" shape as getScalingMultiplier's phase
// lookup.
export function getSpawnPacing(difficultyScore: number): SpawnPacingTier {
  let selected = spawnPacingTiers[0];
  for (const tier of spawnPacingTiers) {
    if (tier.minDifficultyScore <= difficultyScore) {
      selected = tier;
    }
  }
  return selected;
}
