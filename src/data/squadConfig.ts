// Placeholder squad caps, tune later. How many unlocked heroes/pets can be
// fielded in combat simultaneously - everything beyond this stays in the
// collection (still gains levels/star-ups when later deployed) but doesn't
// fight, render, or gain exp until the player deploys it. See
// HeroSystem.deployHero/undeployHero and PetSystem.deployPet/undeployPet.
//
// These are the castle level-1 baseline - castleConfig.ts's
// getMaxDeployedHeroes/getMaxDeployedPets/getMaxDeployedTowers add more slots
// on top as the castle is upgraded, so the actual live cap is always >= what's
// defined here.
export const squadConfig = {
  maxDeployedHeroes: 5,
  maxDeployedPets: 3,
  // Towers are new content (see TowerSystem.ts) - 1 free slot from the start
  // so the feature is immediately usable without requiring a castle upgrade
  // first.
  baseTowerSlots: 1,
};
