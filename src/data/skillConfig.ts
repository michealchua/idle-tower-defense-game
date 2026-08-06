// Pure data - no engine imports. Adding a same-shaped skill (another
// aoeDamage nuke, or another chainDamage skill) is just a new entry here
// plus a milestone reward pointing at its id. A differently-shaped skill
// (a duration-based debuff, etc.) needs a new `effectType` handled inside
// SkillSystem, but never a change to this file's shape.

export type SkillEffectType = 'aoeDamage' | 'chainDamage';

// Delivery/visual signature, orthogonal to effectType (what the skill does).
// SkillSystem and the renderer don't branch on this yet, but the field
// exists so they can later without a config shape change.
export type SkillCastType = 'instant' | 'projectile' | 'beam' | 'aura';

export type SkillTargetingStrategyKey =
  | 'heroDefault'
  | 'closestToBase'
  | 'closestToHero'
  | 'lowestHp'
  | 'highestHp'
  | 'strongest'
  | 'random';

export interface SkillDefinition {
  id: string;
  cooldownSeconds: number;
  range: number;
  castType: SkillCastType;
  effectType: SkillEffectType;
  targetingStrategy: SkillTargetingStrategyKey;
  damageMultiplier: number;
  // Used by 'aoeDamage' only.
  aoeRadius?: number;
  // Used by 'chainDamage' only.
  targetCount?: number;
}

export const skillDefinitions: Record<string, SkillDefinition> = {
  'skill-fireball': {
    id: 'skill-fireball',
    cooldownSeconds: 4,
    range: 250,
    castType: 'projectile',
    effectType: 'aoeDamage',
    targetingStrategy: 'heroDefault',
    aoeRadius: 60,
    damageMultiplier: 1.5,
  },
  // Same effectType as Fireball - a bigger, slower-cooling nuke. Zero new
  // engine code: SkillSystem's aoeDamage case and the skillImpact visual
  // both already scale off these numbers.
  'skill-meteor': {
    id: 'skill-meteor',
    cooldownSeconds: 12,
    range: 300,
    castType: 'instant',
    effectType: 'aoeDamage',
    targetingStrategy: 'heroDefault',
    aoeRadius: 100,
    damageMultiplier: 3,
  },
  // First chainDamage skill - hits several distinct targets instead of one
  // AOE point. Uses lowestHp priority (mop up weakened stragglers) instead
  // of heroDefault, giving it a different tactical role from Fireball/Meteor.
  'skill-lightning': {
    id: 'skill-lightning',
    cooldownSeconds: 3,
    range: 220,
    castType: 'beam',
    effectType: 'chainDamage',
    targetingStrategy: 'lowestHp',
    targetCount: 3,
    damageMultiplier: 0.8,
  },
};
