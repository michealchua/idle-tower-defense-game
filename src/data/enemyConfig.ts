// The shared tier-0/Normal-equivalent baseline. Every archetype's concrete
// stats are this block multiplied by the archetype's profile and the
// current difficulty scaling multiplier - see engine/entities/Enemy.ts.
export const enemyBaseStats = {
  // 15 vs. the hero's base 10 attackDamage: a tier-0 Normal dies in 1-2 hits
  // before skills unlock. Difficulty ramps back up afterward via
  // getScalingMultiplier, gated in DifficultySystem/SpawnSystem so it stays
  // flat until then instead of creeping up from minute one.
  maxHp: 15,
  goldReward: 10,
  expReward: 8,
  speed: 30,
  damageToBase: 20,
};
