// Evolution reuses the visual tier already gated by milestoneConfig.ts's
// level thresholds (5/10/15/20) instead of a second level-threshold table -
// it just gives that existing tier real stat teeth (attackDamage/maxHp only,
// same reasoning as ascensionConfig: multiplying crit%/range produces
// nonsensical values).
export const evolutionConfig = {
  bonusMultiplierPerTier: 0.12,
};
