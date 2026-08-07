import type { MechanicTag } from '../data/skills/skillTypes';

/**
 * Payload BattleHero.executeSkill hands off when a skill fires. Carries
 * everything a downstream damage-resolution system needs to actually apply
 * the effect (mechanicTags tell it *how* - AoE/Execute/LifeSteal/etc. - none
 * of that branching happens here) without that system reaching back into
 * BattleHero or HeroInstance itself.
 */
export interface SkillAction {
  skillId: string;
  casterInstanceId: string;
  mechanicTags: MechanicTag[];
  damageMultiplier: number;
  range: number;
  /** casterInstanceId's currentAttack at the moment of cast - damage system multiplies this by damageMultiplier. */
  sourceAttack: number;
}
