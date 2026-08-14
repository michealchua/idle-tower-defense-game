import type { UpgradeableStat, HeroClass } from './heroConfig';
import type { GachaRarity } from './gachaConfig';
import type { UnlockCondition } from './unlockConditionConfig';

export interface HeroSkillUnlock {
  level: number;
  skillId: string;
}

// One 分支进化 (branch evolution) option. Still the flat "2 branches, one
// global level gate" shape from before the single-protagonist redesign -
// Phase D of the redesign replaces this with a multi-tier tree
// (tier/parentBranchId/per-branch unlockLevel); left as-is here so Phase A
// doesn't regress the one evolution path that already works.
export interface HeroEvolutionBranch {
  id: string;
  nameKey: string;
  // The class this branch's hero becomes once chosen - matches the base
  // class for most branches (a mage stays a mage), but nothing stops a
  // branch from shifting it.
  resultClass: HeroClass;
  // Multiplicative boost layered on top of the hero's own statMultiplier
  // (see getEffectiveStatMultiplier in HeroStatsSystem.ts) - this is what
  // makes evolving "获得大幅属性成长" instead of a cosmetic-only change.
  statMultiplier: Record<UpgradeableStat, number>;
  // Exclusive skill granted immediately on evolving, from skillConfig.ts's
  // existing pool - added straight into hero.unlockedSkillIds by
  // HeroSystem.evolveHero, no separate level gate of its own.
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
  // The 分支进化 options available once this hero reaches
  // heroEvolutionConfig.unlockLevel - see HeroSystem.evolveHero.
  evolutionBranches: HeroEvolutionBranch[];
  // This hero's own skill unlock schedule (from skillConfig.ts's pool) -
  // see LevelSystem.tickHeroLevelUp/SkillSystem.tickHeroSkills. Phase B of
  // the single-protagonist redesign replaces this with gacha-drawn skills
  // the player manually equips instead; left as-is here so Phase A doesn't
  // regress skill acquisition before Phase B lands.
  skillUnlocks: HeroSkillUnlock[];
  // Undefined = always available. Present = condition-locked (see
  // UnlockSystem) - unused now that there's no gacha pool to exclude this
  // single hero from, kept only so the type shape doesn't ripple elsewhere
  // before Phase C removes hero-gacha entirely.
  unlockConditions?: UnlockCondition[];
}

// Two branches per class (8 total) - kept in full even though only
// 'warrior' is reachable today, since HeroEvolutionBranch's flat "2
// branches, one global level gate" shape and this whole table get replaced
// by Phase D's multi-tier tree. Removing the other 7 classes' branches now
// would just be work Phase D immediately redoes.
const heroClassEvolutionBranches: Record<HeroClass, HeroEvolutionBranch[]> = {
  warrior: [
    {
      id: 'warrior-berserker',
      nameKey: 'evolutionBranch.warriorBerserker',
      resultClass: 'warrior',
      statMultiplier: { attackDamage: 1.7, maxHp: 0.85, attackSpeed: 1.2, criticalChance: 1.3 },
      skillUnlock: { skillId: 'skill-earthquake' },
    },
    {
      id: 'warrior-guardian',
      nameKey: 'evolutionBranch.warriorGuardian',
      resultClass: 'warrior',
      statMultiplier: { attackDamage: 0.9, maxHp: 1.9, attackSpeed: 0.95, criticalChance: 1.0 },
      skillUnlock: { skillId: 'skill-guardianPulse' },
    },
  ],
  mage: [
    {
      id: 'mage-pyromancer',
      nameKey: 'evolutionBranch.magePyromancer',
      resultClass: 'mage',
      statMultiplier: { attackDamage: 1.8, maxHp: 0.9, attackSpeed: 1.05, criticalChance: 1.25 },
      skillUnlock: { skillId: 'skill-meteor' },
    },
    {
      id: 'mage-cryomancer',
      nameKey: 'evolutionBranch.mageCryomancer',
      resultClass: 'mage',
      statMultiplier: { attackDamage: 1.3, maxHp: 1.4, attackSpeed: 1.15, criticalChance: 1.1 },
      skillUnlock: { skillId: 'skill-iceBurst' },
    },
  ],
  paladin: [
    {
      id: 'paladin-lightbringer',
      nameKey: 'evolutionBranch.paladinLightBringer',
      resultClass: 'paladin',
      statMultiplier: { attackDamage: 1.2, maxHp: 1.8, attackSpeed: 1.0, criticalChance: 1.1 },
      skillUnlock: { skillId: 'skill-sanctuary' },
    },
    {
      id: 'paladin-inquisitor',
      nameKey: 'evolutionBranch.paladinInquisitor',
      resultClass: 'paladin',
      statMultiplier: { attackDamage: 1.75, maxHp: 1.1, attackSpeed: 1.1, criticalChance: 1.35 },
      skillUnlock: { skillId: 'skill-voidChain' },
    },
  ],
  summoner: [
    {
      id: 'summoner-soul',
      nameKey: 'evolutionBranch.summonerSoul',
      resultClass: 'summoner',
      statMultiplier: { attackDamage: 1.4, maxHp: 1.2, attackSpeed: 1.1, criticalChance: 1.15 },
      skillUnlock: { skillId: 'skill-spiritLink' },
    },
    {
      id: 'summoner-elemental',
      nameKey: 'evolutionBranch.summonerElemental',
      resultClass: 'summoner',
      statMultiplier: { attackDamage: 1.5, maxHp: 1.3, attackSpeed: 1.0, criticalChance: 1.15 },
      skillUnlock: { skillId: 'skill-novaBlast' },
    },
  ],
  archer: [
    {
      id: 'archer-windrunner',
      nameKey: 'evolutionBranch.archerWindrunner',
      resultClass: 'archer',
      statMultiplier: { attackDamage: 1.1, maxHp: 0.8, attackSpeed: 1.6, criticalChance: 1.4 },
      skillUnlock: { skillId: 'skill-arrowRain' },
    },
    {
      id: 'archer-deadeye',
      nameKey: 'evolutionBranch.archerDeadeye',
      resultClass: 'archer',
      statMultiplier: { attackDamage: 1.6, maxHp: 0.85, attackSpeed: 0.9, criticalChance: 1.7 },
      skillUnlock: { skillId: 'skill-lightning' },
    },
  ],
  assassin: [
    {
      id: 'assassin-shadowfang',
      nameKey: 'evolutionBranch.assassinShadowfang',
      resultClass: 'assassin',
      statMultiplier: { attackDamage: 1.3, maxHp: 0.75, attackSpeed: 1.5, criticalChance: 1.6 },
      skillUnlock: { skillId: 'skill-chainBlade' },
    },
    {
      id: 'assassin-executioner',
      nameKey: 'evolutionBranch.assassinExecutioner',
      resultClass: 'assassin',
      statMultiplier: { attackDamage: 2.0, maxHp: 0.7, attackSpeed: 1.0, criticalChance: 1.5 },
      skillUnlock: { skillId: 'skill-thornWhip' },
    },
  ],
  priest: [
    {
      id: 'priest-lightweaver',
      nameKey: 'evolutionBranch.priestLightweaver',
      resultClass: 'priest',
      statMultiplier: { attackDamage: 0.9, maxHp: 1.5, attackSpeed: 1.0, criticalChance: 1.0 },
      skillUnlock: { skillId: 'skill-healingLight' },
    },
    {
      id: 'priest-oracle',
      nameKey: 'evolutionBranch.priestOracle',
      resultClass: 'priest',
      statMultiplier: { attackDamage: 0.8, maxHp: 1.7, attackSpeed: 1.1, criticalChance: 0.9 },
      skillUnlock: { skillId: 'skill-natureBlessing' },
    },
  ],
  special: [
    {
      id: 'special-warden',
      nameKey: 'evolutionBranch.specialWarden',
      resultClass: 'special',
      statMultiplier: { attackDamage: 1.0, maxHp: 2.0, attackSpeed: 0.9, criticalChance: 1.0 },
      skillUnlock: { skillId: 'skill-flameNova' },
    },
    {
      id: 'special-arbiter',
      nameKey: 'evolutionBranch.specialArbiter',
      resultClass: 'special',
      statMultiplier: { attackDamage: 1.4, maxHp: 1.3, attackSpeed: 1.1, criticalChance: 1.2 },
      skillUnlock: { skillId: 'skill-phoenixGrace' },
    },
  ],
};

const startingSkillUnlocks: HeroSkillUnlock[] = [
  { level: 5, skillId: 'skill-fireball' },
  { level: 10, skillId: 'skill-lightning' },
  { level: 15, skillId: 'skill-healingLight' },
];

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
    evolutionBranches: heroClassEvolutionBranches.warrior,
    skillUnlocks: startingSkillUnlocks,
  },
];

export function getHeroDefinition(heroId: string): HeroDefinition {
  const definition = heroRosterConfig.find((hero) => hero.id === heroId);
  if (!definition) {
    throw new Error(`Unknown hero id: ${heroId}`);
  }
  return definition;
}
