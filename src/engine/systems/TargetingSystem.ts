import type { EnemyState, Position } from '../types';

export function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export interface TargetingContext {
  basePosition: Position;
  originPosition: Position;
}

// Negative = a should be preferred over b, positive = b preferred, 0 = tie
// (falls through to the next strategy when combined).
export type TargetComparator = (a: EnemyState, b: EnemyState, context: TargetingContext) => number;

// Each strategy is independent and knows nothing about the others - adding a
// new one (e.g. "highest threat") never requires touching pickBestTarget,
// pickTopTargets, or any existing strategy.
export const TargetingStrategies: Record<string, TargetComparator> = {
  closestToBase: (a, b, context) => distance(a.position, context.basePosition) - distance(b.position, context.basePosition),
  closestToHero: (a, b, context) => distance(a.position, context.originPosition) - distance(b.position, context.originPosition),
  lowestHp: (a, b) => a.currentHp - b.currentHp,
  highestHp: (a, b) => b.currentHp - a.currentHp,
  strongest: (a, b) => b.maxHp - a.maxHp,
  random: () => Math.random() - 0.5,
};

// Chains strategies as an ordered tiebreak: the first one that doesn't
// return 0 decides. This is how a "priority" (several strategies in
// sequence) is built out of individually reusable strategies.
export function combineStrategies(...strategies: TargetComparator[]): TargetComparator {
  return (a, b, context) => {
    for (const strategy of strategies) {
      const result = strategy(a, b, context);
      if (result !== 0) {
        return result;
      }
    }
    return 0;
  };
}

// The hero's current default: protect the base first, finish off already-
// weakened enemies second, break remaining ties by proximity. Towers,
// skills, companions, and bosses are free to combine TargetingStrategies
// differently (or add new strategies) without touching this one.
export const heroDefaultStrategy = combineStrategies(
  TargetingStrategies.closestToBase,
  TargetingStrategies.lowestHp,
  TargetingStrategies.closestToHero,
);

export function getEnemiesInRange(enemies: EnemyState[], origin: Position, range: number): EnemyState[] {
  return enemies.filter((enemy) => distance(enemy.position, origin) <= range);
}

export function pickBestTarget(
  candidates: EnemyState[],
  strategy: TargetComparator,
  context: TargetingContext,
): EnemyState | null {
  if (candidates.length === 0) {
    return null;
  }
  return candidates.reduce((best, candidate) => (strategy(candidate, best, context) < 0 ? candidate : best));
}

export function pickTopTargets(
  candidates: EnemyState[],
  strategy: TargetComparator,
  context: TargetingContext,
  count: number,
): EnemyState[] {
  return [...candidates].sort((a, b) => strategy(a, b, context)).slice(0, count);
}
