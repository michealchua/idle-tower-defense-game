import type { Position } from '../engine/types';

export const mapConfig = {
  spawnPosition: { x: 370, y: 150 },
  basePosition: { x: 30, y: 150 },
  heroPosition: { x: 150, y: 150 },
  baseArrivalDistance: 10,
  heroRowSpacing: 40,
  // 3-wide grid instead of a single column, so a growing squad (castle
  // upgrades unlock more hero slots) wraps into more rows instead of one
  // ever-taller column. See layoutHeroPositions.
  heroColumns: 3,
  heroColSpacing: 44,
  // Pets trail the hero line toward the base (smaller x = further from the
  // spawn side enemies march in from), not just below it - reads as
  // "following the squad" instead of "parked under it".
  petTrailOffset: 46,
  petRowSpacing: 24,
};

// Heroes are laid out in a fixed-width grid (mapConfig.heroColumns) centered
// on the anchor, wrapping to additional rows as the deployed count grows.
// Called whenever the deployed hero count changes (initial spawn, every new
// unlock/deploy/undeploy) so the whole grid stays centered rather than
// growing lopsided.
export function layoutHeroPositions(count: number): Position[] {
  const { x, y } = mapConfig.heroPosition;
  const { heroColumns, heroColSpacing, heroRowSpacing } = mapConfig;
  const rows = Math.max(1, Math.ceil(count / heroColumns));
  return Array.from({ length: count }, (_, index) => {
    const col = index % heroColumns;
    const row = Math.floor(index / heroColumns);
    return {
      x: x + (col - (heroColumns - 1) / 2) * heroColSpacing,
      y: y + (row - (rows - 1) / 2) * heroRowSpacing,
    };
  });
}

// Pets sit behind the hero anchor (toward the base, away from the spawn
// side) so they read as following the squad rather than parked under it.
export function layoutPetPositions(count: number): Position[] {
  const { x, y } = mapConfig.heroPosition;
  return Array.from({ length: count }, (_, index) => ({
    x: x - mapConfig.petTrailOffset,
    y: y + (index - (count - 1) / 2) * mapConfig.petRowSpacing,
  }));
}
