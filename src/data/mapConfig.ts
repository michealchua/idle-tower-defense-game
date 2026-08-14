import type { Position } from '../engine/types';

export const mapConfig = {
  spawnPosition: { x: 370, y: 150 },
  basePosition: { x: 30, y: 150 },
  heroPosition: { x: 150, y: 150 },
  baseArrivalDistance: 10,
  heroRowSpacing: 40,
  // Single-protagonist redesign: no longer describes a hero grid (nothing
  // uses heroColumns/heroColSpacing for hero layout anymore, see
  // layoutSlotPositions below) - kept only because layoutPetPositions still
  // anchors the pet trail off "where the hero grid's left edge used to be".
  heroColumns: 3,
  heroColSpacing: 44,
  // Pets trail the hero GRID's left edge toward the base (smaller x =
  // further from the spawn side enemies march in from), not just below it -
  // reads as "following the squad" instead of "parked under it". 36 sits
  // the pet column roughly midway in the ~65-74 gap between the base
  // sprite's right edge and the hero grid's own left edge (see
  // layoutPetPositions), clearing both without a large empty gap either
  // side in this game's tight ~340px-wide lane.
  petTrailOffset: 36,
  petRowSpacing: 24,
};

// Single-protagonist redesign: was a 9-cell grid (maxDeployedHeroesCap) for
// the old multi-hero squad, with a drag-to-any-cell UI on top. There's now
// exactly one hero ever (see heroRosterConfig.ts's PROTAGONIST_ID) so this
// just hands back mapConfig.heroPosition itself - kept as an array (rather
// than changing every call site to expect a single Position) since
// GameState.ts/HeroSystem.ts both index into this by
// HeroState.deployedSlotIndex, which is always 0 for the one hero.
export function layoutSlotPositions(): Position[] {
  return [mapConfig.heroPosition];
}

// Pets sit behind the hero GRID's actual left edge (toward the base, away
// from the spawn side) so they read as following the squad rather than
// parked under it. Previously offset from the grid's center anchor instead
// of its edge - petTrailOffset (46) landed the pet column at x=104 while a
// 3-wide grid's own leftmost column already sits at x=106
// (heroPosition.x - (heroColumns-1)/2 * heroColSpacing = 150 - 44), a ~2px
// gap that read as pets and heroes overlapping. petTrailOffset is now the
// clearance gap beyond that edge, not from the center, so it scales
// correctly if heroColumns/heroColSpacing ever change.
export function layoutPetPositions(count: number): Position[] {
  const { x, y } = mapConfig.heroPosition;
  const heroGridLeftEdge = x - ((mapConfig.heroColumns - 1) / 2) * mapConfig.heroColSpacing;
  const petX = heroGridLeftEdge - mapConfig.petTrailOffset;
  return Array.from({ length: count }, (_, index) => ({
    x: petX,
    y: y + (index - (count - 1) / 2) * mapConfig.petRowSpacing,
  }));
}
