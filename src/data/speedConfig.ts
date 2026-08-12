// Player-facing game-speed tiers (see BattleScreen.tsx's speed buttons) -
// distinct from DebugPanel's debugSetSpeed, which offers every multiplier
// unconditionally for testing. 1x is always available; faster tiers unlock
// progressively by global wave, same "剥洋葱" pacing
// unlockConditionConfig.panelUnlockWave already uses for panels, so speed
// itself becomes a paced-in reward rather than available from wave 1 (which
// would undercut the early game's own pacing). 3x is a further-out stretch
// tier for a run that's already deep in - not requested outright, added
// since 2x alone felt like an odd place to stop.
export interface SpeedTier {
  multiplier: number;
  requiredWave: number;
}

export const speedTiers: SpeedTier[] = [
  { multiplier: 1, requiredWave: 0 },
  { multiplier: 2, requiredWave: 10 },
  { multiplier: 3, requiredWave: 30 },
];
