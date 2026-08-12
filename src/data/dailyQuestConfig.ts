// Plan section 28's "活动" - this game has no backend/live-service, so
// there's no server-driven event calendar to plug into. What's genuinely
// buildable offline is a small repeatable daily checklist, same "resets at
// local midnight" contract as diamondConfig.dailyLoginRewardConfig, just
// with three actual objectives instead of a single login tap. See
// DailyQuestSystem.ts for the reset/progress/claim logic.
export type DailyQuestId = 'killEnemies' | 'clearWaves' | 'pullGacha';

export const dailyQuestIds: DailyQuestId[] = ['killEnemies', 'clearWaves', 'pullGacha'];

export interface DailyQuestDefinition {
  id: DailyQuestId;
  targetAmount: number;
  rewardDiamonds: number;
  labelKey: string;
}

// rewardDiamonds halved as part of a wider diamond-economy pass (see
// diamondConfig.ts's doc comment) - diamonds were too easy to accumulate
// overall, not specifically from this source.
export const dailyQuestConfig: Record<DailyQuestId, DailyQuestDefinition> = {
  killEnemies: { id: 'killEnemies', targetAmount: 50, rewardDiamonds: 8, labelKey: 'dailyQuest.killEnemies' },
  clearWaves: { id: 'clearWaves', targetAmount: 3, rewardDiamonds: 10, labelKey: 'dailyQuest.clearWaves' },
  pullGacha: { id: 'pullGacha', targetAmount: 5, rewardDiamonds: 8, labelKey: 'dailyQuest.pullGacha' },
};
