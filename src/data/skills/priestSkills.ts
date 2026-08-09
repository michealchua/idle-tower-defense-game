import { MechanicTag, type SkillDefinition } from './skillTypes';

/**
 * Priest's base skill (step 23) - a MechanicTag.Heal skill, which
 * CombatEngine.update() routes into resolveHealCast entirely instead of the
 * normal enemy-targeting/damage path: no `range` restriction is applied to
 * heal target selection (it searches the whole field for the lowest-HP%
 * living ally, see resolveHealCast), so `range` here is nominal/unused for
 * targeting purposes but still required by SkillDefinition's shape.
 * damageMultiplier is reinterpreted as the heal ratio against the priest's
 * own currentAttack (0.9 = heals for 90% of attack power per cast).
 */
export const holyMendSkill: SkillDefinition = {
  id: 'skill-holy-mend',
  name: '圣光愈疗',
  description: '不进行普通攻击，转而治疗场上生命值百分比最低的友方英雄，并清除其身上的一层负面状态。',
  cooldown: 5,
  range: 0,
  damageMultiplier: 0.9,
  mechanicTags: [MechanicTag.Heal],
  cleansesDebuff: true,
};

export const priestSkillDefinitions: Record<string, SkillDefinition> = {
  [holyMendSkill.id]: holyMendSkill,
};
