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
  // Any owned hero's own per-hero upgrade track for this stat (see
  // heroConfig.heroUpgradeConfig/UpgradeSystem.ts) must reach this many
  // purchased levels - the "某个能力多少level" case.
  | { type: 'heroUpgradeLevel'; stat: UpgradeableStat; level: number }
  // Lifetime gold spent (see GameState.goldSpentTotal) must reach this total.
  | { type: 'goldSpent'; amount: number }
  // Account ascension level must reach this value.
  | { type: 'ascensionLevel'; level: number };

// Distinct from UnlockCondition above (that gates individual roster
// entries) - this gates entire peripheral-system panels behind the global
// wave count (see WaveSystem.getGlobalWaveNumber), so the front end reveals
// one system at a time instead of dumping every tab on the player at wave 1.
// 'hero' is deliberately absent from panelUnlockWave: it's the only panel
// open from wave 1, everything else "剥洋葱"-reveals afterward:
//   wave 1-10  -> only HeroPanel (pure tower-defense/upgrade loop)
//   wave 11    -> first chapter's boss (wave 10) just died -> EquipmentPanel
//   wave 20    -> second chapter's boss down -> GachaPanel
//   wave 50    -> fifth chapter's boss down -> PetPanel
//   wave 100   -> mid-fight against the tenth chapter's boss -> AscensionPanel
//                 reveals itself, and the ascend button inside is already
//                 pressable (ascensionConfig.requiredWave is the same 100 -
//                 "所见即所得", see AscensionSystem.canAscend). Panels not
//                 listed here (talent/ascensionShop/codex) are ungated - out
//                 of scope for this pass.
export type PanelId = 'hero' | 'equipment' | 'gacha' | 'pet' | 'ascension' | 'talent' | 'ascensionShop' | 'codex' | 'records';

export const panelUnlockWave: Partial<Record<PanelId, number>> = {
  equipment: 11,
  gacha: 20,
  pet: 50,
  ascension: 100,
};

export function isPanelUnlocked(panelId: PanelId, globalWave: number): boolean {
  const requiredWave = panelUnlockWave[panelId];
  return requiredWave === undefined || globalWave >= requiredWave;
}
