import type { UpgradeableStat } from './heroConfig';
import type { GachaRarity } from './gachaConfig';
import type { UnlockCondition } from './unlockConditionConfig';

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
  // Undefined = normal gacha pull. Present = condition-locked: excluded from
  // the pull pool (see GachaSystem) and only obtainable through
  // UnlockSystem.unlockHeroByCondition once every entry here is satisfied.
  unlockConditions?: UnlockCondition[];
}

// Placeholder ids only - the user will swap these for real names/art later.
// Rarity assignment here is also a placeholder distribution just to exercise
// all five tiers, plus a couple of condition-locked heroes (see
// unlockConditionConfig.ts) to exercise that path too. All numeric
// thresholds below are placeholders, tune later.
export const heroRosterConfig: HeroDefinition[] = [
  {
    id: 'hero-1',
    rarity: 'white',
    statMultiplier: { attackDamage: 1, maxHp: 1, attackSpeed: 1, criticalChance: 1 },
  },
  {
    id: 'hero-2',
    rarity: 'blue',
    statMultiplier: { attackDamage: 1.4, maxHp: 0.75, attackSpeed: 1, criticalChance: 1.5 },
  },
  {
    id: 'hero-3',
    rarity: 'purple',
    statMultiplier: { attackDamage: 0.75, maxHp: 1.7, attackSpeed: 0.9, criticalChance: 1 },
  },
  {
    id: 'hero-4',
    rarity: 'green',
    statMultiplier: { attackDamage: 1.1, maxHp: 1.1, attackSpeed: 1, criticalChance: 1.1 },
  },
  {
    id: 'hero-5',
    rarity: 'gold',
    statMultiplier: { attackDamage: 1.2, maxHp: 1.3, attackSpeed: 0.85, criticalChance: 1.2 },
  },
  // Condition-locked: any owned hero reaches 20 purchased levels of their
  // own attackDamage upgrade. Never appears in the gacha pool.
  {
    id: 'hero-6',
    rarity: 'purple',
    statMultiplier: { attackDamage: 1.6, maxHp: 0.9, attackSpeed: 1, criticalChance: 1 },
    unlockConditions: [{ type: 'heroUpgradeLevel', stat: 'attackDamage', level: 20 }],
  },
  // Condition-locked: spend 50,000 lifetime gold. Never appears in the gacha pool.
  {
    id: 'hero-7',
    rarity: 'purple',
    statMultiplier: { attackDamage: 1, maxHp: 2, attackSpeed: 0.8, criticalChance: 0.8 },
    unlockConditions: [{ type: 'goldSpent', amount: 50000 }],
  },
  // Chained: hero-7 must already be unlocked AND reach level 15. Two
  // conditions in one array, both required.
  {
    id: 'hero-8',
    rarity: 'gold',
    statMultiplier: { attackDamage: 1.5, maxHp: 1.5, attackSpeed: 1, criticalChance: 1.3 },
    unlockConditions: [
      { type: 'requiresHero', heroId: 'hero-7' },
      { type: 'heroLevel', heroId: 'hero-7', level: 15 },
    ],
  },
  // Gacha-obtainable red/rainbow - this is what makes the diamond premium
  // pool's premiumPullWeight boost (see gachaConfig.ts) actually mean
  // something instead of silently falling back to the gold-tier pool.
  {
    id: 'hero-9',
    rarity: 'red',
    statMultiplier: { attackDamage: 1.9, maxHp: 1.7, attackSpeed: 1.1, criticalChance: 1.4 },
  },
  {
    id: 'hero-10',
    rarity: 'rainbow',
    statMultiplier: { attackDamage: 2.4, maxHp: 2.2, attackSpeed: 1.2, criticalChance: 1.6 },
  },
];

export function getHeroDefinition(heroId: string): HeroDefinition {
  const definition = heroRosterConfig.find((hero) => hero.id === heroId);
  if (!definition) {
    throw new Error(`Unknown hero id: ${heroId}`);
  }
  return definition;
}
