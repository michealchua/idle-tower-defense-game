import { computeScaledValue } from './scaling';

// Distinct roles instead of interchangeable stat-sticks, same "one stat pool
// per slot" reasoning as equipmentConfig.ts's weapon/armor/trinket split -
// modeled after the reference game's frost/lightning/cannon/economy towers.
export type TowerKind = 'cannon' | 'frost' | 'lightning' | 'economy';
export type TowerId = 'cannonTower' | 'frostTower' | 'lightningTower' | 'goldTower';

export interface TowerUpgradeDefinition {
  baseCost: number;
  costGrowth: number;
  // Fraction added to the tower's base damage/goldPerSecond per level beyond
  // 1 - same "growth curve" shape as gachaConfig star bonuses.
  growthPerLevel: number;
}

export interface TowerDefinition {
  id: TowerId;
  kind: TowerKind;
  buildCost: number;
  baseAttackDamage: number;
  baseAttackSpeed: number;
  baseAttackRange: number;
  // Cannon only - deals splashDamageRatio * damage to every other enemy
  // within splashRadius of the primary target.
  splashRadius?: number;
  splashDamageRatio?: number;
  // Lightning only - hits this many enemies in range simultaneously.
  chainCount?: number;
  // Frost only - multiplies enemy movement speed while active (see
  // MovementSystem.getEffectiveSpeed), refreshed for slowDuration seconds
  // on every hit.
  slowMultiplier?: number;
  slowDuration?: number;
  // Economy only - passive gold/second while deployed, no attack.
  goldPerSecond?: number;
  upgrade: TowerUpgradeDefinition;
}

// Placeholder numbers, tune later - same precedent as every other config in
// this project. Four kinds cover the reference game's core archetypes
// (single-target AoE, crowd control, chain damage, passive economy) without
// the purely-flavor duplicates (fire tower, spike worm) it also has.
export const towerConfig: Record<TowerId, TowerDefinition> = {
  cannonTower: {
    id: 'cannonTower',
    kind: 'cannon',
    buildCost: 800,
    baseAttackDamage: 18,
    baseAttackSpeed: 0.6,
    baseAttackRange: 90,
    splashRadius: 40,
    splashDamageRatio: 0.5,
    upgrade: { baseCost: 300, costGrowth: 1.2, growthPerLevel: 0.25 },
  },
  frostTower: {
    id: 'frostTower',
    kind: 'frost',
    buildCost: 600,
    baseAttackDamage: 4,
    baseAttackSpeed: 1,
    baseAttackRange: 90,
    slowMultiplier: 0.5,
    slowDuration: 2,
    upgrade: { baseCost: 250, costGrowth: 1.2, growthPerLevel: 0.2 },
  },
  lightningTower: {
    id: 'lightningTower',
    kind: 'lightning',
    buildCost: 1200,
    baseAttackDamage: 10,
    baseAttackSpeed: 0.8,
    baseAttackRange: 100,
    chainCount: 4,
    upgrade: { baseCost: 400, costGrowth: 1.22, growthPerLevel: 0.25 },
  },
  goldTower: {
    id: 'goldTower',
    kind: 'economy',
    buildCost: 1000,
    baseAttackDamage: 0,
    baseAttackSpeed: 0,
    baseAttackRange: 0,
    goldPerSecond: 2,
    upgrade: { baseCost: 500, costGrowth: 1.25, growthPerLevel: 0.3 },
  },
};

export const towerIds = Object.keys(towerConfig) as TowerId[];

export function getTowerUpgradeCost(towerId: TowerId, level: number): number {
  const def = towerConfig[towerId].upgrade;
  return computeScaledValue(def.baseCost, def.costGrowth, level - 1);
}
