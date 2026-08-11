export function computeScaledValue(base: number, growth: number, exponent: number): number {
  return Math.round(base * growth ** exponent);
}

// Plain `number` is fine up to Number.MAX_SAFE_INTEGER (~9e15) - ascension's
// exponential power multiplier (see ascensionConfig.ts) is the only thing in
// this project that could realistically approach that, and only after many
// ascensions. This formatter is the mitigation: display never overflows or
// shows a 20-digit integer, it just switches to scientific notation past the
// suffix table. If combat math itself ever needs to exceed
// MAX_SAFE_INTEGER (not just display it), that's a real BigInt/decimal.js
// migration - deliberately not done here, see the equipment/ascension
// numeric-design conversation this was scoped from.
const BIG_NUMBER_SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No'];

export function formatBigNumber(value: number): string {
  const sign = value < 0 ? '-' : '';
  const magnitude = Math.abs(value);

  if (magnitude < 1000) {
    return `${sign}${Math.round(magnitude)}`;
  }

  const tier = Math.floor(Math.log10(magnitude) / 3);

  if (tier >= BIG_NUMBER_SUFFIXES.length) {
    return `${sign}${magnitude.toExponential(2)}`;
  }

  const scaled = magnitude / 1000 ** tier;
  // 3 significant figures (e.g. "1.00K"/"12.3M"/"123B") rather than a fixed
  // decimal count, so precision doesn't visibly collapse near each tier's
  // rollover.
  const decimals = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  return `${sign}${scaled.toFixed(decimals)}${BIG_NUMBER_SUFFIXES[tier]}`;
}

export interface WeightedEntry<T> {
  id: T;
  weight: number;
}

// Shared by every weighted-random-choice table in the game (enemy spawns,
// equipment rarity, gacha rarity) instead of each reimplementing the same
// roll-then-subtract loop.
export function weightedPick<T>(entries: WeightedEntry<T>[]): T {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.id;
    }
  }

  return entries[entries.length - 1].id;
}
