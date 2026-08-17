// The shared tier-0/Normal-equivalent baseline. Every archetype's concrete
// stats are this block multiplied by the archetype's profile and the
// current difficulty scaling multiplier - see engine/entities/Enemy.ts.
export const enemyBaseStats = {
  // Raised from 15 (was tuned so a tier-0 Normal died in 1-2 hits before
  // skills unlock, which read as "too easy" through the whole early game -
  // see enemyScalingConfig.ts's curve.linearRate for the matching early-game
  // curve steepening). Still dies fast to a leveled hero, just not
  // trivially from wave 1.
  maxHp: 22,
  goldReward: 10,
  expReward: 8,
  speed: 30,
  // Raised alongside maxHp/heroDamage (same early-difficulty pass) - getting
  // hit now actually costs something from wave 1 instead of being background
  // noise.
  damageToBase: 26,
  // Chip damage dealt to a hero while the enemy is inside hero attack range
  // (see CombatSystem.tickEnemyAttacksOnHeroes) - deliberately much smaller
  // than damageToBase, since this is supplementary attrition on the squad,
  // not the primary lose condition (base HP still is). Scaled per-archetype
  // by the same damageToBaseMultiplier archetypes already define, rather
  // than adding a parallel multiplier field to every archetype.
  heroDamage: 6,
};

// Fixed cadence for enemy-on-hero attacks, uniform across archetypes (unlike
// damageToBase/heroDamage, which scale by archetype) - keeps this a simple
// "how much attrition" knob instead of also tuning "how often" per archetype.
export const enemyHeroAttackIntervalSeconds = 1.5;
