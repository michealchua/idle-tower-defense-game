// Ascension becomes available once your strongest hero reaches
// unlockHeroLevel AND the run has cleared chapter (requiredChapter - 1)'s
// final wave and stepped into requiredChapter wave 1 (e.g. requiredChapter
// 45 means "beat 44-10, standing in 45-1" - see AscensionSystem.canAscend).
// Deliberately placed just past enemyScalingConfig's difficulty wall
// (chapter ~40, where score crosses curve.phase2EndScore and HP spikes) -
// ascending is meant to be the intended way through the wall, not something
// you reach long after already grinding past it. Each ascend grants
// pointsPerAscend, spent in the ascension shop (ascensionShopConfig.ts) for
// permanent bonuses that make the next run's climb to chapter 45 faster.
export const ascensionConfig = {
  unlockHeroLevel: 50,
  requiredChapter: 45,
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
