import type { BossKind } from './waveConfig';

// Diamonds are the premium currency - unlike gold there is no passive
// income, only discrete rewards for clearing content (see DamageSystem.
// handleDeath, WaveSystem.advanceToNextWave, AscensionSystem.ascend).
// Placeholder amounts, same "tune later" precedent as every other
// unspecified number in this project.
export const diamondRewardConfig: Record<BossKind, number> = {
  miniboss: 5,
  boss: 20,
};

// Granted once per chapter clear (i.e. every time WaveSystem.
// advanceToNextWave rolls waveInChapter back to 1) - scales slowly with
// chapter number so later, harder chapters pay out more.
export const diamondChapterClearConfig = {
  baseReward: 30,
  rewardGrowthPerChapter: 5,
};

export function getDiamondChapterClearReward(clearedChapter: number): number {
  return diamondChapterClearConfig.baseReward + (clearedChapter - 1) * diamondChapterClearConfig.rewardGrowthPerChapter;
}

export const diamondsPerAscend = 300;

// Direct exchange, diamonds -> gold - the "universal fallback use" for
// diamonds once premium pulls/breakthroughs aren't needed. Fixed chunk size
// (not a free-form amount) to keep the UI a single button.
export const diamondExchangeConfig = {
  diamondsPerExchange: 10,
  goldPerExchange: 5000,
};
