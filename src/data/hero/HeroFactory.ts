import type { HeroInstance, HeroTemplate } from './heroTypes';

let nextInstanceSequence = 0;

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Factory responsible for turning an immutable HeroTemplate into an
 * independently-owned HeroInstance. Every call deep clones the template's
 * nested data (baseStats, skills, evolution) so no two instances - even two
 * of the exact same template - ever share array/object references.
 */
export class HeroFactory {
  static createHero(template: HeroTemplate): HeroInstance {
    nextInstanceSequence += 1;

    return {
      templateId: template.id,
      instanceId: `${template.id}#${nextInstanceSequence}`,
      nameKey: template.nameKey,
      heroClass: template.heroClass,
      baseStats: deepClone(template.baseStats),
      currentStats: deepClone(template.baseStats),
      level: 1,
      exp: 0,
      skills: deepClone(template.skills),
      evolution: deepClone(template.evolution),
      appliedEvolutionNodeIds: [],
      visualTier: 0,
    };
  }
}
