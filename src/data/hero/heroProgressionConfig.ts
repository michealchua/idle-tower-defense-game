// Simple exponential EXP curve + flat per-level stat growth, used by
// HeroManager.addExp. Placeholder numbers, same shape as the old
// heroConfig.ts's heroLevelConfig - tune later without touching the logic.
export const heroProgressionConfig = {
  baseExpToNextLevel: 20,
  expGrowth: 1.15,
  /** Fraction of baseStats added to currentStats on each level-up. */
  statGrowthPerLevel: 0.05,
};

export function getExpToNextLevel(level: number): number {
  return Math.round(heroProgressionConfig.baseExpToNextLevel * heroProgressionConfig.expGrowth ** (level - 1));
}
