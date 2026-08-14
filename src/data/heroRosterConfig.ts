import type { UpgradeableStat, HeroClass } from './heroConfig';
import { heroClasses } from './heroConfig';
import type { GachaRarity } from './gachaConfig';
import type { UnlockCondition } from './unlockConditionConfig';
import { bondIds, type BondId } from './bondConfig';
import { generateDeterministicHeroName } from './NameGenerator';

export interface HeroSkillUnlock {
  level: number;
  skillId: string;
}

// One 分支进化 (branch evolution) option - see heroConfig.ts's
// heroEvolutionConfig doc comment for the full mechanic. Every hero of a
// given class shares the same two branches (see heroClassEvolutionBranches
// below) rather than each of the 100 heroes needing bespoke branch content.
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
  // Drives gacha pull odds, shard-per-duplicate rate, and star-up cost
  // schedule - see gachaConfig.ts. Still set (for the star-up cost table)
  // even on condition-locked heroes below, they just never come out of the
  // pull pool itself.
  rarity: GachaRarity;
  // Multiplies heroBaseConfig per stat, giving each hero a distinct flavor
  // (glass cannon, tanky, balanced) without a separate stat table per hero.
  statMultiplier: Record<UpgradeableStat, number>;
  // Class/theme tag - see bondConfig.ts. Fielding several heroes sharing a
  // bond grants a team-wide bonus (HeroStatsSystem.recomputeHeroStats).
  bondId: BondId;
  // Archetype tag (heroConfig.ts's HeroClass) - independent axis from
  // bondId, drives which two evolutionBranches this hero can pick from.
  class: HeroClass;
  // The two 分支进化 options available once this hero reaches
  // heroEvolutionConfig.unlockLevel - see HeroSystem.evolveHero.
  evolutionBranches: HeroEvolutionBranch[];
  // This hero's own skill unlock schedule - unlike the old shared
  // milestoneConfig skillUnlock rewards, every hero now has an independent
  // set of skills (from skillConfig.ts's pool) coming online at these
  // levels. See LevelSystem.tickHeroLevelUp/SkillSystem.tickHeroSkills.
  skillUnlocks: HeroSkillUnlock[];
  // Undefined = normal gacha pull. Present = condition-locked: excluded from
  // the pull pool (see GachaSystem) and only obtainable through
  // UnlockSystem.unlockHeroByCondition once every entry here is satisfied.
  unlockConditions?: UnlockCondition[];
}

// Two branches per class (8 total), shared by every hero of that class
// instead of hand-authoring branch content per roster entry - same
// "compact table reused across the roster" approach the rarity/role tables
// above already use. Each branch buffs two stats hard and holds/lightly
// trims a third, giving each evolved hero a clear build identity.
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

interface RoleProfile {
  attackDamage: number;
  maxHp: number;
  attackSpeed: number;
  criticalChance: number;
}

// Cycled by global roster index so heroes within the same rarity still read
// as different builds instead of clones - same shape hero-1..hero-10 used to
// hand-author (glass cannon/tanky/balanced/crit-focused examples), just
// generated instead of copy-pasted.
const roleProfiles: RoleProfile[] = [
  { attackDamage: 1, maxHp: 1, attackSpeed: 1, criticalChance: 1 }, // balanced
  { attackDamage: 1.35, maxHp: 0.7, attackSpeed: 1, criticalChance: 1.3 }, // glass cannon
  { attackDamage: 0.7, maxHp: 1.6, attackSpeed: 0.9, criticalChance: 0.8 }, // tank
  { attackDamage: 1.1, maxHp: 0.9, attackSpeed: 1, criticalChance: 1.6 }, // crit-focused
  { attackDamage: 0.95, maxHp: 0.85, attackSpeed: 1.35, criticalChance: 1 }, // fast attacker
];

interface RarityTierConfig {
  rarity: GachaRarity;
  count: number;
  // Overall power baseline for this rarity - multiplied by a roleProfile
  // above to get the hero's actual per-stat statMultiplier. Continues the
  // curve the old hero-1..hero-10 placeholders already established (white
  // ~1.0 up through rainbow ~2.4-2.7).
  powerMultiplier: number;
  // How many skillUnlocks entries a hero of this rarity gets (levels are
  // always the first N of skillUnlockLevels below).
  skillCount: number;
}

// Rarity counts confirmed with the user: white20/green20/blue25/purple20/
// gold10/red4/rainbow1 = 100.
const rarityTiers: RarityTierConfig[] = [
  { rarity: 'white', count: 20, powerMultiplier: 1.0, skillCount: 1 },
  { rarity: 'green', count: 20, powerMultiplier: 1.15, skillCount: 1 },
  { rarity: 'blue', count: 25, powerMultiplier: 1.35, skillCount: 2 },
  { rarity: 'purple', count: 20, powerMultiplier: 1.6, skillCount: 2 },
  { rarity: 'gold', count: 10, powerMultiplier: 1.9, skillCount: 2 },
  { rarity: 'red', count: 4, powerMultiplier: 2.3, skillCount: 3 },
  { rarity: 'rainbow', count: 1, powerMultiplier: 2.7, skillCount: 3 },
];

const skillUnlockLevels = [5, 10, 15];

// Every skillConfig.ts id, aoeDamage/chainDamage/healAlly grouped together -
// see buildSkillUnlocks for how heroes draw from this shared pool.
const skillPool = [
  'skill-fireball',
  'skill-meteor',
  'skill-flameNova',
  'skill-iceBurst',
  'skill-earthquake',
  'skill-novaBlast',
  'skill-lightning',
  'skill-arrowRain',
  'skill-chainBlade',
  'skill-thornWhip',
  'skill-spiritLink',
  'skill-voidChain',
  'skill-healingLight',
  'skill-natureBlessing',
  'skill-sanctuary',
  'skill-lifeSpring',
  'skill-guardianPulse',
  'skill-phoenixGrace',
];

// Deterministic (no Math.random) - the same globalIndex always produces the
// same skill loadout across reloads. Stride 7 is coprime with the pool's
// length (18), so a single hero never draws the same skill twice even at
// skillCount 3, while different heroes' starting offsets (globalIndex) still
// spread combinations across the whole pool instead of every hero drawing
// from the same few entries.
function buildSkillUnlocks(globalIndex: number, count: number): HeroSkillUnlock[] {
  const stride = 7;
  const unlocks: HeroSkillUnlock[] = [];
  for (let k = 0; k < count; k += 1) {
    const skillId = skillPool[(globalIndex + k * stride) % skillPool.length];
    unlocks.push({ level: skillUnlockLevels[k], skillId });
  }
  return unlocks;
}

function buildStatMultiplier(power: number, role: RoleProfile): Record<UpgradeableStat, number> {
  return {
    attackDamage: Math.round(power * role.attackDamage * 1000) / 1000,
    maxHp: Math.round(power * role.maxHp * 1000) / 1000,
    attackSpeed: Math.round(power * role.attackSpeed * 1000) / 1000,
    criticalChance: Math.round(power * role.criticalChance * 1000) / 1000,
  };
}

// The old hand-authored chain-unlock example (hero-6/7/8: a heroUpgradeLevel
// gate, a goldSpent gate, and a requiresHero+heroLevel chain built on top of
// the goldSpent one) re-pointed at three generated ids instead. Same
// "excluded from the gacha pool, only reachable via UnlockSystem" behavior -
// see GachaSystem.pickRosterEntryByRarity.
const unlockConditionOverrides: Record<string, UnlockCondition[]> = {
  'purple-19': [{ type: 'heroUpgradeLevel', stat: 'attackDamage', level: 20 }],
  'purple-20': [{ type: 'goldSpent', amount: 50000 }],
  'gold-10': [
    { type: 'requiresHero', heroId: 'purple-20' },
    { type: 'heroLevel', heroId: 'purple-20', level: 15 },
  ],
};

// 100 heroes generated from the compact tables above instead of hand-
// authored, so the per-rarity power curve and role variety stay consistent
// across all of them instead of drifting the way 100 hand-written literals
// would. ids stay the plain `<rarity>-<n>` scheme; names are the one thing
// generated per-entry via generateDeterministicHeroName instead (real art
// still comes later - see ART_ASSET_CHECKLIST.md).
function generateHeroRoster(): HeroDefinition[] {
  const roster: HeroDefinition[] = [];
  let globalIndex = 0;

  for (const tier of rarityTiers) {
    for (let n = 1; n <= tier.count; n += 1) {
      const id = `${tier.rarity}-${n}`;
      const role = roleProfiles[globalIndex % roleProfiles.length];
      const heroClass = heroClasses[globalIndex % heroClasses.length];

      roster.push({
        id,
        name: generateDeterministicHeroName(globalIndex),
        rarity: tier.rarity,
        statMultiplier: buildStatMultiplier(tier.powerMultiplier, role),
        bondId: bondIds[globalIndex % bondIds.length],
        class: heroClass,
        evolutionBranches: heroClassEvolutionBranches[heroClass],
        skillUnlocks: buildSkillUnlocks(globalIndex, tier.skillCount),
        unlockConditions: unlockConditionOverrides[id],
      });

      globalIndex += 1;
    }
  }

  return roster;
}

export const heroRosterConfig: HeroDefinition[] = generateHeroRoster();

export function getHeroDefinition(heroId: string): HeroDefinition {
  const definition = heroRosterConfig.find((hero) => hero.id === heroId);
  if (!definition) {
    throw new Error(`Unknown hero id: ${heroId}`);
  }
  return definition;
}
