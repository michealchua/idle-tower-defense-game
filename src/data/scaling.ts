export function computeScaledValue(base: number, growth: number, exponent: number): number {
  return Math.round(base * growth ** exponent);
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
