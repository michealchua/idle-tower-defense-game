// Ascension becomes available once your strongest hero reaches this level.
// Each ascension level grants a permanent multiplier (see
// HeroStatsSystem.getAscensionMultiplier) applied to attackDamage/maxHp only -
// see evolutionConfig.ts for why crit/range stay untouched by multipliers.
export const ascensionConfig = {
  unlockHeroLevel: 10,
  bonusMultiplierPerLevel: 0.15,
};
