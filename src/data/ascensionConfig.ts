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
};
