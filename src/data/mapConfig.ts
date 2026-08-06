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
  petRowOffset: 70,
  petRowSpacing: 24,
  // Towers sit on the opposite side of the hero anchor from pets (negative
  // offset) so the two secondary-unit rows never overlap.
  towerRowOffset: -70,
  towerRowSpacing: 24,
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

// Pets sit in their own row further out from the hero anchor so they read
// as visually secondary to heroes.
export function layoutPetPositions(count: number): Position[] {
  const { x, y } = mapConfig.heroPosition;
  return Array.from({ length: count }, (_, index) => ({
    x,
    y: y + mapConfig.petRowOffset + (index - (count - 1) / 2) * mapConfig.petRowSpacing,
  }));
}

// Towers get their own row too - same layout shape as pets, mirrored to the
// other side of the hero anchor (see mapConfig.towerRowOffset).
export function layoutTowerPositions(count: number): Position[] {
  const { x, y } = mapConfig.heroPosition;
  return Array.from({ length: count }, (_, index) => ({
    x,
    y: y + mapConfig.towerRowOffset + (index - (count - 1) / 2) * mapConfig.towerRowSpacing,
  }));
}
