export const baseConfig = {
  maxHp: 200,
  // Replaces the old castle-level-driven base HP growth (see git history
  // for castleConfig.getBaseMaxHpForCastleLevel, removed alongside the rest
  // of the castle system) - now paced by wave progress instead of a
  // purchasable upgrade, so it stays in lockstep with
  // enemyScalingConfig's own wave-driven difficulty curve rather than an
  // independent gold-spending pace.
  hpGrowthPerWave: 8,
};

// (globalWave - 1) so wave 1 is exactly baseConfig.maxHp, matching
// Base.ts's createBase() initial value with no separate first-wave special
// case needed.
export function getBaseMaxHpForWave(globalWave: number): number {
  return baseConfig.maxHp + (globalWave - 1) * baseConfig.hpGrowthPerWave;
}
