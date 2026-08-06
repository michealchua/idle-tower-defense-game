import type { UpgradeableStat } from './heroConfig';
import type { GachaRarity } from './gachaConfig';
import type { UnlockCondition } from './unlockConditionConfig';
import { bondIds, type BondId } from './bondConfig';

export interface HeroSkillUnlock {
  level: number;
  skillId: string;
}

export interface HeroDefinition {
  id: string;
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

// Placeholder ids/numbers only - real names/art come later, same precedent
// as the old hero-1..hero-10 stand-ins this generator replaces. 100 heroes
// generated from the compact tables above instead of hand-authored, so the
// per-rarity power curve and role variety stay consistent across all of
// them instead of drifting the way 100 hand-written literals would.
function generateHeroRoster(): HeroDefinition[] {
  const roster: HeroDefinition[] = [];
  let globalIndex = 0;

  for (const tier of rarityTiers) {
    for (let n = 1; n <= tier.count; n += 1) {
      const id = `${tier.rarity}-${n}`;
      const role = roleProfiles[globalIndex % roleProfiles.length];

      roster.push({
        id,
        rarity: tier.rarity,
        statMultiplier: buildStatMultiplier(tier.powerMultiplier, role),
        bondId: bondIds[globalIndex % bondIds.length],
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
