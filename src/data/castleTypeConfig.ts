// Replaces the old standalone tower-building mechanic (see git history for
// TowerSystem.ts/towerConfig.ts) - the castle itself now IS "the tower".
// There's only one castleLevel progression (CastleSystem.upgradeCastle); a
// castle "type" just decides which single passive bonus that level feeds.
// Switching type is free/instant and doesn't reset castleLevel - it only
// changes which of the four getters below returns a non-zero value.
export type CastleTypeId = 'military' | 'economic' | 'defense' | 'arcane';

export interface CastleTypeDefinition {
  id: CastleTypeId;
  labelKey: string;
  descKey: string;
  // "(castleLevel - 1) * valuePerLevel" - level 1 = baseline, no bonus yet,
  // same convention as castleConfig's hero/pet slot growth. military reads
  // this as "+X% attack" (multiplicative), the other three as flat/capped
  // additions - see the getters below.
  valuePerLevel: number;
  // Only defense/arcane cap out - military/economic have no ceiling since
  // they're not clamped against another system's max (crit/damageReduction
  // both already get clamped against 100%/a hard cap elsewhere).
  maxValue?: number;
}

// Placeholder tune-later values, same precedent as every other config table
// in this project (talentConfig.ts, ascensionShopConfig.ts, ...). Each type
// mirrors one of the old tower kinds' theme (military~cannon/lightning,
// economic~goldTower, defense~frost's "reduce incoming damage" flavor,
// arcane~a new crit-focused option) but as a passive squad-wide bonus
// instead of an active attacking unit.
export const castleTypeConfig: Record<CastleTypeId, CastleTypeDefinition> = {
  military: {
    id: 'military',
    labelKey: 'castleType.military',
    descKey: 'castleType.militaryDesc',
    valuePerLevel: 0.03,
  },
  economic: {
    id: 'economic',
    labelKey: 'castleType.economic',
    descKey: 'castleType.economicDesc',
    valuePerLevel: 1.5,
  },
  defense: {
    id: 'defense',
    labelKey: 'castleType.defense',
    descKey: 'castleType.defenseDesc',
    valuePerLevel: 0.015,
    maxValue: 0.4,
  },
  arcane: {
    id: 'arcane',
    labelKey: 'castleType.arcane',
    descKey: 'castleType.arcaneDesc',
    valuePerLevel: 0.008,
    maxValue: 0.3,
  },
};

export const castleTypeIds = Object.keys(castleTypeConfig) as CastleTypeId[];

export const defaultCastleTypeId: CastleTypeId = 'military';

// Every getter below takes the type to evaluate (not necessarily the active
// one) and always returns the "inert" value (1 or 0) unless that IS the
// castle's current type - callers pass state.castleType for the real live
// bonus, or a specific id to preview "what would this type give right now"
// (see CastlePanel, which does exactly that for every type at once so the
// player can compare before switching).

// military - multiplicative hero/pet attackDamage bonus, same shape as
// getTalentMultiplier/getAscensionShopMultiplier so HeroStatsSystem can
// fold it into the same multiplier chain.
export function getCastleAttackMultiplier(castleType: CastleTypeId, castleLevel: number): number {
  if (castleType !== 'military') {
    return 1;
  }
  return 1 + (castleLevel - 1) * castleTypeConfig.military.valuePerLevel;
}

// economic - flat passive gold/second, consumed by CastleSystem.tickCastleIncome.
export function getCastleGoldPerSecond(castleType: CastleTypeId, castleLevel: number): number {
  if (castleType !== 'economic') {
    return 0;
  }
  return (castleLevel - 1) * castleTypeConfig.economic.valuePerLevel;
}

// defense - flat, capped base damage-reduction bonus, summed alongside the
// talent/ascension-shop damageReduction nodes in MovementSystem.
export function getCastleDamageReductionBonus(castleType: CastleTypeId, castleLevel: number): number {
  if (castleType !== 'defense') {
    return 0;
  }
  const def = castleTypeConfig.defense;
  const raw = (castleLevel - 1) * def.valuePerLevel;
  return def.maxValue !== undefined ? Math.min(raw, def.maxValue) : raw;
}

// arcane - flat, capped criticalChance bonus, summed alongside the talent/
// ascension-shop criticalChance nodes in HeroStatsSystem.
export function getCastleCriticalChanceBonus(castleType: CastleTypeId, castleLevel: number): number {
  if (castleType !== 'arcane') {
    return 0;
  }
  const def = castleTypeConfig.arcane;
  const raw = (castleLevel - 1) * def.valuePerLevel;
  return def.maxValue !== undefined ? Math.min(raw, def.maxValue) : raw;
}
