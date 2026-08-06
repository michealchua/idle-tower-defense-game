import { enemyScalingConfig } from '../../data/enemyScalingConfig';
import { waveConfig } from '../../data/waveConfig';
import { getDeployedHeroes, getStrongestHeroLevel } from './HeroStatsSystem';
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
  heroLevel: (state) => (getStrongestHeroLevel(state) - 1) * enemyScalingConfig.level.weight,
  // Sums every deployed hero's own upgrade levels (see HeroState.upgrades) -
  // deployed-only for the same reason getStrongestHeroLevel is: a strong
  // benched hero shouldn't inflate difficulty for a squad that isn't
  // actually fielding it.
  upgrades: (state) => {
    const totalUpgrades = getDeployedHeroes(state).reduce(
      (sum, hero) => sum + Object.values(hero.upgrades).reduce((heroSum, count) => heroSum + count, 0),
      0,
    );
    return totalUpgrades * enemyScalingConfig.upgrades.weight;
  },
  // Future: prestige: (state) => state.prestige.level * enemyScalingConfig.prestige.weight,
  // Future: challengeModifiers: (state) => sum of active modifier bonuses,
};

export function getDifficultyScore(state: GameState): number {
  return Object.values(difficultyContributors).reduce((sum, contributor) => sum + contributor(state), 0);
}
