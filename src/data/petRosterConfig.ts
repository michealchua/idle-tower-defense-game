import type { UpgradeableStat } from './heroConfig';
import type { GachaRarity } from './gachaConfig';
import type { UnlockCondition } from './unlockConditionConfig';

export interface PetDefinition {
  id: string;
  // Cosmetic sprite key, independent of id - id is save-critical (keys
  // unlockedPetIds/petShards/petStars) so it can't be casually renamed to
  // something human-readable; this can. Falls back to id itself in
  // assetLoader.getPetSpriteSrc's caller when unset, so an unnamed pet still
  // resolves to a (likely missing, harmlessly-fallback-shape) path instead of
  // needing a guard everywhere this is read.
  spriteId?: string;
  // Drives gacha pull odds, shard-per-duplicate rate, and star-up cost
  // schedule - see gachaConfig.ts.
  rarity: GachaRarity;
  // Team-wide passive bonus, added into every deployed hero's effective
  // stats - only from deployed pets, see HeroStatsSystem.computePetPassiveBonuses.
  passiveBonus: Partial<Record<UpgradeableStat, number>>;
  // Pets don't level in v1 - these are their fixed, independent attack stats
  // (still scaled by the ascension/star multipliers at recompute time, same
  // as heroes).
  attackDamage: number;
  attackSpeed: number;
  attackRange: number;
  // Same contract as HeroDefinition.unlockConditions - present means
  // excluded from the gacha pool, only obtainable via UnlockSystem.
  unlockConditions?: UnlockCondition[];
}

// Placeholder ids only, same as heroRosterConfig - real names/art come later.
// Rarity assignment here is also a placeholder distribution. Numeric
// unlock-condition thresholds are placeholders, tune later.
export const petRosterConfig: PetDefinition[] = [
  {
    id: 'pet-1',
    spriteId: 'baby_dragon',
    rarity: 'white',
    passiveBonus: { attackDamage: 2 },
    attackDamage: 4,
    attackSpeed: 0.8,
    attackRange: 90,
  },
  {
    id: 'pet-2',
    rarity: 'green',
    passiveBonus: { maxHp: 20 },
    attackDamage: 3,
    attackSpeed: 1,
    attackRange: 90,
  },
  {
    id: 'pet-3',
    rarity: 'gold',
    passiveBonus: { attackSpeed: 0.05, criticalChance: 0.03 },
    attackDamage: 6,
    attackSpeed: 0.6,
    attackRange: 90,
  },
  {
    id: 'pet-4',
    rarity: 'blue',
    passiveBonus: { criticalChance: 0.05 },
    attackDamage: 5,
    attackSpeed: 0.9,
    attackRange: 90,
  },
  // Condition-locked: reach ascension level 1. Never appears in the gacha pool.
  {
    id: 'pet-5',
    rarity: 'purple',
    passiveBonus: { attackDamage: 8, maxHp: 30 },
    attackDamage: 8,
    attackSpeed: 0.7,
    attackRange: 90,
    unlockConditions: [{ type: 'ascensionLevel', level: 1 }],
  },
  // Gacha-obtainable red/rainbow - same reasoning as hero-9/hero-10, gives
  // the diamond premium pool something worth chasing.
  {
    id: 'pet-6',
    rarity: 'red',
    passiveBonus: { attackDamage: 14, maxHp: 40, criticalChance: 0.04 },
    attackDamage: 12,
    attackSpeed: 0.75,
    attackRange: 90,
  },
  {
    id: 'pet-7',
    rarity: 'rainbow',
    passiveBonus: { attackDamage: 22, maxHp: 60, criticalChance: 0.06, attackSpeed: 0.06 },
    attackDamage: 18,
    attackSpeed: 0.7,
    attackRange: 90,
  },
];

export function getPetDefinition(petId: string): PetDefinition {
  const definition = petRosterConfig.find((pet) => pet.id === petId);
  if (!definition) {
    throw new Error(`Unknown pet id: ${petId}`);
  }
  return definition;
}
