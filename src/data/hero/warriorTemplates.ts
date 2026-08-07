import { bladeSlashSkill, bloodFurySkill, bloodrageSlashSkill } from '../skills/warriorSkills';
import { HeroClass, type HeroTemplate, type SkillSlot } from './heroTypes';

function emptySlot(): SkillSlot {
  return { skillId: null, unlocked: false };
}

// Three Warrior prototypes, used to validate the data structures in
// heroTypes.ts. Each hero gets its own object literal (never shared) so
// HeroFactory.createHero's deep clone has real per-instance data to prove
// out.

/**
 * 剑士 (Swordsman) - balanced baseline archetype, and the step-2 test case
 * for the full skill + evolution chain: 基础剑士 -> 狂战士 -> 血怒狂战.
 * Evolution node 1 unlocks 嗜血之怒 (skill-blood-fury) as a growth skill;
 * node 2 replaces the basic attack itself with 血怒裂斩
 * (skill-bloodrage-slash) - a mechanic change, not just bigger numbers.
 */
export const swordsmanTemplate: HeroTemplate = {
  id: 'warrior-swordsman',
  nameKey: 'hero.warriorSwordsman',
  heroClass: HeroClass.Warrior,
  baseStats: { hp: 120, attack: 14, defense: 10, attackSpeed: 1.0, crit: 0.05 },
  skills: {
    baseSkill: { skillId: bladeSlashSkill.id, unlocked: true },
    growthSkills: [{ skillId: bloodFurySkill.id, unlocked: false }, emptySlot()],
  },
  evolution: {
    nodes: [
      {
        id: 'warrior-swordsman-evo-berserker',
        name: '狂战士',
        description: '压抑的战意爆发，舍弃部分防御换取狂暴的攻速与生命汲取，解锁成长技能「嗜血之怒」。',
        requiredLevel: 20,
        statMultipliers: { hp: 0.9, attack: 1.6, defense: 0.85, attackSpeed: 1.15, crit: 1.3 },
        unlockSkillId: bloodFurySkill.id,
        visualTier: 1,
        spritePath: 'sprites/hero/warrior-swordsman/evo1-berserker.png',
      },
      {
        id: 'warrior-swordsman-evo-bloodrage-berserker',
        name: '血怒狂战',
        description: '彻底沦为嗜血的战争兵器，普通攻击被「血怒裂斩」取代，专精处决残血敌人并击退周围目标。',
        requiredLevel: 40,
        statMultipliers: { hp: 1.1, attack: 2.1, defense: 0.95, attackSpeed: 1.3, crit: 1.6 },
        replaceBaseSkillId: bloodrageSlashSkill.id,
        visualTier: 2,
        spritePath: 'sprites/hero/warrior-swordsman/evo2-bloodrage-berserker.png',
      },
    ],
  },
};

/** 狂战士 (Berserker) - glass-cannon archetype, low defense/high attack. */
export const berserkerTemplate: HeroTemplate = {
  id: 'warrior-berserker',
  nameKey: 'hero.warriorBerserker',
  heroClass: HeroClass.Warrior,
  baseStats: { hp: 100, attack: 20, defense: 6, attackSpeed: 1.15, crit: 0.1 },
  skills: {
    baseSkill: emptySlot(),
    growthSkills: [emptySlot(), emptySlot(), emptySlot()],
  },
  evolution: {
    nodes: [
      {
        id: 'warrior-berserker-evo-bloodlust',
        name: '嗜血狂战',
        description: '（进化内容待补完）',
        requiredLevel: 20,
        statMultipliers: { hp: 0.85, attack: 1.8, defense: 0.9, attackSpeed: 1.25, crit: 1.4 },
      },
      {
        id: 'warrior-berserker-evo-warlord',
        name: '战争领主',
        description: '（进化内容待补完）',
        requiredLevel: 40,
        statMultipliers: { hp: 1.1, attack: 1.6, defense: 1.1, attackSpeed: 1.1, crit: 1.2 },
      },
    ],
  },
};

/** 反击战士 (Counter Warrior) - tanky, defense/crit leaning counter-attack archetype. */
export const counterWarriorTemplate: HeroTemplate = {
  id: 'warrior-counter',
  nameKey: 'hero.warriorCounter',
  heroClass: HeroClass.Warrior,
  baseStats: { hp: 140, attack: 11, defense: 16, attackSpeed: 0.9, crit: 0.15 },
  skills: {
    baseSkill: emptySlot(),
    growthSkills: [emptySlot(), emptySlot()],
  },
  evolution: {
    nodes: [
      {
        id: 'warrior-counter-evo-retribution',
        name: '惩戒战士',
        description: '（进化内容待补完）',
        requiredLevel: 20,
        statMultipliers: { hp: 1.2, attack: 1.3, defense: 1.2, attackSpeed: 1.0, crit: 1.5 },
      },
      {
        id: 'warrior-counter-evo-bulwark',
        name: '壁垒守卫',
        description: '（进化内容待补完）',
        requiredLevel: 40,
        statMultipliers: { hp: 1.7, attack: 1.0, defense: 1.6, attackSpeed: 0.95, crit: 1.1 },
      },
    ],
  },
};

export const warriorTemplates: HeroTemplate[] = [swordsmanTemplate, berserkerTemplate, counterWarriorTemplate];
