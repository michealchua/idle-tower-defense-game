// Pure data - no engine imports (other than GachaRarity, itself a pure type).
// Adding a same-shaped skill (another aoeDamage nuke, or another chainDamage
// skill) is just a new entry here. A differently-shaped skill (a duration-
// based debuff, etc.) needs a new `effectType` handled inside SkillSystem,
// but never a change to this file's shape.

import type { GachaRarity } from './gachaConfig';

export type SkillEffectType = 'aoeDamage' | 'chainDamage' | 'healAlly';

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
  // i18n key for the skill's display name - looked up directly by
  // HeroPanel instead of a separate hardcoded label map, since the roster
  // now has ~18 skills spread across 100 heroes instead of 3 shared ones.
  nameKey: string;
  cooldownSeconds: number;
  range: number;
  castType: SkillCastType;
  effectType: SkillEffectType;
  // Enemy-targeting strategy, used by aoeDamage/chainDamage only.
  // healAlly ignores this - it always targets the lowest-HP% deployed
  // heroes in range (see SkillSystem.castHealAlly) - kept set to a
  // placeholder value so every definition satisfies the same shape.
  targetingStrategy: SkillTargetingStrategyKey;
  // aoeDamage/chainDamage: multiplies attackDamage into damage dealt.
  // healAlly: multiplies attackDamage into HP restored per target instead.
  damageMultiplier: number;
  // Used by 'aoeDamage' only.
  aoeRadius?: number;
  // chainDamage: how many enemies it hits. healAlly: how many allies it heals.
  targetCount?: number;
  // Hex accent for this skill's cast-pose spark, impact ring/bolt/pulse, and
  // particle burst (SkillSystem/CanvasRenderer) - every skill used to share
  // just 3 fixed colors (one per effectType), so a Fireball and an
  // Earthquake looked identical mid-cast. Themed per skill's flavor, not its
  // effectType, so skills sharing an effectType still read as distinct.
  color: string;
  // Gacha pool tier (GachaSystem.pullSkill) - spread across all 7 rarities
  // so every tier of the skill gacha has at least one hit, same intent as
  // heroRosterConfig's rarity spread had before the single-protagonist
  // redesign removed hero pulls.
  rarity: GachaRarity;
}

export const skillDefinitions: Record<string, SkillDefinition> = {
  // --- aoeDamage (6) ---
  'skill-fireball': {
    id: 'skill-fireball',
    nameKey: 'skill.fireball',
    cooldownSeconds: 4,
    range: 250,
    castType: 'projectile',
    effectType: 'aoeDamage',
    targetingStrategy: 'heroDefault',
    aoeRadius: 60,
    damageMultiplier: 1.5,
    color: '#ff7043',
    rarity: 'green',
  },
  // Same effectType as Fireball - a bigger, slower-cooling nuke. Zero new
  // engine code: SkillSystem's aoeDamage case and the skillImpact visual
  // both already scale off these numbers.
  'skill-meteor': {
    id: 'skill-meteor',
    nameKey: 'skill.meteor',
    cooldownSeconds: 12,
    range: 300,
    castType: 'instant',
    effectType: 'aoeDamage',
    targetingStrategy: 'heroDefault',
    aoeRadius: 100,
    damageMultiplier: 3,
    color: '#ff3d00',
    rarity: 'gold',
  },
  'skill-flameNova': {
    id: 'skill-flameNova',
    nameKey: 'skill.flameNova',
    cooldownSeconds: 6,
    range: 180,
    castType: 'aura',
    effectType: 'aoeDamage',
    targetingStrategy: 'closestToHero',
    aoeRadius: 70,
    damageMultiplier: 1.2,
    color: '#ffab40',
    rarity: 'blue',
  },
  'skill-iceBurst': {
    id: 'skill-iceBurst',
    nameKey: 'skill.iceBurst',
    cooldownSeconds: 7,
    range: 220,
    castType: 'projectile',
    effectType: 'aoeDamage',
    targetingStrategy: 'strongest',
    aoeRadius: 80,
    damageMultiplier: 1.7,
    color: '#4fc3f7',
    rarity: 'blue',
  },
  'skill-earthquake': {
    id: 'skill-earthquake',
    nameKey: 'skill.earthquake',
    cooldownSeconds: 14,
    range: 260,
    castType: 'instant',
    effectType: 'aoeDamage',
    targetingStrategy: 'closestToBase',
    aoeRadius: 120,
    damageMultiplier: 3.4,
    color: '#8d6e63',
    rarity: 'red',
  },
  'skill-novaBlast': {
    id: 'skill-novaBlast',
    nameKey: 'skill.novaBlast',
    cooldownSeconds: 5,
    range: 200,
    castType: 'aura',
    effectType: 'aoeDamage',
    targetingStrategy: 'heroDefault',
    aoeRadius: 55,
    damageMultiplier: 1.4,
    color: '#ba68c8',
    rarity: 'purple',
  },

  // --- chainDamage (6) ---
  // First chainDamage skill - hits several distinct targets instead of one
  // AOE point. Uses lowestHp priority (mop up weakened stragglers) instead
  // of heroDefault, giving it a different tactical role from Fireball/Meteor.
  'skill-lightning': {
    id: 'skill-lightning',
    nameKey: 'skill.lightning',
    cooldownSeconds: 3,
    range: 220,
    castType: 'beam',
    effectType: 'chainDamage',
    targetingStrategy: 'lowestHp',
    targetCount: 3,
    damageMultiplier: 0.8,
    color: '#ffee58',
    rarity: 'gold',
  },
  'skill-arrowRain': {
    id: 'skill-arrowRain',
    nameKey: 'skill.arrowRain',
    cooldownSeconds: 5,
    range: 260,
    castType: 'projectile',
    effectType: 'chainDamage',
    targetingStrategy: 'closestToBase',
    targetCount: 4,
    damageMultiplier: 0.6,
    color: '#9ccc65',
    rarity: 'blue',
  },
  'skill-chainBlade': {
    id: 'skill-chainBlade',
    nameKey: 'skill.chainBlade',
    cooldownSeconds: 4,
    range: 140,
    castType: 'instant',
    effectType: 'chainDamage',
    targetingStrategy: 'closestToHero',
    targetCount: 2,
    damageMultiplier: 1.1,
    color: '#b0bec5',
    rarity: 'white',
  },
  'skill-thornWhip': {
    id: 'skill-thornWhip',
    nameKey: 'skill.thornWhip',
    cooldownSeconds: 6,
    range: 180,
    castType: 'beam',
    effectType: 'chainDamage',
    targetingStrategy: 'highestHp',
    targetCount: 2,
    damageMultiplier: 1.3,
    color: '#66bb6a',
    rarity: 'green',
  },
  'skill-spiritLink': {
    id: 'skill-spiritLink',
    nameKey: 'skill.spiritLink',
    cooldownSeconds: 8,
    range: 240,
    castType: 'beam',
    effectType: 'chainDamage',
    targetingStrategy: 'strongest',
    targetCount: 3,
    damageMultiplier: 1,
    color: '#4db6ac',
    rarity: 'purple',
  },
  'skill-voidChain': {
    id: 'skill-voidChain',
    nameKey: 'skill.voidChain',
    cooldownSeconds: 10,
    range: 280,
    castType: 'beam',
    effectType: 'chainDamage',
    targetingStrategy: 'random',
    targetCount: 5,
    damageMultiplier: 0.7,
    color: '#7c4dff',
    rarity: 'rainbow',
  },

  // --- healAlly (6) - support-flavored heroes' answer to enemy Healer
  // (EnemyAbilitySystem) - restores deployed heroes' currentHp instead of
  // damaging enemies. See SkillSystem.castHealAlly.
  'skill-healingLight': {
    id: 'skill-healingLight',
    nameKey: 'skill.healingLight',
    cooldownSeconds: 6,
    range: 200,
    castType: 'aura',
    effectType: 'healAlly',
    targetingStrategy: 'lowestHp',
    targetCount: 1,
    damageMultiplier: 1.2,
    color: '#ffd54f',
    rarity: 'purple',
  },
  'skill-natureBlessing': {
    id: 'skill-natureBlessing',
    nameKey: 'skill.natureBlessing',
    cooldownSeconds: 9,
    range: 220,
    castType: 'aura',
    effectType: 'healAlly',
    targetingStrategy: 'lowestHp',
    targetCount: 2,
    damageMultiplier: 0.9,
    color: '#aed581',
    rarity: 'blue',
  },
  'skill-sanctuary': {
    id: 'skill-sanctuary',
    nameKey: 'skill.sanctuary',
    cooldownSeconds: 14,
    range: 260,
    castType: 'aura',
    effectType: 'healAlly',
    targetingStrategy: 'lowestHp',
    targetCount: 5,
    damageMultiplier: 0.6,
    color: '#fff59d',
    rarity: 'gold',
  },
  'skill-lifeSpring': {
    id: 'skill-lifeSpring',
    nameKey: 'skill.lifeSpring',
    cooldownSeconds: 5,
    range: 180,
    castType: 'instant',
    effectType: 'healAlly',
    targetingStrategy: 'lowestHp',
    targetCount: 1,
    damageMultiplier: 1.6,
    color: '#81d4fa',
    rarity: 'white',
  },
  'skill-guardianPulse': {
    id: 'skill-guardianPulse',
    nameKey: 'skill.guardianPulse',
    cooldownSeconds: 10,
    range: 240,
    castType: 'aura',
    effectType: 'healAlly',
    targetingStrategy: 'lowestHp',
    targetCount: 3,
    damageMultiplier: 0.8,
    color: '#90a4ae',
    rarity: 'green',
  },
  'skill-phoenixGrace': {
    id: 'skill-phoenixGrace',
    nameKey: 'skill.phoenixGrace',
    cooldownSeconds: 18,
    range: 300,
    castType: 'instant',
    effectType: 'healAlly',
    targetingStrategy: 'lowestHp',
    targetCount: 9,
    damageMultiplier: 0.5,
    color: '#ffca28',
    rarity: 'rainbow',
  },
};
