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
  // Chip damage dealt to a hero while the enemy is inside hero attack range
  // (see CombatSystem.tickEnemyAttacksOnHeroes) - deliberately much smaller
  // than damageToBase, since this is supplementary attrition on the squad,
  // not the primary lose condition (base HP still is). Scaled per-archetype
  // by the same damageToBaseMultiplier archetypes already define, rather
  // than adding a parallel multiplier field to every archetype.
  heroDamage: 4,
};

// Fixed cadence for enemy-on-hero attacks, uniform across archetypes (unlike
// damageToBase/heroDamage, which scale by archetype) - keeps this a simple
// "how much attrition" knob instead of also tuning "how often" per archetype.
export const enemyHeroAttackIntervalSeconds = 1.5;
