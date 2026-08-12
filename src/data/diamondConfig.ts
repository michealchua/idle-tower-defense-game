import type { BossKind } from './waveConfig';
import { gachaPullConfig } from './gachaConfig';

// Diamonds are the premium currency - unlike gold there is no passive
// income, only discrete rewards for clearing content (see DamageSystem.
// handleDeath, WaveSystem.advanceToNextWave, AscensionSystem.ascend).
// Every source in this file was found to add up to diamonds being too easy
// to accumulate (compounded by the premium gacha pool also being too
// generous - see gachaConfig.ts's premiumPullWeight rebalance) - halved
// across the board rather than singling one source out, so no single reward
// stands out as disproportionately stingy relative to the rest.
export const diamondRewardConfig: Record<BossKind, number> = {
  miniboss: 2,
  boss: 10,
};

// Granted once per chapter clear (i.e. every time WaveSystem.
// advanceToNextWave rolls waveInChapter back to 1) - scales slowly with
// chapter number so later, harder chapters pay out more.
export const diamondChapterClearConfig = {
  baseReward: 15,
  rewardGrowthPerChapter: 2.5,
};

export function getDiamondChapterClearReward(clearedChapter: number): number {
  return diamondChapterClearConfig.baseReward + (clearedChapter - 1) * diamondChapterClearConfig.rewardGrowthPerChapter;
}

export const diamondsPerAscend = 150;

// Direct exchange, diamonds -> gold - the "universal fallback use" for
// diamonds once premium pulls/breakthroughs aren't needed. Fixed chunk size
// (not a free-form amount) to keep the UI a single button.
export const diamondExchangeConfig = {
  diamondsPerExchange: 10,
  goldPerExchange: 5000,
};

// 每日登入奖励 - granted once per calendar day on first load (see
// GachaSystem.tickDailyLoginReward). Reuses pullCostDiamonds instead of a
// hardcoded number so it automatically stays in sync if that cost is
// retuned - same amount GachaSystem.tickGachaWelcomeBonus grants (half a
// premium 10-pull's cost each, since the diamond economy pass halved every
// source here rather than just this one).
export const dailyLoginRewardConfig = {
  diamonds: gachaPullConfig.pullCostDiamonds * 5,
};
