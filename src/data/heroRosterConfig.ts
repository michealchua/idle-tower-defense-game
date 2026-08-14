import type { UpgradeableStat, HeroClass } from './heroConfig';
import type { GachaRarity } from './gachaConfig';
import type { UnlockCondition } from './unlockConditionConfig';

// One 分支进化 (branch evolution) node in the multi-tier tree.
export interface HeroEvolutionBranch {
  id: string;
  nameKey: string;
  // 1-indexed depth in the tree - purely descriptive (nothing reads it for
  // logic; parentBranchId alone determines traversal), kept so content authors
  // can see a node's depth at a glance without counting parent hops.
  tier: number;
  // The tier-(N-1) branch this node extends - null for tier-1 nodes, which
  // hang directly off the hero's base class. HeroSystem.
  // getAvailableEvolutionBranches walks this to find "what can I pick next"
  // from the hero's current evolutionPath tail.
  parentBranchId: string | null;
  // This node's own level gate (replaces the old single global
  // heroEvolutionConfig.unlockLevel) - each tier typically gates higher than
  // the last, but nothing enforces that ordering here.
  unlockLevel: number;
  // The class this branch's hero becomes once chosen - matches the base
  // class for most branches (a mage stays a mage), but nothing stops a
  // branch from shifting it.
  resultClass: HeroClass;
  // Multiplicative boost layered on top of whatever the hero's stat
  // multiplier already was (see getEffectiveStatMultiplier in
  // HeroStatsSystem.ts, which folds every chosen branch in evolutionPath in
  // sequence) - this is what makes evolving "获得大幅属性成长" instead of a
  // cosmetic-only change, compounding tier over tier.
  statMultiplier: Record<UpgradeableStat, number>;
  // Exclusive skill granted immediately on evolving, from skillConfig.ts's
  // pool - added straight into hero.ownedSkillIds by HeroSystem.evolveHero
  // (still has to be manually equipped like any gacha-drawn skill, see
  // HeroState.equippedSkillIds), no separate level gate of its own.
  skillUnlock: { skillId: string };
}

export interface HeroDefinition {
  id: string;
  // Deterministic per roster id (see NameGenerator.generateDeterministicHeroName) -
  // CodexPanel shows this for every hero, owned or not, instead of a rarity+
  // number placeholder for the ones not yet unlocked. Hero.ts's createHero
  // copies this same value onto the actual HeroState.name once unlocked, so
  // it never changes at that point.
  name: string;
  // Drives the name-color styling (CanvasRenderer's RARITY_NAME_COLOR,
  // HeroPanel's rarity border) - no longer drives gacha odds/pull weight
  // since heroes are no longer pulled via gacha (single fixed protagonist).
  rarity: GachaRarity;
  // Multiplies heroBaseConfig per stat, giving the protagonist a distinct
  // flavor (glass cannon, tanky, balanced) without a separate stat table.
  statMultiplier: Record<UpgradeableStat, number>;
  // Archetype tag (heroConfig.ts's HeroClass) - drives which evolutionBranches
  // this hero can pick from. Starts 'warrior'; evolution can shift it (see
  // HeroEvolutionBranch.resultClass).
  class: HeroClass;
  // Every node in this hero's evolution tree, flat (not nested) - see
  // HeroSystem.getAvailableEvolutionBranches for how a specific hero's
  // evolutionPath walks it tier by tier.
  evolutionBranches: HeroEvolutionBranch[];
  // Undefined = always available. Present = condition-locked (see
  // UnlockSystem) - unused now that there's no gacha pool to exclude this
  // single hero from, kept only so the type shape doesn't ripple elsewhere
  // before Phase C removes hero-gacha entirely.
  unlockConditions?: UnlockCondition[];
}

// Tier-1 nodes' level gate - exported for tutorialConfig.ts's "evolution
// ready" step, since heroEvolutionConfig's old single global gate no longer
// exists (each node now carries its own unlockLevel).
export const PROTAGONIST_FIRST_EVOLUTION_LEVEL = 15;

// 3-tier evolution tree: 2 tier-1 nodes off the base warrior class, each
// splitting into 2 tier-2 nodes (4 total), each of those capping out in one
// tier-3 node (4 total) - 10 nodes, matching the redesign plan's "10-14
// nodes, 3 tiers" target. Flat array (not nested) - HeroSystem.
// getAvailableEvolutionBranches filters by parentBranchId to walk it.
// resultClass drifts across tiers (warrior → mage/paladin/special) so the
// tree actually delivers on "starts warrior, becomes many classes over
// time" rather than just restatting the same class repeatedly.
const protagonistEvolutionTree: HeroEvolutionBranch[] = [
  // --- Tier 1 (Lv.15, off the base warrior class) ---
  {
    id: 'warrior-berserker',
    nameKey: 'evolutionBranch.warriorBerserker',
    tier: 1,
    parentBranchId: null,
    unlockLevel: PROTAGONIST_FIRST_EVOLUTION_LEVEL,
    resultClass: 'warrior',
    statMultiplier: { attackDamage: 1.35, maxHp: 0.9, attackSpeed: 1.15, criticalChance: 1.2 },
    skillUnlock: { skillId: 'skill-earthquake' },
  },
  {
    id: 'warrior-guardian',
    nameKey: 'evolutionBranch.warriorGuardian',
    tier: 1,
    parentBranchId: null,
    unlockLevel: PROTAGONIST_FIRST_EVOLUTION_LEVEL,
    resultClass: 'warrior',
    statMultiplier: { attackDamage: 0.95, maxHp: 1.45, attackSpeed: 0.95, criticalChance: 1.0 },
    skillUnlock: { skillId: 'skill-guardianPulse' },
  },

  // --- Tier 2 (Lv.30) ---
  {
    id: 'berserker-warlord',
    nameKey: 'evolutionBranch.berserkerWarlord',
    tier: 2,
    parentBranchId: 'warrior-berserker',
    unlockLevel: 30,
    resultClass: 'warrior',
    statMultiplier: { attackDamage: 1.3, maxHp: 0.95, attackSpeed: 1.1, criticalChance: 1.15 },
    skillUnlock: { skillId: 'skill-voidChain' },
  },
  {
    id: 'berserker-bloodmage',
    nameKey: 'evolutionBranch.berserkerBloodmage',
    tier: 2,
    parentBranchId: 'warrior-berserker',
    unlockLevel: 30,
    resultClass: 'mage',
    statMultiplier: { attackDamage: 1.25, maxHp: 1.05, attackSpeed: 1.05, criticalChance: 1.1 },
    skillUnlock: { skillId: 'skill-meteor' },
  },
  {
    id: 'guardian-paladin',
    nameKey: 'evolutionBranch.guardianPaladin',
    tier: 2,
    parentBranchId: 'warrior-guardian',
    unlockLevel: 30,
    resultClass: 'paladin',
    statMultiplier: { attackDamage: 1.1, maxHp: 1.3, attackSpeed: 1.0, criticalChance: 1.05 },
    skillUnlock: { skillId: 'skill-sanctuary' },
  },
  {
    id: 'guardian-sentinel',
    nameKey: 'evolutionBranch.guardianSentinel',
    tier: 2,
    parentBranchId: 'warrior-guardian',
    unlockLevel: 30,
    resultClass: 'special',
    statMultiplier: { attackDamage: 0.95, maxHp: 1.4, attackSpeed: 0.9, criticalChance: 1.0 },
    skillUnlock: { skillId: 'skill-novaBlast' },
  },

  // --- Tier 3 (Lv.50, capstone) ---
  {
    id: 'warlord-titan',
    nameKey: 'evolutionBranch.warlordTitan',
    tier: 3,
    parentBranchId: 'berserker-warlord',
    unlockLevel: 50,
    resultClass: 'warrior',
    statMultiplier: { attackDamage: 1.4, maxHp: 1.2, attackSpeed: 1.1, criticalChance: 1.25 },
    skillUnlock: { skillId: 'skill-thornWhip' },
  },
  {
    id: 'bloodmage-archmage',
    nameKey: 'evolutionBranch.bloodmageArchmage',
    tier: 3,
    parentBranchId: 'berserker-bloodmage',
    unlockLevel: 50,
    resultClass: 'mage',
    statMultiplier: { attackDamage: 1.45, maxHp: 1.1, attackSpeed: 1.15, criticalChance: 1.2 },
    skillUnlock: { skillId: 'skill-iceBurst' },
  },
  {
    id: 'paladin-highlord',
    nameKey: 'evolutionBranch.paladinHighlord',
    tier: 3,
    parentBranchId: 'guardian-paladin',
    unlockLevel: 50,
    resultClass: 'paladin',
    statMultiplier: { attackDamage: 1.15, maxHp: 1.35, attackSpeed: 1.05, criticalChance: 1.1 },
    skillUnlock: { skillId: 'skill-phoenixGrace' },
  },
  {
    id: 'sentinel-warden',
    nameKey: 'evolutionBranch.sentinelWarden',
    tier: 3,
    parentBranchId: 'guardian-sentinel',
    unlockLevel: 50,
    resultClass: 'special',
    statMultiplier: { attackDamage: 1.05, maxHp: 1.5, attackSpeed: 1.0, criticalChance: 1.05 },
    skillUnlock: { skillId: 'skill-flameNova' },
  },
];

// Skills start in the owned bag AND pre-equipped (not just owned) - without
// this the protagonist would fight with zero skills until the player draws
// and manually equips something from the skill gacha (Phase C), which is a
// rough first few minutes for a fresh save. Hero.ts's createHero seeds both
// hero.ownedSkillIds and hero.equippedSkillIds from this same list.
export const STARTER_SKILL_IDS = ['skill-fireball', 'skill-lightning', 'skill-healingLight'];

// Single fixed protagonist replacing the old 100-entry procedurally
// generated roster (rarity tiers/role profiles/bondId cycling all deleted
// along with it - see project memory for the full removal rationale). id
// kept stable/exported since several systems (SaveSystem migrations,
// GameState's initial deployedHeroIds/unlockedHeroIds) need a fixed
// reference to "the protagonist".
export const PROTAGONIST_ID = 'protagonist';

export const heroRosterConfig: HeroDefinition[] = [
  {
    id: PROTAGONIST_ID,
    name: '凯尔',
    rarity: 'gold',
    statMultiplier: { attackDamage: 1, maxHp: 1, attackSpeed: 1, criticalChance: 1 },
    class: 'warrior',
    evolutionBranches: protagonistEvolutionTree,
  },
];

export function getHeroDefinition(heroId: string): HeroDefinition {
  const definition = heroRosterConfig.find((hero) => hero.id === heroId);
  if (!definition) {
    throw new Error(`Unknown hero id: ${heroId}`);
  }
  return definition;
}
