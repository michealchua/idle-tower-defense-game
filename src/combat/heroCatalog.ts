import { HeroFactory } from '../data/hero/HeroFactory';
import type { HeroTemplate } from '../data/hero/heroTypes';
import type { SkillDefinition } from '../data/skills/skillTypes';
import { swordsmanTemplate, berserkerTemplate } from '../data/hero/warriorTemplates';
import { cryomancerTemplate, pyromancerTemplate, apprenticeMageTemplate } from '../data/hero/mageTemplates';
import { bladeSlashSkill } from '../data/skills/warriorSkills';
import { frostBoltSkill, fireballSkill, arcaneBoltSkill } from '../data/skills/mageSkills';
import { BattleHero } from './BattleHero';

export interface HeroCatalogEntry {
  heroTypeId: string;
  displayName: string;
  cost: number;
  template: HeroTemplate;
  /** Equipped as the placed hero's base skill - berserkerTemplate ships with an empty base skill slot, so this is set explicitly rather than trusted from the template. */
  baseSkill: SkillDefinition;
}

/** Purchasable hero types for GameManager.tryPlaceHero / the build-mode UI. Keyed by heroTypeId. */
export const heroCatalog: Record<string, HeroCatalogEntry> = {
  swordsman: {
    heroTypeId: 'swordsman',
    displayName: '剑士',
    cost: 50,
    template: swordsmanTemplate,
    baseSkill: bladeSlashSkill,
  },
  berserker: {
    heroTypeId: 'berserker',
    displayName: '狂战士',
    cost: 75,
    template: berserkerTemplate,
    baseSkill: bladeSlashSkill,
  },
  cryomancer: {
    heroTypeId: 'cryomancer',
    displayName: '冰霜法师',
    cost: 60,
    template: cryomancerTemplate,
    baseSkill: frostBoltSkill,
  },
  pyromancer: {
    heroTypeId: 'pyromancer',
    displayName: '烈焰法师',
    cost: 65,
    template: pyromancerTemplate,
    baseSkill: fireballSkill,
  },
  // heroEvolutions (heroEvolution.ts) is keyed by this exact 'apprenticeMage'
  // id - GameManager.tryEvolveHero looks up hero.heroTypeId against it.
  apprenticeMage: {
    heroTypeId: 'apprenticeMage',
    displayName: '见习法师',
    cost: 40,
    template: apprenticeMageTemplate,
    baseSkill: arcaneBoltSkill,
  },
};

/**
 * Builds a fresh, independently-owned BattleHero from a catalog entry.
 * Goes through HeroFactory (never mutates the shared HeroTemplate) and
 * patches only the per-instance HeroInstance clone's base skill slot, the
 * same pattern HeroManager.applyEvolution already uses for
 * replaceBaseSkillId.
 */
export function createBattleHeroFromCatalog(entry: HeroCatalogEntry, position: { x: number; y: number }): BattleHero {
  const heroInstance = HeroFactory.createHero(entry.template);
  heroInstance.skills.baseSkill = { skillId: entry.baseSkill.id, unlocked: true };
  return new BattleHero(heroInstance, [entry.baseSkill], position, entry.heroTypeId);
}
