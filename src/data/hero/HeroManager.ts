import { getExpToNextLevel, heroProgressionConfig } from './heroProgressionConfig';
import type { HeroBaseStats, HeroInstance, HeroTemplate } from './heroTypes';
import { HeroFactory } from './HeroFactory';

export interface HeroManagerSaveData {
  version: number;
  heroes: HeroInstance[];
}

const STAT_KEYS: (keyof HeroBaseStats)[] = ['hp', 'attack', 'defense', 'attackSpeed', 'crit'];

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Owns the player's roster of live HeroInstance data and every operation
 * that mutates it (leveling, evolving, save/load). HeroInstance itself stays
 * a plain data shape (see heroTypes.ts) - all business logic lives here so
 * it stays in one auditable place instead of spread across callers.
 */
export class HeroManager {
  private heroes = new Map<string, HeroInstance>();

  addHero(template: HeroTemplate): HeroInstance {
    const hero = HeroFactory.createHero(template);
    this.heroes.set(hero.instanceId, hero);
    return hero;
  }

  getHero(heroId: string): HeroInstance | undefined {
    return this.heroes.get(heroId);
  }

  getAllHeroes(): HeroInstance[] {
    return Array.from(this.heroes.values());
  }

  private requireHero(heroId: string): HeroInstance {
    const hero = this.heroes.get(heroId);
    if (!hero) {
      throw new Error(`HeroManager: unknown hero instance id "${heroId}"`);
    }
    return hero;
  }

  /** Adds EXP and applies as many level-ups as the amount covers (each level-up bumps currentStats). */
  addExp(heroId: string, amount: number): void {
    if (amount <= 0) return;
    const hero = this.requireHero(heroId);
    hero.exp += amount;

    let expToNextLevel = getExpToNextLevel(hero.level);
    while (hero.exp >= expToNextLevel) {
      hero.exp -= expToNextLevel;
      hero.level += 1;
      this.applyLevelUpStatGrowth(hero);
      expToNextLevel = getExpToNextLevel(hero.level);
    }
  }

  private applyLevelUpStatGrowth(hero: HeroInstance): void {
    for (const stat of STAT_KEYS) {
      hero.currentStats[stat] = round3(
        hero.currentStats[stat] + hero.baseStats[stat] * heroProgressionConfig.statGrowthPerLevel,
      );
    }
  }

  /**
   * Applies one evolution node to a hero: validates the level requirement
   * and that it hasn't already been applied, then refreshes currentStats,
   * unlocks/replaces the relevant skill slot, and updates the visual tier.
   * Throws on any validation failure rather than silently no-op-ing.
   */
  applyEvolution(heroId: string, evolutionNodeId: string): void {
    const hero = this.requireHero(heroId);
    const node = hero.evolution.nodes.find((candidate) => candidate.id === evolutionNodeId);
    if (!node) {
      throw new Error(`HeroManager: hero "${heroId}" has no evolution node "${evolutionNodeId}"`);
    }
    if (hero.appliedEvolutionNodeIds.includes(node.id)) {
      throw new Error(`HeroManager: hero "${heroId}" already applied evolution node "${evolutionNodeId}"`);
    }
    if (hero.level < node.requiredLevel) {
      throw new Error(
        `HeroManager: hero "${heroId}" is level ${hero.level}, evolution node "${evolutionNodeId}" requires level ${node.requiredLevel}`,
      );
    }

    for (const stat of STAT_KEYS) {
      hero.currentStats[stat] = round3(hero.currentStats[stat] * node.statMultipliers[stat]);
    }

    if (node.unlockSkillId) {
      this.unlockGrowthSkill(hero, node.unlockSkillId);
    }
    if (node.replaceBaseSkillId) {
      hero.skills.baseSkill = { skillId: node.replaceBaseSkillId, unlocked: true };
    }

    if (node.visualTier !== undefined) {
      hero.visualTier = node.visualTier;
    }
    if (node.spritePath) {
      hero.currentSpritePath = node.spritePath;
    }

    hero.appliedEvolutionNodeIds.push(node.id);
  }

  // Prefers an existing slot pre-wired to this skillId (see
  // warriorTemplates.ts's swordsman growthSkills), falls back to the first
  // empty slot, and only grows the array if neither is available.
  private unlockGrowthSkill(hero: HeroInstance, skillId: string): void {
    const existingSlot = hero.skills.growthSkills.find((slot) => slot.skillId === skillId);
    if (existingSlot) {
      existingSlot.unlocked = true;
      return;
    }
    const emptySlot = hero.skills.growthSkills.find((slot) => slot.skillId === null);
    if (emptySlot) {
      emptySlot.skillId = skillId;
      emptySlot.unlocked = true;
      return;
    }
    hero.skills.growthSkills.push({ skillId, unlocked: true });
  }

  /** Deep-clones every hero into a plain, independently-owned snapshot ready for JSON.stringify/localStorage. */
  toJSON(): HeroManagerSaveData {
    return {
      version: 1,
      heroes: this.getAllHeroes().map((hero) => structuredClone(hero)),
    };
  }

  /** Replaces the current roster with a deep-cloned copy of the saved data (never aliases the caller's objects). */
  fromJSON(data: HeroManagerSaveData): void {
    this.heroes.clear();
    for (const hero of data.heroes) {
      this.heroes.set(hero.instanceId, structuredClone(hero));
    }
  }
}
