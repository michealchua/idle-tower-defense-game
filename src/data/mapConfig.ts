import type { Position } from '../engine/types';
import { maxDeployedHeroesCap } from './squadConfig';

export const mapConfig = {
  spawnPosition: { x: 370, y: 150 },
  basePosition: { x: 30, y: 150 },
  heroPosition: { x: 150, y: 150 },
  baseArrivalDistance: 10,
  heroRowSpacing: 40,
  // 3-wide grid instead of a single column, so a growing squad
  // (squadConfig's wave-gated slot unlocks) wraps into more rows instead of
  // one ever-taller column. See layoutHeroPositions.
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

// Always the full 9-cell grid (maxDeployedHeroesCap), regardless of the
// squad's current wave-gated cap (squadConfig.getMaxDeployedHeroes) or how
// many heroes are actually deployed - unlike layoutHeroPositions(count)
// above, whose row count (and therefore every cell's y) shifts on every
// single deploy/undeploy/cap-growth. Slot index is persistent per hero
// (HeroState.deployedSlotIndex, see HeroSystem.relayoutDeployedHeroes)
// rather than derived from array order, so a hero's cell must stay fixed
// across squad changes for the "drag to any of the 9 cells" gesture
// (BattleScreen's canvas-native drag) to feel stable - and the player needs
// to see the real, complete 3x3 shape (including cells locked behind a
// later squadSlotUnlockWaves milestone) to understand what they're dragging
// into, not a partial grid that only shows as many cells as they've
// currently unlocked. BattleScreen is responsible for drawing cells at/
// beyond the current cap as locked and rejecting drops onto them (see
// HeroSystem.moveHeroToSlot's own cap check) - this function only ever
// hands back geometry, never gates by unlock state.
export function layoutSlotPositions(): Position[] {
  return layoutHeroPositions(maxDeployedHeroesCap);
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
