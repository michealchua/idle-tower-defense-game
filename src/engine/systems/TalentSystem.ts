import {
  getTalentCost,
  getTalentLevel,
  getTalentMultiplier,
  isTalentMaxed,
  skillPointGainConfig,
  type TalentId,
} from '../../data/talentConfig';
import { recomputeHeroStats } from './HeroStatsSystem';
import { recomputeTowerStats } from './TowerSystem';
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

  // attackDamage/maxHp feed hero/pet stats; attackDamage/aoeDamage feed
  // tower stats - recompute both so the new bonus is live immediately.
  recomputeHeroStats(state);
  recomputeTowerStats(state);
  return true;
}

// Called every GameLoop tick - accumulates fractional seconds (sped up by
// the spGainSpeed talent) and converts whole multiples into skill points. A
// while loop (not if) so a high speed multiplier can award more than one
// point in a single tick without losing the remainder.
export function tickSkillPointGain(state: GameState, deltaSeconds: number): void {
  const speedMultiplier = getTalentMultiplier(state.talentLevels, 'spGainSpeed');
  state.skillPointAccumulator += deltaSeconds * speedMultiplier;

  while (state.skillPointAccumulator >= skillPointGainConfig.secondsPerPoint) {
    state.skillPointAccumulator -= skillPointGainConfig.secondsPerPoint;
    state.skillPoints += 1;
  }
}
