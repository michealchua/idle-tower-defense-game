import { frostBoltSkill, fireballSkill, arcaneBoltSkill } from '../skills/mageSkills';
import { HeroClass, type HeroTemplate, type SkillSlot } from './heroTypes';

function emptySlot(): SkillSlot {
  return { skillId: null, unlocked: false };
}

/**
 * 见习法师 (Apprentice Mage) - the step-17 base hero for the
 * cryomancer/pyromancer evolution branch: cheap, generically ranged, no
 * status effect of its own. See heroEvolution.ts for what it becomes at
 * Lv.10 - the evolved forms below are still directly purchasable in their
 * own right (step 16), evolution is just a second way to reach the same
 * skill/sprite outcome, not the only one.
 */
export const apprenticeMageTemplate: HeroTemplate = {
  id: 'mage-apprentice',
  nameKey: 'hero.mageApprentice',
  heroClass: HeroClass.Mage,
  baseStats: { hp: 70, attack: 10, defense: 3, attackSpeed: 1.0, crit: 0.05 },
  skills: {
    baseSkill: { skillId: arcaneBoltSkill.id, unlocked: true },
    growthSkills: [emptySlot(), emptySlot()],
  },
  evolution: {
    nodes: [],
  },
};

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

export const mageTemplates: HeroTemplate[] = [apprenticeMageTemplate, cryomancerTemplate, pyromancerTemplate];
