// Placeholder squad cap, tune later. How many unlocked heroes can be
// fielded in combat simultaneously - everything beyond this stays in the
// collection (still gains levels/star-ups when later deployed) but doesn't
// fight, render, or gain exp until the player deploys it. See
// HeroSystem.deployHero/undeployHero. Pets have no such cap - every owned
// pet is always active, see HeroStatsSystem.computePetPassiveBonuses.
//
// This is the castle level-1 baseline - castleConfig.ts's
// getMaxDeployedHeroes adds more slots on top (up to its hard cap) as the
// castle is upgraded, so the actual live cap is always >= what's defined
// here.
export const squadConfig = {
  maxDeployedHeroes: 5,
};
