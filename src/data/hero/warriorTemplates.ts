import { HeroClass, type HeroTemplate, type SkillSlot } from './heroTypes';

function emptySlot(): SkillSlot {
  return { skillId: null, unlocked: false };
}

// Three Warrior prototypes, for step-1 data-structure validation only - no
// skill/evolution content is filled in yet (skillId/skillUnlock stay null),
// that's a later design step. Each hero gets its own object literal (never
// shared) so HeroFactory.createHero's deep clone has real per-instance data
// to prove out.

/** 剑士 (Swordsman) - balanced baseline archetype. */
export const swordsmanTemplate: HeroTemplate = {
  id: 'warrior-swordsman',
  nameKey: 'hero.warriorSwordsman',
  heroClass: HeroClass.Warrior,
  baseStats: { hp: 120, attack: 14, defense: 10, attackSpeed: 1.0, crit: 0.05 },
  skills: {
    baseSkill: emptySlot(),
    growthSkills: [emptySlot(), emptySlot()],
  },
  evolution: {
    paths: [
      {
        id: 'warrior-swordsman-path-blade',
        nameKey: 'evolutionPath.swordsmanBlade',
        resultClass: HeroClass.Warrior,
        statMultiplier: { hp: 1.0, attack: 1.5, defense: 1.0, attackSpeed: 1.1, crit: 1.2 },
        skillUnlock: null,
      },
      {
        id: 'warrior-swordsman-path-vanguard',
        nameKey: 'evolutionPath.swordsmanVanguard',
        resultClass: HeroClass.Warrior,
        statMultiplier: { hp: 1.4, attack: 1.1, defense: 1.3, attackSpeed: 1.0, crit: 1.0 },
        skillUnlock: null,
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
    paths: [
      {
        id: 'warrior-berserker-path-bloodlust',
        nameKey: 'evolutionPath.berserkerBloodlust',
        resultClass: HeroClass.Warrior,
        statMultiplier: { hp: 0.85, attack: 1.8, defense: 0.9, attackSpeed: 1.25, crit: 1.4 },
        skillUnlock: null,
      },
      {
        id: 'warrior-berserker-path-warlord',
        nameKey: 'evolutionPath.berserkerWarlord',
        resultClass: HeroClass.Warrior,
        statMultiplier: { hp: 1.1, attack: 1.6, defense: 1.1, attackSpeed: 1.1, crit: 1.2 },
        skillUnlock: null,
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
    paths: [
      {
        id: 'warrior-counter-path-retribution',
        nameKey: 'evolutionPath.counterRetribution',
        resultClass: HeroClass.Warrior,
        statMultiplier: { hp: 1.2, attack: 1.3, defense: 1.2, attackSpeed: 1.0, crit: 1.5 },
        skillUnlock: null,
      },
      {
        id: 'warrior-counter-path-bulwark',
        nameKey: 'evolutionPath.counterBulwark',
        resultClass: HeroClass.Warrior,
        statMultiplier: { hp: 1.7, attack: 1.0, defense: 1.6, attackSpeed: 0.95, crit: 1.1 },
        skillUnlock: null,
      },
    ],
  },
};

export const warriorTemplates: HeroTemplate[] = [swordsmanTemplate, berserkerTemplate, counterWarriorTemplate];
