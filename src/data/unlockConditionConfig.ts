import type { UpgradeableStat } from './heroConfig';

// Shared by heroRosterConfig/petRosterConfig. A roster entry with any
// unlockConditions is condition-locked: excluded from the gacha pool (see
// GachaSystem.pickRosterEntryByRarity) and only obtainable once every
// condition in the array is met (see UnlockSystem) - "先解锁A再让A/账号
// 达到某个程度才能解锁B" chains are just `requiresHero` + a second
// condition entry in the same array, no separate chain concept needed.
export type UnlockCondition =
  // Prerequisite hero must already be unlocked.
  | { type: 'requiresHero'; heroId: string }
  // Prerequisite pet must already be unlocked.
  | { type: 'requiresPet'; petId: string }
  // A specific hero (usually the prerequisite above) must reach this level.
  | { type: 'heroLevel'; heroId: string; level: number }
  // A global upgrade stat (see heroConfig.heroUpgradeConfig) must reach this
  // many purchased levels - the "某个能力多少level" case.
  | { type: 'globalUpgradeLevel'; stat: UpgradeableStat; level: number }
  // Lifetime gold spent (see GameState.goldSpentTotal) must reach this total.
  | { type: 'goldSpent'; amount: number }
  // Account ascension level must reach this value.
  | { type: 'ascensionLevel'; level: number };
