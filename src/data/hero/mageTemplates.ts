import { frostBoltSkill, fireballSkill } from '../skills/mageSkills';
import { HeroClass, type HeroTemplate, type SkillSlot } from './heroTypes';

function emptySlot(): SkillSlot {
  return { skillId: null, unlocked: false };
}

// Two ranged Mage prototypes for heroCatalog.ts's step-16 entries -
// squishier and cheaper on attack than the Warrior line, trading raw
// damage-per-hit for range and an on-hit status effect (Slow/DOT) instead.

/** 冰霜法师 (Cryomancer) - control-focused, snares whatever it hits with 冰霜箭 rather than out-damaging it. */
export const cryomancerTemplate: HeroTemplate = {
  id: 'mage-cryomancer',
  nameKey: 'hero.mageCryomancer',
  heroClass: HeroClass.Mage,
  baseStats: { hp: 80, attack: 13, defense: 4, attackSpeed: 1.0, crit: 0.05 },
  skills: {
    baseSkill: { skillId: frostBoltSkill.id, unlocked: true },
    growthSkills: [emptySlot(), emptySlot()],
  },
  evolution: {
    nodes: [],
  },
};

/** 烈焰法师 (Pyromancer) - damage-over-time focused, its 火球术 keeps a target burning long after the cast itself. */
export const pyromancerTemplate: HeroTemplate = {
  id: 'mage-pyromancer',
  nameKey: 'hero.magePyromancer',
  heroClass: HeroClass.Mage,
  baseStats: { hp: 80, attack: 13, defense: 4, attackSpeed: 1.0, crit: 0.05 },
  skills: {
    baseSkill: { skillId: fireballSkill.id, unlocked: true },
    growthSkills: [emptySlot(), emptySlot()],
  },
  evolution: {
    nodes: [],
  },
};

export const mageTemplates: HeroTemplate[] = [cryomancerTemplate, pyromancerTemplate];
