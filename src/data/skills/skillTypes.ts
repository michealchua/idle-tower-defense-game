// Skill data architecture (design doc step 2). Independent of the old
// src/data/skillConfig.ts (which stays untouched/unused by this module for
// now) - this is the new shape hero templates in src/data/hero/ point their
// SkillSlot.skillId at.

/**
 * Special-mechanic labels a skill can carry, on top of its raw numbers.
 * Purely descriptive at this stage - no engine code branches on these yet -
 * but this is what lets two skills with the same damageMultiplier still
 * "play differently" once combat logic is built against them.
 */
export enum MechanicTag {
  AoE = 'aoe',
  Stun = 'stun',
  Knockback = 'knockback',
  LifeSteal = 'lifeSteal',
  Bleed = 'bleed',
  Chain = 'chain',
  Shield = 'shield',
  Silence = 'silence',
  Slow = 'slow',
  Execute = 'execute',
}

/** The two status effects BattleEnemy's activeStatuses engine resolves each tick (step 16). */
export enum StatusEffectType {
  /** Reduces the target's effective movement speed by `magnitude` (a 0-1 fraction) for `duration` seconds. */
  Slow = 'slow',
  /** Deals `magnitude` damage per second for `duration` seconds, independent of any hero still being in range. */
  Dot = 'dot',
}

/** Authoring-time shape of a status effect a skill applies on hit - BattleEnemy.applyStatus takes this same shape and adds its own countdown state on top. */
export interface StatusEffectConfig {
  type: StatusEffectType;
  /** Seconds the effect lasts once applied. */
  duration: number;
  /** Slow: fraction of speed removed (e.g. 0.4 = 40% slower). Dot: damage dealt per second. */
  magnitude: number;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  cooldown: number;
  range: number;
  damageMultiplier: number;
  mechanicTags: MechanicTag[];
  /**
   * Pixels/second a ranged skill's projectile travels toward its target -
   * omitted entirely for melee/instant skills, which CombatEngine resolves
   * the same tick they're cast. Present means CombatEngine spawns a
   * Projectile instead, and damage/statusEffectOnHit only land once it
   * actually reaches the target.
   */
  projectileSpeed?: number;
  /** Applied to the target the instant this skill's damage resolves (on cast for melee, on impact for a projectile). */
  statusEffectOnHit?: StatusEffectConfig;
}
