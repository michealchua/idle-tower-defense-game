import { MechanicTag, type SkillDefinition } from './skillTypes';

// Skill instances backing the Warrior - Swordsman evolution chain test in
// src/data/hero/warriorTemplates.ts (基础剑士 -> 狂战士 -> 血怒狂战). Each
// stage's skill is a distinct definition (not just a bigger number) so the
// evolution nodes can demonstrate an actual mechanic change alongside the
// stat bump.

/** Swordsman's starting base skill - a simple cleave, no special mechanic yet. */
export const bladeSlashSkill: SkillDefinition = {
  id: 'skill-blade-slash',
  name: '剑气斩',
  description: '挥出一道剑气，对前方扇形范围内的敌人造成伤害。',
  cooldown: 4,
  range: 140,
  damageMultiplier: 1.3,
  mechanicTags: [MechanicTag.AoE],
};

/** Unlocked as a growth skill by the first evolution node (-> 狂战士). */
export const bloodFurySkill: SkillDefinition = {
  id: 'skill-blood-fury',
  name: '嗜血之怒',
  description: '狂暴状态下疯狂挥舞武器，命中吸取目标生命值并使自身流血叠加攻击力。',
  cooldown: 10,
  range: 120,
  damageMultiplier: 1.6,
  mechanicTags: [MechanicTag.LifeSteal, MechanicTag.Bleed],
};

/** Replaces the base skill outright at the second evolution node (-> 血怒狂战). */
export const bloodrageSlashSkill: SkillDefinition = {
  id: 'skill-bloodrage-slash',
  name: '血怒裂斩',
  description: '取代普通剑气斩：对低血量目标造成大幅提升的处决伤害，并击退命中的敌人。',
  cooldown: 3,
  range: 150,
  damageMultiplier: 2.2,
  mechanicTags: [MechanicTag.Execute, MechanicTag.Knockback, MechanicTag.LifeSteal],
};

export const warriorSkillDefinitions: Record<string, SkillDefinition> = {
  [bladeSlashSkill.id]: bladeSlashSkill,
  [bloodFurySkill.id]: bloodFurySkill,
  [bloodrageSlashSkill.id]: bloodrageSlashSkill,
};
