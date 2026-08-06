import { firstSkillUnlockLevel } from './milestoneConfig';

// Before the hero's first skill unlocks, the field stays sparse - slower
// spawns, fewer enemies alive at once - so early combat (now resolved in
// 1-2 hits per enemy, see enemyConfig.ts) never turns into a crowd. `ramped`
// is today's steady-state pace once skills start carrying the difficulty.
export const spawnPacingTiers = {
  early: { spawnIntervalSeconds: 4, maxConcurrentEnemies: 2 },
  ramped: { spawnIntervalSeconds: 2, maxConcurrentEnemies: 5 },
};

export function getSpawnPacing(heroLevel: number) {
  return heroLevel < firstSkillUnlockLevel ? spawnPacingTiers.early : spawnPacingTiers.ramped;
}
