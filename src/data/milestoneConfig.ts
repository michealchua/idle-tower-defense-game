export type MilestoneRewardKind = 'visualEvolution' | 'skillUnlock' | 'passiveUnlock' | 'heroEvolution';

export interface MilestoneReward {
  kind: MilestoneRewardKind;
  id: string;
}

export interface MilestoneDefinition {
  level: number;
  rewards: MilestoneReward[];
}

// Each entry only says WHEN a level is reached and WHAT KIND of reward(s) it
// grants - never the reward's actual behavior. A future skill/passive/evolution
// system reads `id` out of hero.unlockedMilestoneIds and decides what that id
// does; adding a new milestone here never requires touching LevelSystem.
export const milestoneDefinitions: MilestoneDefinition[] = [
  {
    level: 5,
    rewards: [
      { kind: 'visualEvolution', id: 'visual-tier-2' },
      { kind: 'skillUnlock', id: 'skill-fireball' },
    ],
  },
  {
    level: 10,
    rewards: [
      { kind: 'visualEvolution', id: 'visual-tier-3' },
      { kind: 'skillUnlock', id: 'skill-meteor' },
    ],
  },
  {
    level: 15,
    rewards: [
      { kind: 'visualEvolution', id: 'visual-tier-4' },
      { kind: 'skillUnlock', id: 'skill-lightning' },
    ],
  },
  { level: 20, rewards: [{ kind: 'visualEvolution', id: 'visual-tier-5' }] },
];

// The level where the hero's first skill comes online. DifficultySystem and
// SpawnSystem both gate their ramp-up on this instead of a hardcoded 5, so
// reordering/adding milestones can't silently desync "when it gets harder"
// from "when the player got a tool to handle harder".
export const firstSkillUnlockLevel =
  milestoneDefinitions.find((definition) => definition.rewards.some((reward) => reward.kind === 'skillUnlock'))
    ?.level ?? 1;

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
