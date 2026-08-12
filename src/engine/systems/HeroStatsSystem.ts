import { heroBaseConfig, heroLevelConfig, heroUpgradeConfig, type UpgradeableStat } from '../../data/heroConfig';
import { getHeroDefinition, type HeroDefinition } from '../../data/heroRosterConfig';
import { getPetDefinition } from '../../data/petRosterConfig';
import { evolutionConfig } from '../../data/evolutionConfig';
import { getAscensionPowerMultiplier } from '../../data/ascensionConfig';
import { starBonusPerStar } from '../../data/gachaConfig';
import { getEquipmentMainStatValue, getEquipmentSetStatBonuses } from '../../data/equipmentConfig';
import { getVisualTierForLevel } from '../../data/milestoneConfig';
import { getTalentFlatBonus, getTalentMultiplier } from '../../data/talentConfig';
import { getAscensionShopFlatBonus, getAscensionShopMultiplier } from '../../data/ascensionShopConfig';
import { getBondEffects } from '../../data/bondConfig';
import type { GameState, HeroState } from '../types';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

// The active squad - combat, skills, exp gain, and rendering all read this
// subset instead of the full collection (state.heroes), which also holds
// benched heroes. See HeroSystem.deployHero. Pets have no such
// deployed/benched split - every owned pet is always active, see
// computePetPassiveBonuses below.
export function getDeployedHeroes(state: GameState): HeroState[] {
  return state.heroes.filter((hero) => state.deployedHeroIds.includes(hero.id));
}

// Shared by DifficultySystem/SpawnSystem (use the strongest hero as "how far
// has this player gotten") and AscensionSystem (ascension eligibility).
// Deployed-only so a strong benched hero can't inflate spawn difficulty or
// unlock ascension for a squad that isn't actually that strong.
export function getStrongestHeroLevel(state: GameState): number {
  return getDeployedHeroes(state).reduce((max, hero) => Math.max(max, hero.level), 0);
}

// Per-hero gear (see HeroState.equipment/EquipmentSystem.ts) - each hero's
// bonus is computed from their own loadout only, plus whatever set bonuses
// (equipmentConfig.equipmentSets) that loadout currently unlocks.
function computeHeroEquipmentBonuses(hero: HeroState): Partial<Record<UpgradeableStat, number>> {
  const bonuses: Partial<Record<UpgradeableStat, number>> = {};
  for (const item of Object.values(hero.equipment)) {
    if (!item) {
      continue;
    }
    const mainStatValue = getEquipmentMainStatValue(item.rarity, item.value, item.starLevel);
    bonuses[item.stat] = (bonuses[item.stat] ?? 0) + mainStatValue;
    for (const substat of item.substats) {
      bonuses[substat.stat] = (bonuses[substat.stat] ?? 0) + substat.value;
    }
  }
  for (const [stat, value] of Object.entries(getEquipmentSetStatBonuses(hero.equipment)) as [UpgradeableStat, number][]) {
    bonuses[stat] = (bonuses[stat] ?? 0) + value;
  }
  return bonuses;
}

// Every owned pet contributes its passive bonus team-wide - pets don't need
// to be "deployed" (no such concept for pets anymore, see PetSystem.ts).
function computePetPassiveBonuses(state: GameState): Partial<Record<UpgradeableStat, number>> {
  const bonuses: Partial<Record<UpgradeableStat, number>> = {};
  for (const pet of state.pets) {
    const definition = getPetDefinition(pet.id);
    for (const [stat, value] of Object.entries(definition.passiveBonus)) {
      const key = stat as UpgradeableStat;
      bonuses[key] = (bonuses[key] ?? 0) + (value ?? 0);
    }
  }
  return bonuses;
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

// A hero's base statMultiplier, boosted by its chosen 分支进化 branch (if
// any) - see heroRosterConfig.ts's HeroEvolutionBranch.statMultiplier doc
// comment. Still just the base multiplier for a hero that hasn't evolved
// yet (evolutionBranchId null), so this is safe to call unconditionally.
function getEffectiveStatMultiplier(definition: HeroDefinition, hero: HeroState): Record<UpgradeableStat, number> {
  const branch = hero.evolutionBranchId
    ? definition.evolutionBranches.find((candidate) => candidate.id === hero.evolutionBranchId)
    : undefined;
  if (!branch) {
    return definition.statMultiplier;
  }
  return {
    attackDamage: definition.statMultiplier.attackDamage * branch.statMultiplier.attackDamage,
    maxHp: definition.statMultiplier.maxHp * branch.statMultiplier.maxHp,
    attackSpeed: definition.statMultiplier.attackSpeed * branch.statMultiplier.attackSpeed,
    criticalChance: definition.statMultiplier.criticalChance * branch.statMultiplier.criticalChance,
  };
}

// The single place hero combat/HP stats are written. Called after any input
// changes: level-up, per-hero upgrade purchase, equip/unequip/sell, hero/pet
// unlock, ascend. Also refreshes pets (see recomputePetStats) so every
// call site only has to remember one function.
export function recomputeHeroStats(state: GameState): void {
  const petBonus = computePetPassiveBonuses(state);
  // Talent tree (talentConfig.ts) - permanent, ascension-surviving
  // percentage bonuses spent with skill points, applied as a final
  // multiplier/flat-add on top of everything else so the formula above
  // never needs to know the talent tree exists.
  const talentAttackMultiplier = getTalentMultiplier(state.talentLevels, 'attackDamage');
  const talentMaxHpMultiplier = getTalentMultiplier(state.talentLevels, 'maxHp');
  const talentCritBonus = getTalentFlatBonus(state.talentLevels, 'criticalChance');
  // Ascension shop (ascensionShopConfig.ts) - same "final multiplier/flat-add"
  // treatment as the talent tree, spent with ascensionPoints instead of
  // skillPoints. Never reset by ascend() itself (see AscensionSystem.ascend).
  const ascensionAttackMultiplier = getAscensionShopMultiplier(state.ascensionShopLevels, 'attackDamage');
  const ascensionMaxHpMultiplier = getAscensionShopMultiplier(state.ascensionShopLevels, 'maxHp');
  const ascensionCritBonus = getAscensionShopFlatBonus(state.ascensionShopLevels, 'criticalChance');
  // Bond (羁绊) synergy (bondConfig.ts) - only counts currently-deployed
  // heroes; unlike the talent tree, each bond feeds a different mechanic
  // (attackDamage/maxHp/critChance/attackSpeed here, skill damage/heal power/
  // pet damage/gold-exp gain elsewhere - see BondEffectId's doc comment).
  const bondEffects = getBondEffects(state.deployedHeroIds);
  // "升华相对论" (ascensionConfig.ts) - the exponential factor that keeps
  // TTK constant across ascensions by scaling hero damage output and enemy
  // maxHp (see Enemy.createEnemy) by the same amount.
  const ascensionPowerMultiplier = getAscensionPowerMultiplier(state.ascensionLevel);

  for (const hero of state.heroes) {
    const equipmentBonus = computeHeroEquipmentBonuses(hero);
    const template = getHeroDefinition(hero.id);
    const effectiveStatMultiplier = getEffectiveStatMultiplier(template, hero);
    const powerMultiplier = getEvolutionMultiplier(hero.level) * getStarMultiplier(state.heroStars, hero.id);
    const levelSteps = hero.level - 1;
    const oldMaxHp = hero.maxHp;

    const attackDamage =
      heroBaseConfig.attackDamage * effectiveStatMultiplier.attackDamage * powerMultiplier +
      levelSteps * heroLevelConfig.perLevel.attackDamage +
      hero.upgrades.attackDamage * heroUpgradeConfig.attackDamage.valuePerLevel +
      (equipmentBonus.attackDamage ?? 0) +
      (petBonus.attackDamage ?? 0);

    const maxHp =
      heroBaseConfig.maxHp * effectiveStatMultiplier.maxHp * powerMultiplier +
      levelSteps * heroLevelConfig.perLevel.maxHp +
      hero.upgrades.maxHp * heroUpgradeConfig.maxHp.valuePerLevel +
      (equipmentBonus.maxHp ?? 0) +
      (petBonus.maxHp ?? 0);

    const attackSpeedBeforeBond =
      heroBaseConfig.attackSpeed * effectiveStatMultiplier.attackSpeed +
      levelSteps * heroLevelConfig.perLevel.attackSpeed +
      hero.upgrades.attackSpeed * heroUpgradeConfig.attackSpeed.valuePerLevel +
      (equipmentBonus.attackSpeed ?? 0) +
      (petBonus.attackSpeed ?? 0);
    const attackSpeed = attackSpeedBeforeBond * bondEffects.attackSpeedMultiplier;

    const criticalChanceRaw =
      heroBaseConfig.criticalChance * effectiveStatMultiplier.criticalChance +
      hero.upgrades.criticalChance * heroUpgradeConfig.criticalChance.valuePerLevel +
      (equipmentBonus.criticalChance ?? 0) +
      (petBonus.criticalChance ?? 0);
    const criticalChanceMax = heroUpgradeConfig.criticalChance.maxValue;
    const criticalChanceBeforeTalent =
      criticalChanceMax === undefined ? criticalChanceRaw : Math.min(criticalChanceRaw, criticalChanceMax);
    const critBonus = talentCritBonus + ascensionCritBonus + bondEffects.criticalChanceBonus;
    const criticalChance =
      criticalChanceMax === undefined
        ? criticalChanceBeforeTalent + critBonus
        : Math.min(criticalChanceBeforeTalent + critBonus, criticalChanceMax);

    const finalAttackDamage =
      attackDamage *
      talentAttackMultiplier *
      ascensionAttackMultiplier *
      bondEffects.attackDamageMultiplier *
      ascensionPowerMultiplier;
    const finalMaxHp = maxHp * talentMaxHpMultiplier * ascensionMaxHpMultiplier * bondEffects.maxHpMultiplier;

    hero.attackDamage = finalAttackDamage;
    hero.maxHp = finalMaxHp;
    hero.attackSpeed = attackSpeed;
    // Fixed - see heroBaseConfig.attackRange's comment. Reassigned here
    // (rather than left untouched from createHero) only for consistency;
    // it never actually changes.
    hero.attackRange = heroBaseConfig.attackRange;
    hero.criticalChance = criticalChance;
    // Leveling/upgrading/equipping a maxHp increase heals by the same
    // delta, same felt behavior as the old per-system mutation code had,
    // just computed once instead of duplicated three times.
    hero.currentHp = clamp(hero.currentHp + (finalMaxHp - oldMaxHp), 1, finalMaxHp);
  }

  recomputePetStats(state);
}

// Pets don't level in v1 - their only inputs are their fixed template, and
// the same attackDamage talent/ascension-shop bonuses heroes get (both buff
// "your army," not just heroes).
export function recomputePetStats(state: GameState): void {
  const talentAttackMultiplier = getTalentMultiplier(state.talentLevels, 'attackDamage');
  const ascensionAttackMultiplier = getAscensionShopMultiplier(state.ascensionShopLevels, 'attackDamage');
  const ascensionPowerMultiplier = getAscensionPowerMultiplier(state.ascensionLevel);
  // summoner bond (bondConfig.ts) - "召唤军团可强化召唤机制" (plan section
  // 14), applied here rather than HeroStatsSystem's hero loop since pets are
  // what it actually boosts.
  const bondPetDamageMultiplier = getBondEffects(state.deployedHeroIds).petDamageMultiplier;

  for (const pet of state.pets) {
    const template = getPetDefinition(pet.id);
    const powerMultiplier =
      getStarMultiplier(state.petStars, pet.id) *
      talentAttackMultiplier *
      ascensionAttackMultiplier *
      bondPetDamageMultiplier *
      ascensionPowerMultiplier;
    pet.attackDamage = template.attackDamage * powerMultiplier;
    pet.attackSpeed = template.attackSpeed;
    pet.attackRange = template.attackRange;
  }
}
