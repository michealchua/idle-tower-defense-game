import { getTalentCost, getTalentLevel, isTalentMaxed, type TalentId } from '../../data/talentConfig';
import { recomputeHeroStats } from './HeroStatsSystem';
import type { GameState } from '../types';

export function upgradeTalent(state: GameState, id: TalentId): boolean {
  if (isTalentMaxed(state.talentLevels, id)) {
    return false;
  }

  const cost = getTalentCost(id, getTalentLevel(state.talentLevels, id));
  if (state.skillPoints < cost) {
    return false;
  }

  state.skillPoints -= cost;
  state.talentLevels[id] = getTalentLevel(state.talentLevels, id) + 1;

  // attackDamage/maxHp/criticalChance feed hero/pet stats - recompute so the
  // new bonus is live immediately.
  recomputeHeroStats(state);
  return true;
}
