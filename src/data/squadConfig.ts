// Placeholder squad cap, tune later. How many unlocked heroes can be
// fielded in combat simultaneously - everything beyond this stays in the
// collection (still gains levels/star-ups when later deployed) but doesn't
// fight, render, or gain exp until the player deploys it. See
// HeroSystem.deployHero/undeployHero. Pets have no such cap - every owned
// pet is always active, see HeroStatsSystem.computePetPassiveBonuses.
export const squadConfig = {
  maxDeployedHeroes: 5,
};

// Replaces the old castle-level-driven slot growth (see git history for
// castleConfig.getMaxDeployedHeroes, removed alongside the rest of the
// castle system) - additional slots now unlock at fixed wave milestones
// instead of a purchasable upgrade, same "剥洋葱" pacing
// unlockConditionConfig.panelUnlockWave already uses for whole panels.
// Four entries exactly fills the gap from the 5-hero baseline up to
// maxDeployedHeroesCap (9).
export const squadSlotUnlockWaves = [15, 30, 50, 80];

// Hard-capped at 9 - the deploy grid/bond system are both designed around a
// 9-hero squad ceiling, so wave-gated growth stops adding slots once it
// gets there instead of growing without bound.
export const maxDeployedHeroesCap = 9;

export function getMaxDeployedHeroes(globalWave: number): number {
  const bonusSlots = squadSlotUnlockWaves.filter((requiredWave) => globalWave >= requiredWave).length;
  return Math.min(maxDeployedHeroesCap, squadConfig.maxDeployedHeroes + bonusSlots);
}
