// New hero data architecture (design doc step 1).
// Replaces the old "one shared stat table" / "100 flat hero literals" model
// from heroConfig.ts + heroRosterConfig.ts. Those files are untouched for
// now - this module is not wired into HeroSystem/HeroStatsSystem/etc. yet,
// that migration is a later step.

/** The 8 base classes every hero belongs to. */
export enum HeroClass {
  Warrior = 'warrior',
  Paladin = 'paladin',
  Mage = 'mage',
  Archer = 'archer',
  Assassin = 'assassin',
  Summoner = 'summoner',
  Priest = 'priest',
  Special = 'special',
}

export const HERO_CLASSES: readonly HeroClass[] = [
  HeroClass.Warrior,
  HeroClass.Paladin,
  HeroClass.Mage,
  HeroClass.Archer,
  HeroClass.Assassin,
  HeroClass.Summoner,
  HeroClass.Priest,
  HeroClass.Special,
];

/** Independently-tracked base attributes - never shared by reference between heroes. */
export interface HeroBaseStats {
  hp: number;
  attack: number;
  defense: number;
  attackSpeed: number;
  crit: number;
}

/**
 * Reference to a skill definition (skillConfig.ts's SkillDefinition.id) plus
 * whatever this slot needs to track independently per hero instance (e.g.
 * current rank once skill leveling exists). Kept minimal for step 1.
 */
export interface SkillSlot {
  skillId: string | null;
  unlocked: boolean;
}

/** 1 base skill + 2-3 growth skills, per hero. */
export interface HeroSkillLoadout {
  baseSkill: SkillSlot;
  growthSkills: SkillSlot[];
}

/** One branch in a hero's evolution tree. Placeholder shape - filled in when evolution is designed. */
export interface EvolutionPathDefinition {
  id: string;
  nameKey: string;
  resultClass: HeroClass;
  statMultiplier: HeroBaseStats;
  skillUnlock: SkillSlot | null;
}

/** 2-3 evolution paths reserved per hero. */
export interface EvolutionTree {
  paths: EvolutionPathDefinition[];
}

/**
 * Static, author-time template for a hero. Immutable - never mutate a
 * template directly, always go through HeroFactory.createHero which deep
 * clones it into a HeroInstance first.
 */
export interface HeroTemplate {
  id: string;
  nameKey: string;
  heroClass: HeroClass;
  baseStats: HeroBaseStats;
  skills: HeroSkillLoadout;
  evolution: EvolutionTree;
}

/**
 * Runtime hero data - the deep-cloned, independently-owned copy produced by
 * HeroFactory.createHero. Two instances built from the same template never
 * share any nested object/array reference, so mutating one (leveling up,
 * unlocking a skill, picking an evolution path) can never leak into another.
 */
export interface HeroInstance {
  templateId: string;
  instanceId: string;
  nameKey: string;
  heroClass: HeroClass;
  baseStats: HeroBaseStats;
  skills: HeroSkillLoadout;
  evolution: EvolutionTree;
}
