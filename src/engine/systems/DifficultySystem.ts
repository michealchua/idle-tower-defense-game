import { enemyScalingConfig } from '../../data/enemyScalingConfig';
import { waveConfig } from '../../data/waveConfig';
import { skillDefinitions } from '../../data/skillConfig';
import { getDeployedHeroes } from './HeroStatsSystem';
import { getTeamPower, getRecommendedPowerForStage } from './PowerSystem';
import type { GameState } from '../types';

// Same shape as TargetingSystem's TargetComparator/TargetingStrategies -
// each contributor is independent and knows nothing about the others.
// Adding "prestige" or "challenge modifiers" later means adding one entry
// here; getDifficultyScore and every caller stay unchanged.
export type DifficultyContributor = (state: GameState) => number;

export const difficultyContributors: Record<string, DifficultyContributor> = {
  // Replaces the old wall-clock "elapsedTime" contributor - progress is now
  // paced by the player actually clearing waves (see WaveSystem.ts), not
  // idle time, so stage number is what should make enemies tougher. Never
  // resets across chapters - stage 2-1 is a higher number than 1-10, so
  // difficulty keeps climbing.
  stageNumber: (state) => {
    const stageIndex = (state.wave.chapter - 1) * waveConfig.wavesPerChapter + state.wave.waveInChapter;
    return stageIndex * enemyScalingConfig.stage.weight;
  },
  // Replaces the old separate heroLevel/upgrades contributors - those only
  // ever counted two of the game's several permanent power sources (level,
  // upgrade purchases), leaving equipment, talents, and the ascension shop
  // completely untaxed. A fully-geared, maxed-talent hero could out-scale
  // its own stage by 10x+ and never see a tougher enemy for it (exactly the
  // "挂机碾压" report this replaces). PowerSystem.getTeamPower already folds
  // every one of those sources into a single number (it reads the hero's
  // final post-equipment/post-talent/post-ascension-shop attackDamage/maxHp,
  // see HeroStatsSystem.recomputeHeroStats), so comparing it against
  // getRecommendedPowerForStage's pure stage-paced baseline - the same curve
  // enemies themselves scale against - directly measures "how far ahead of
  // the intended curve is this player right now," from any source at once,
  // without needing to separately model each one here. 0 at or under the
  // intended pace (no penalty for playing "on curve"), grows unbounded above
  // it.
  overperformance: (state) => {
    const recommended = getRecommendedPowerForStage(state.wave);
    if (recommended <= 0) {
      return 0;
    }
    const ratio = Math.max(0, getTeamPower(state) / recommended - 1);
    return ratio * enemyScalingConfig.overperformance.weight;
  },
  // Equipped skills (HeroState.equippedSkillIds, see HeroSystem.equipSkill)
  // deal damage on top of autoattacks entirely separately from
  // attackDamage/maxHp, so they're invisible to getTeamPower/overperformance
  // above - a hero standing still with 4 strong skills equipped reads as no
  // stronger than one with none equipped by that measure alone. Approximates
  // each equipped skill's sustained single-target DPS multiplier
  // (damageMultiplier * targetCount / cooldownSeconds - see skillConfig.ts)
  // and sums them; deliberately coarse (doesn't model aoeDamage's radius
  // hitting more than targetCount enemies at once) since this only needs to
  // meaningfully tax "has skills equipped and off cooldown," not perfectly
  // price every cast.
  skillDps: (state) => {
    const totalSkillDps = getDeployedHeroes(state).reduce((sum, hero) => {
      const heroDps = hero.equippedSkillIds.reduce((heroSum, skillId) => {
        const definition = skillDefinitions[skillId];
        if (!definition) {
          return heroSum;
        }
        return heroSum + (definition.damageMultiplier * (definition.targetCount ?? 1)) / definition.cooldownSeconds;
      }, 0);
      return sum + heroDps;
    }, 0);
    return totalSkillDps * enemyScalingConfig.skillDps.weight;
  },
  // Future: prestige: (state) => state.prestige.level * enemyScalingConfig.prestige.weight,
  // Future: challengeModifiers: (state) => sum of active modifier bonuses,
};

export function getDifficultyScore(state: GameState): number {
  return Object.values(difficultyContributors).reduce((sum, contributor) => sum + contributor(state), 0);
}
