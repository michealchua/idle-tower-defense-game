import { dailyQuestConfig, dailyQuestIds, type DailyQuestId } from '../../data/dailyQuestConfig';
import type { GameState } from '../types';

// Same "ISO date, local, null means never" contract as GachaSystem.
// tickDailyLoginReward - called every GameLoop tick; the moment the local
// calendar day changes, every quest's progress/claimed state wipes back to
// 0/false together. A brand new save's dailyQuestDate starts null, which
// never equals a real date string, so its very first tick already counts as
// day one and seeds progress at 0 - no separate first-run case needed.
export function tickDailyQuestReset(state: GameState): void {
  const today = new Date().toISOString().slice(0, 10);
  if (state.dailyQuestDate === today) {
    return;
  }
  state.dailyQuestDate = today;
  for (const id of dailyQuestIds) {
    state.dailyQuestProgress[id] = 0;
    state.dailyQuestClaimed[id] = false;
  }
}

// Capped at the quest's own target - progress past 100% has nothing to show
// for it, and this keeps the stored number meaningful as a fraction in the
// UI without a separate min() at every render site.
export function incrementDailyQuestProgress(state: GameState, id: DailyQuestId, amount = 1): void {
  const target = dailyQuestConfig[id].targetAmount;
  state.dailyQuestProgress[id] = Math.min(target, (state.dailyQuestProgress[id] ?? 0) + amount);
}

export function claimDailyQuest(state: GameState, id: DailyQuestId): boolean {
  const def = dailyQuestConfig[id];
  const progress = state.dailyQuestProgress[id] ?? 0;
  if (state.dailyQuestClaimed[id] || progress < def.targetAmount) {
    return false;
  }
  state.dailyQuestClaimed[id] = true;
  state.diamonds += def.rewardDiamonds;
  return true;
}
