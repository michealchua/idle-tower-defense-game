import { heroBaseConfig, heroLevelConfig, heroUpgradeConfig, type UpgradeableStat } from '../../data/heroConfig';
import { getHeroDefinition } from '../../data/heroRosterConfig';
import { getPetDefinition } from '../../data/petRosterConfig';
import { ascensionConfig } from '../../data/ascensionConfig';
import { evolutionConfig } from '../../data/evolutionConfig';
import { starBonusPerStar } from '../../data/gachaConfig';
import { getEquipmentMainStatValue } from '../../data/equipmentConfig';
import { getVisualTierForLevel } from '../../data/milestoneConfig';
import { getTalentFlatBonus, getTalentMultiplier } from '../../data/talentConfig';
import type { GameState, HeroState, PetState, TowerState } from '../types';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

// The active squad - combat, skills, exp gain, and rendering all read this
// subset instead of the full collection (state.heroes/state.pets), which
// also holds benched units. See HeroSystem.deployHero/PetSystem.deployPet.
export function getDeployedHeroes(state: GameState): HeroState[] {
  return state.heroes.filter((hero) => state.deployedHeroIds.includes(hero.id));
}

export function getDeployedPets(state: GameState): PetState[] {
  return state.pets.filter((pet) => state.deployedPetIds.includes(pet.id));
}

export function getDeployedTowers(state: GameState): TowerState[] {
  return state.towers.filter((tower) => state.deployedTowerIds.includes(tower.id));
}

// Shared by DifficultySystem/SpawnSystem (use the strongest hero as "how far
// has this player gotten") and AscensionSystem (ascension eligibility).
// Deployed-only so a strong benched hero can't inflate spawn difficulty or
// unlock ascension for a squad that isn't actually that strong.
export function getStrongestHeroLevel(state: GameState): number {
  return getDeployedHeroes(state).reduce((max, hero) => Math.max(max, hero.level), 0);
}

// Equipment is one shared loadout (see EquipmentSystem.ts) applied to every
// deployed hero, not per-hero gear.
function computeEquipmentBonuses(state: GameState): Partial<Record<UpgradeableStat, number>> {
  const bonuses: Partial<Record<UpgradeableStat, number>> = {};
  for (const item of Object.values(state.equipped)) {
    if (!item) {
      continue;
    }
    const mainStatValue = getEquipmentMainStatValue(item.rarity, item.value, item.starLevel);
    bonuses[item.stat] = (bonuses[item.stat] ?? 0) + mainStatValue;
    for (const affix of item.affixes) {
      bonuses[affix.stat] = (bonuses[affix.stat] ?? 0) + affix.value;
    }
  }
  return bonuses;
}

// Only deployed pets contribute their passive bonus team-wide - a benched
// pet is just sitting in the collection.
function computePetPassiveBonuses(state: GameState): Partial<Record<UpgradeableStat, number>> {
  const bonuses: Partial<Record<UpgradeableStat, number>> = {};
  for (const pet of getDeployedPets(state)) {
    const definition = getPetDefinition(pet.id);
    for (const [stat, value] of Object.entries(definition.passiveBonus)) {
      const key = stat as UpgradeableStat;
      bonuses[key] = (bonuses[key] ?? 0) + (value ?? 0);
    }
  }
  return bonuses;
}

export function getAscensionMultiplier(state: GameState): number {
  return 1 + state.ascensionLevel * ascensionConfig.bonusMultiplierPerLevel;
}

// Reuses the visual tier milestoneConfig.ts already gates at levels
// 5/10/15/20 instead of inventing a second level-threshold table - this is
// what turns that tier from purely cosmetic into "进化" with real stat teeth.
function getEvolutionMultiplier(level: number): number {
  return 1 + (getVisualTierForLevel(level) - 1) * evolutionConfig.bonusMultiplierPerTier;
}

function getStarMultiplier(stars: Record<string, number>, id: string): number {
  return 1 + (stars[id] ?? 0) * starBonusPerStar;
}

// The single place hero combat/HP stats are written. Called after any input
// changes: level-up, global upgrade purchase, equip/unequip/sell, hero/pet
// unlock, ascend. Also refreshes pets (see recomputePetStats) so every
// call site only has to remember one function.
export function recomputeHeroStats(state: GameState): void {
  const ascensionMultiplier = getAscensionMultiplier(state);
  const equipmentBonus = computeEquipmentBonuses(state);
  const petBonus = computePetPassiveBonuses(state);
  // Talent tree (talentConfig.ts) - permanent, ascension-surviving
  // percentage bonuses spent with skill points, applied as a final
  // multiplier/flat-add on top of everything else so the formula above
  // never needs to know the talent tree exists.
  const talentAttackMultiplier = getTalentMultiplier(state.talentLevels, 'attackDamage');
  const talentMaxHpMultiplier = getTalentMultiplier(state.talentLevels, 'maxHp');
  const talentCritBonus = getTalentFlatBonus(state.talentLevels, 'criticalChance');

  for (const hero of state.heroes) {
    const template = getHeroDefinition(hero.id);
    const powerMultiplier =
      ascensionMultiplier * getEvolutionMultiplier(hero.level) * getStarMultiplier(state.heroStars, hero.id);
    const levelSteps = hero.level - 1;
    const oldMaxHp = hero.maxHp;

    const attackDamage =
      heroBaseConfig.attackDamage * template.statMultiplier.attackDamage * powerMultiplier +
      levelSteps * heroLevelConfig.perLevel.attackDamage +
      state.globalUpgrades.attackDamage * heroUpgradeConfig.attackDamage.valuePerLevel +
      (equipmentBonus.attackDamage ?? 0) +
      (petBonus.attackDamage ?? 0);

    const maxHp =
      heroBaseConfig.maxHp * template.statMultiplier.maxHp * powerMultiplier +
      levelSteps * heroLevelConfig.perLevel.maxHp +
      state.globalUpgrades.maxHp * heroUpgradeConfig.maxHp.valuePerLevel +
      (equipmentBonus.maxHp ?? 0) +
      (petBonus.maxHp ?? 0);

    const attackSpeed =
      heroBaseConfig.attackSpeed * template.statMultiplier.attackSpeed +
      levelSteps * heroLevelConfig.perLevel.attackSpeed +
      state.globalUpgrades.attackSpeed * heroUpgradeConfig.attackSpeed.valuePerLevel +
      (equipmentBonus.attackSpeed ?? 0) +
      (petBonus.attackSpeed ?? 0);

    const attackRange =
      heroBaseConfig.attackRange * template.statMultiplier.attackRange +
      state.globalUpgrades.attackRange * heroUpgradeConfig.attackRange.valuePerLevel +
      (equipmentBonus.attackRange ?? 0) +
      (petBonus.attackRange ?? 0);

    const criticalChanceRaw =
      heroBaseConfig.criticalChance * template.statMultiplier.criticalChance +
      state.globalUpgrades.criticalChance * heroUpgradeConfig.criticalChance.valuePerLevel +
      (equipmentBonus.criticalChance ?? 0) +
      (petBonus.criticalChance ?? 0);
    const criticalChanceMax = heroUpgradeConfig.criticalChance.maxValue;
    const criticalChanceBeforeTalent =
      criticalChanceMax === undefined ? criticalChanceRaw : Math.min(criticalChanceRaw, criticalChanceMax);
    const criticalChance =
      criticalChanceMax === undefined
        ? criticalChanceBeforeTalent + talentCritBonus
        : Math.min(criticalChanceBeforeTalent + talentCritBonus, criticalChanceMax);

    const finalAttackDamage = attackDamage * talentAttackMultiplier;
    const finalMaxHp = maxHp * talentMaxHpMultiplier;

    hero.attackDamage = finalAttackDamage;
    hero.maxHp = finalMaxHp;
    hero.attackSpeed = attackSpeed;
    hero.attackRange = attackRange;
    hero.criticalChance = criticalChance;
    // Leveling/upgrading/equipping a maxHp increase heals by the same
    // delta, same felt behavior as the old per-system mutation code had,
    // just computed once instead of duplicated three times.
    hero.currentHp = clamp(hero.currentHp + (finalMaxHp - oldMaxHp), 1, finalMaxHp);
  }

  recomputePetStats(state);
}

// Pets don't level in v1 - their only inputs are their fixed template, the
// shared ascension multiplier, and the same attackDamage talent bonus heroes
// get (the talent tree buffs "your army," not just heroes).
export function recomputePetStats(state: GameState): void {
  const ascensionMultiplier = getAscensionMultiplier(state);
  const talentAttackMultiplier = getTalentMultiplier(state.talentLevels, 'attackDamage');

  for (const pet of state.pets) {
    const template = getPetDefinition(pet.id);
    const powerMultiplier = ascensionMultiplier * getStarMultiplier(state.petStars, pet.id) * talentAttackMultiplier;
    pet.attackDamage = template.attackDamage * powerMultiplier;
    pet.attackSpeed = template.attackSpeed;
    pet.attackRange = template.attackRange;
  }
}
