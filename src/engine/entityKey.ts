// Stable per-entity identifiers for VisualEffect.entityKey - lets
// CanvasRenderer attribute an effect (attack pulse, hit flash/squash) to the
// exact hero/enemy it belongs to instead of applying it to every entity of
// that type. Prefixed and namespaced together (rather than two separate
// fields) since HeroState.id (string, roster id) and EnemyState.instanceId
// (number) live in different id spaces and a raw number/string could
// otherwise collide.
export function heroEntityKey(heroId: string): string {
  return `hero:${heroId}`;
}

export function enemyEntityKey(instanceId: number): string {
  return `enemy:${instanceId}`;
}
