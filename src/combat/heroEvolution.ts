import type { SkillDefinition } from '../data/skills/skillTypes';
import { frostBoltSkill, fireballSkill } from '../data/skills/mageSkills';

/**
 * One evolution choice: replaces the hero's entire skill set with `skill`
 * (BattleHero.evolveInto does the actual swap) and sets its visual identity
 * to `id` - GameRenderer looks up
 * assetLoader.getHeroEvolvedSpriteSrc(hero.evolvedInto) once evolvedInto is
 * set, so `id` must match an existing /sprites/heroes/evolved/*.png file
 * (with hyphens standing in for the underscores in the actual filename,
 * same convention getHeroEvolvedSpriteSrc already expects).
 */
export interface EvolutionOption {
  id: string;
  displayName: string;
  cost: number;
  skill: SkillDefinition;
}

export interface EvolutionConfig {
  /** BattleHero.level a hero must reach before GameManager.tryEvolveHero will accept any option here. */
  requiredLevel: number;
  options: EvolutionOption[];
}

/**
 * Keyed by heroTypeId (heroCatalog.ts's catalog key, e.g. 'apprenticeMage')
 * - only hero types with an entry here can ever evolve; everything else
 * (warriors, the already-specialized cryomancer/pyromancer bought
 * directly) just has no branch to take.
 */
export const heroEvolutions: Record<string, EvolutionConfig> = {
  apprenticeMage: {
    requiredLevel: 10,
    options: [
      {
        id: 'mage-cryomancer',
        displayName: '冰霜法师',
        cost: 150,
        skill: frostBoltSkill,
      },
      {
        id: 'mage-pyromancer',
        displayName: '烈焰法师',
        cost: 150,
        skill: fireballSkill,
      },
    ],
  },
};
