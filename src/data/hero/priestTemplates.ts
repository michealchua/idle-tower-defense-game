import { holyMendSkill } from '../skills/priestSkills';
import { HeroClass, type HeroTemplate, type SkillSlot } from './heroTypes';

function emptySlot(): SkillSlot {
  return { skillId: null, unlocked: false };
}

/**
 * 见习牧师 (Acolyte) - step 23's support archetype: no evolution branch yet,
 * same "base hero, evolution reserved for later" state apprenticeMageTemplate
 * shipped in at first. Its base skill (holyMendSkill) is a MechanicTag.Heal
 * skill - CombatEngine routes it entirely away from the normal enemy-attack
 * path, so this hero deals no damage of its own; it exists purely to keep
 * the rest of the roster alive against step 22's environmental hazards.
 */
export const priestTemplate: HeroTemplate = {
  id: 'priest-acolyte',
  nameKey: 'hero.priestAcolyte',
  heroClass: HeroClass.Priest,
  baseStats: { hp: 90, attack: 12, defense: 5, attackSpeed: 1.0, crit: 0.05 },
  skills: {
    baseSkill: { skillId: holyMendSkill.id, unlocked: true },
    growthSkills: [emptySlot(), emptySlot()],
  },
  evolution: {
    nodes: [],
  },
};

export const priestTemplates: HeroTemplate[] = [priestTemplate];
