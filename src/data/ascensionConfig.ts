// Ascension becomes available once your strongest hero reaches
// unlockHeroLevel AND the run's global wave count (see
// WaveSystem.getGlobalWaveNumber) reaches requiredWave - see
// AscensionSystem.canAscend. requiredWave is deliberately kept equal to
// unlockConditionConfig.panelUnlockWave.ascension (both 100) on purpose:
// "所见即所得" - the moment the AscensionPanel tab reveals itself, the
// ascend button inside it is already pressable, mid-fight against wave
// 100's boss. This sits well *before* enemyScalingConfig's difficulty wall
// (chapter ~40 / global wave ~400) - ascension is now an early rescue valve
// a struggling run can reach for, not "the intended way through the wall"
// (see enemyScalingConfig.ts's curve comment for that system's own pacing).
// Each ascend grants pointsPerAscend, spent in the ascension shop
// (ascensionShopConfig.ts) for permanent bonuses that make the next run's
// climb back to wave 100 faster.
export const ascensionConfig = {
  unlockHeroLevel: 50,
  requiredWave: 100,
  pointsPerAscend: 1,
  // "升华相对论" - each ascension multiplies hero attack damage AND enemy
  // maxHp by the same factor (see getAscensionPowerMultiplier), so
  // TTK/relative difficulty at a given chapter stays put while the numbers
  // on screen get satisfyingly huge. Enemy damage-to-hero/base only gets
  // the dampened half-strength version (getAscensionEnemyDamageMultiplier)
  // because ascend() resets hero level - and therefore maxHp - back to 1;
  // full parity there would one-shot a fresh squad. Placeholder constant,
  // tune later like every other unspecified number in this project.
  powerMultiplierPerAscend: 4,
  enemyDamageDampening: 0.5,
};

// Applied to hero (and pet) attackDamage in HeroStatsSystem, and to enemy
// maxHp in Enemy.createEnemy - the two sides of the "relativity" symmetry.
export function getAscensionPowerMultiplier(ascensionLevel: number): number {
  return ascensionConfig.powerMultiplierPerAscend ** ascensionLevel;
}

// Applied to enemy damageToBase/heroDamage only - see the dampening comment
// above.
export function getAscensionEnemyDamageMultiplier(ascensionLevel: number): number {
  return (ascensionConfig.powerMultiplierPerAscend * ascensionConfig.enemyDamageDampening) ** ascensionLevel;
}
