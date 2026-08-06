// Pure weights only - the actual list of contributors (and how they read
// GameState) lives in engine/systems/DifficultySystem.ts, since computing a
// contribution requires live state, not just config. This file just holds
// the tunable numbers each contributor multiplies by.
export const enemyScalingConfig = {
  // Replaces the old wall-clock "elapsedTime" contributor now that spawning
  // is wave-capped instead of endless - see DifficultySystem's stageNumber
  // contributor.
  stage: {
    weight: 0.15,
  },
  level: {
    weight: 0.05,
  },
  upgrades: {
    weight: 0.02,
  },
  // Linear, not exponential: hero power already compounds via levels/upgrades,
  // so enemy stats scaling linearly keeps long sessions bounded while the
  // hero still feels increasingly overpowered relative to the world.
  statGrowthPerScore: 0.1,
};

export function getScalingMultiplier(difficultyScore: number): number {
  return 1 + difficultyScore * enemyScalingConfig.statGrowthPerScore;
}
