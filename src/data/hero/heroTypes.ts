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

/**
 * One node in a hero's evolution tree/chain (design doc step 2 - evolution
 * changes playstyle/mechanics, not just numbers). A node can either add a
 * new growth skill (unlockSkillId) or outright change the hero's basic
 * attack (replaceBaseSkillId) - both point at a skills/ SkillDefinition.id,
 * at most one should be set per node.
 */
export interface EvolutionNode {
  id: string;
  name: string;
  description: string;
  requiredLevel: number;
  statMultipliers: HeroBaseStats;
  unlockSkillId?: string;
  replaceBaseSkillId?: string;
  /** Static art path for this evolution stage, once art exists. */
  spritePath?: string;
  /** Coarse visual-upgrade tier (0 = base form, 1 = first evolution, ...) for renderers that don't need the actual sprite yet. */
  visualTier?: number;
}

/** 2-3 evolution nodes reserved per hero, ordered by requiredLevel. */
export interface EvolutionTree {
  nodes: EvolutionNode[];
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
