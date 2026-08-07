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

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  cooldown: number;
  range: number;
  damageMultiplier: number;
  mechanicTags: MechanicTag[];
}
