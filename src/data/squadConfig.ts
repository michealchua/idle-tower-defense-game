// Hard-capped at 9 - the deploy grid/bond system are both designed around a
// 9-hero squad ceiling. Every slot is available from wave 1 (see
// getMaxDeployedHeroes below) - this used to unlock gradually at fixed wave
// milestones (squadSlotUnlockWaves, removed), but the 3x3 slot grid
// (mapConfig.layoutSlotPositions) is now always drawn full-size and the
// player explicitly asked for every cell to be usable from the start rather
// than reading as partially locked.
export const maxDeployedHeroesCap = 9;

export function getMaxDeployedHeroes(_globalWave: number): number {
  return maxDeployedHeroesCap;
}

// A fresh wave-1 squad's size, for PowerSystem.getBaselineSquadPower's
// "you're expected to have this much power by stage 1" reference only -
// deliberately NOT maxDeployedHeroesCap. The deploy cap itself stopped
// being wave-gated (see getMaxDeployedHeroes above), but the recommended-
// power curve every stage's difficulty reads against was tuned against a
// 5-hero baseline from the start; changing this to 9 would roughly double
// every stage's recommended power and re-balance the whole game's
// difficulty curve as a side effect of an unrelated UI change, which is out
// of scope here.
export const baselineSquadSize = 5;
