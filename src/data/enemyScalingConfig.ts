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
  // Four-phase difficulty curve, keyed off the combined difficultyScore
  // (dominated by stage.weight, so "score" and "stage" move together for a
  // player leveling roughly in step with the wave they're on). Mirrors the
  // classic idle/TD pacing: gentle linear early game, a light exponential
  // ramp, a sudden "wall" spike that's meant to be unbeatable by raw
  // upgrades alone, then a steep compound-exponential late game. Note
  // ascensionConfig.requiredWave (100, ~stage 15) unlocks well *before* this
  // wall (chapter ~40, stage ~400) - ascension is an early rescue valve a
  // struggling run can reach for, not specifically "the way through" this
  // particular wall.
  curve: {
    // score ~= stage * stage.weight, so these line up with roughly:
    // phase1End -> stage 150 (chapter 15), phase2End -> stage 400 (chapter
    // 40, where the wall hits), phase3End -> stage 700 (chapter 70).
    phase1EndScore: 22.5,
    phase2EndScore: 60,
    phase3EndScore: 105,
    // Phase 1 (0..phase1EndScore): linear growth. Raised from 0.1 (which
    // left chapters 1-15 feeling nearly flat, on top of enemyConfig.ts's
    // base stats also being low) - still clearable by spending gold on
    // upgrades as it comes in, just noticeably steeper: by phase1EndScore
    // (chapter ~15) enemies are now ~6x tougher instead of ~3.25x.
    linearRate: 0.22,
    // Phase 2 (phase1EndScore..phase2EndScore): light exponential per score
    // point - upgrades alone start falling behind, targeted play helps.
    phase2Growth: 1.06,
    // The wall: an instant multiplier spike the moment score crosses
    // phase2EndScore, deliberately too big to out-upgrade in one sitting.
    wallJumpMultiplier: 5,
    // Phase 3 (phase2EndScore..phase3EndScore): continued exponential climb
    // after the wall, while the player pushes toward the ascension gate.
    phase3Growth: 1.09,
    // Phase 4 (phase3EndScore..): steep compound growth - exponential times
    // a linearly-growing factor, so it keeps accelerating rather than
    // settling into a fixed exponential rate. This is what makes builds/
    // talents/equipment mandatory instead of optional in the late game.
    phase4Growth: 1.05,
    phase4CompoundScale: 40,
  },
};

function getPhase1EndMultiplier(): number {
  const { phase1EndScore, linearRate } = enemyScalingConfig.curve;
  return 1 + phase1EndScore * linearRate;
}

function getPhase2EndMultiplier(): number {
  const { phase1EndScore, phase2EndScore, phase2Growth } = enemyScalingConfig.curve;
  return getPhase1EndMultiplier() * phase2Growth ** (phase2EndScore - phase1EndScore);
}

function getPostWallMultiplier(): number {
  return getPhase2EndMultiplier() * enemyScalingConfig.curve.wallJumpMultiplier;
}

function getPhase3EndMultiplier(): number {
  const { phase2EndScore, phase3EndScore, phase3Growth } = enemyScalingConfig.curve;
  return getPostWallMultiplier() * phase3Growth ** (phase3EndScore - phase2EndScore);
}

export function getScalingMultiplier(difficultyScore: number): number {
  const { phase1EndScore, phase2EndScore, phase3EndScore, linearRate, phase2Growth, phase3Growth, phase4Growth, phase4CompoundScale } =
    enemyScalingConfig.curve;

  if (difficultyScore <= phase1EndScore) {
    return 1 + difficultyScore * linearRate;
  }
  if (difficultyScore <= phase2EndScore) {
    return getPhase1EndMultiplier() * phase2Growth ** (difficultyScore - phase1EndScore);
  }
  if (difficultyScore <= phase3EndScore) {
    return getPostWallMultiplier() * phase3Growth ** (difficultyScore - phase2EndScore);
  }

  const scoreIntoPhase4 = difficultyScore - phase3EndScore;
  return getPhase3EndMultiplier() * phase4Growth ** scoreIntoPhase4 * (1 + scoreIntoPhase4 / phase4CompoundScale);
}
