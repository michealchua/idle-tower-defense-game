// Plan section 10's "元素决定对不同敌人/Boss的优势与劣势" - a lightweight
// advantage wheel layered on top of class/skills, not a replacement for
// either. Every hero (heroRosterConfig.ts) and enemy archetype
// (enemyArchetypes.ts) carries one element; CombatSystem/SkillSystem look up
// both sides at hit time (never baked into HeroState.attackDamage, since the
// multiplier depends on *which* enemy is being hit) and apply
// getElementDamageMultiplier to that swing's damage.
export type ElementId = 'fire' | 'water' | 'earth' | 'wind' | 'light' | 'dark';

export const elementIds: ElementId[] = ['fire', 'water', 'earth', 'wind', 'light', 'dark'];

// attacker element -> the element(s) it deals bonus damage against. A
// four-element cycle (fire > wind > earth > water > fire) plus light/dark as
// a separate mutually-opposed pair, so every element is strong against
// exactly one other and weak against exactly one other - no element is ever
// strictly best, which is the point (plan: "没有一个英雄应该在所有关卡都无脑
// 最优").
const STRONG_AGAINST: Record<ElementId, ElementId[]> = {
  fire: ['wind'],
  wind: ['earth'],
  earth: ['water'],
  water: ['fire'],
  light: ['dark'],
  dark: ['light'],
};

export const elementAdvantageConfig = {
  strongMultiplier: 1.3,
  weakMultiplier: 0.75,
};

// 1.3x when attackerElement counters defenderElement, 0.75x when it's the
// one being countered, 1x otherwise (including same-element hits).
export function getElementDamageMultiplier(attackerElement: ElementId, defenderElement: ElementId): number {
  if (STRONG_AGAINST[attackerElement].includes(defenderElement)) {
    return elementAdvantageConfig.strongMultiplier;
  }
  if (STRONG_AGAINST[defenderElement].includes(attackerElement)) {
    return elementAdvantageConfig.weakMultiplier;
  }
  return 1;
}
