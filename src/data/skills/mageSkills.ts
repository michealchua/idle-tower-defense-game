import { MechanicTag, StatusEffectType, type SkillDefinition } from './skillTypes';

// Skill instances backing heroCatalog.ts's two ranged mage entries (step
// 16). Both are projectileSpeed skills - CombatEngine spawns a homing
// Projectile instead of resolving damage the instant they're cast, and
// their statusEffectOnHit only lands once that projectile actually reaches
// its target.

/** Cryomancer's base skill - a slow-but-piercing frost bolt that snares its target on impact. */
export const frostBoltSkill: SkillDefinition = {
  id: 'skill-frost-bolt',
  name: '冰霜箭',
  description: '发射一枚冰霜箭，命中后造成伤害并大幅减速目标的移动速度。',
  cooldown: 3,
  range: 180,
  damageMultiplier: 0.8,
  mechanicTags: [MechanicTag.Slow],
  projectileSpeed: 420,
  statusEffectOnHit: { type: StatusEffectType.Slow, duration: 3, magnitude: 0.4 },
};

/** Pyromancer's base skill - a fireball that ignites its target, dealing damage over time independent of whether the hero keeps attacking. */
export const fireballSkill: SkillDefinition = {
  id: 'skill-fireball',
  name: '火球术',
  description: '投掷一枚火球，命中后点燃目标，使其在接下来的几秒内持续灼烧受损。',
  cooldown: 4,
  range: 180,
  damageMultiplier: 0.6,
  mechanicTags: [MechanicTag.Bleed],
  projectileSpeed: 360,
  statusEffectOnHit: { type: StatusEffectType.Dot, duration: 4, magnitude: 8 },
};

/**
 * 见习法师 (Apprentice Mage)'s starting base skill - a plain, unspecialized
 * bolt with no statusEffectOnHit (step 17). Establishes the "generic
 * ranged attacker" role the base hero is meant to hold; evolving into
 * Cryomancer/Pyromancer swaps this out for frostBoltSkill/fireballSkill
 * entirely rather than layering a bonus on top of it.
 */
export const arcaneBoltSkill: SkillDefinition = {
  id: 'skill-arcane-bolt',
  name: '奥术弹',
  description: '发射一枚基础奥术弹，造成少量伤害，尚未具备特殊效果。',
  cooldown: 3,
  range: 160,
  damageMultiplier: 0.5,
  mechanicTags: [],
  projectileSpeed: 380,
};

export const mageSkillDefinitions: Record<string, SkillDefinition> = {
  [frostBoltSkill.id]: frostBoltSkill,
  [fireballSkill.id]: fireballSkill,
  [arcaneBoltSkill.id]: arcaneBoltSkill,
};
