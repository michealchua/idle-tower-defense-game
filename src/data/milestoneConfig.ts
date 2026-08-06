export type MilestoneRewardKind = 'visualEvolution' | 'passiveUnlock' | 'heroEvolution';

export interface MilestoneReward {
  kind: MilestoneRewardKind;
  id: string;
}

export interface MilestoneDefinition {
  level: number;
  rewards: MilestoneReward[];
}

// Each entry only says WHEN a level is reached and WHAT KIND of reward(s) it
// grants - never the reward's actual behavior. A future passive/evolution
// system reads `id` out of hero.unlockedMilestoneIds and decides what that id
// does; adding a new milestone here never requires touching LevelSystem.
//
// Skill unlocks used to live here too, but every hero unlocked the same 3
// skills at the same levels - now each hero has its own skillUnlocks table
// (see heroRosterConfig.ts), applied directly in LevelSystem.tickHeroLevelUp
// into hero.unlockedSkillIds instead of this shared array.
export const milestoneDefinitions: MilestoneDefinition[] = [
  { level: 5, rewards: [{ kind: 'visualEvolution', id: 'visual-tier-2' }] },
  { level: 10, rewards: [{ kind: 'visualEvolution', id: 'visual-tier-3' }] },
  { level: 15, rewards: [{ kind: 'visualEvolution', id: 'visual-tier-4' }] },
  { level: 20, rewards: [{ kind: 'visualEvolution', id: 'visual-tier-5' }] },
];

// The level where a hero's first skill comes online - every hero's
// skillUnlocks[0].level in heroRosterConfig.ts is this value. DifficultySystem
// and SpawnSystem both gate their ramp-up on this instead of a hardcoded 5,
// so retuning it can't silently desync "when it gets harder" from "when the
// player got a tool to handle harder".
export const firstSkillUnlockLevel = 5;

export function getVisualTierForLevel(level: number): number {
  let tier = 1;

  for (const milestone of milestoneDefinitions) {
    if (milestone.level > level) {
      continue;
    }
    if (milestone.rewards.some((reward) => reward.kind === 'visualEvolution')) {
      tier += 1;
    }
  }

  return tier;
}
