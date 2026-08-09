// JSON-friendly wave/level configuration data - plain interfaces and (in
// sampleLevelConfig.ts) plain object literals, no functions or class
// instances, so a real level could be authored as a .json file and parsed
// straight into a LevelConfig with no translation layer.
//
// delayBeforeStart/interval are expressed in seconds, not discrete frame
// counts: this codebase's requestAnimationFrame loop already ticks every
// timer (CombatEngine, BattleHero cooldowns, BattleEnemy movement,
// GameManager's old wave delay) as continuous deltaTime in seconds, so
// these follow the same convention rather than introducing a second,
// frame-counted time system alongside it.

export interface SpawnConfig {
  /** Enemy type id - looked up in EnemyFactory's enemyTypeDefinitions (e.g. 'goblin', 'orc', 'boss_demon'). */
  enemyType: string;
  count: number;
  /** Seconds between each individual spawn within this group. */
  interval: number;
}

export interface WaveConfig {
  waveId: string;
  /** Seconds WaveManager spends in WaveState.Waiting before this wave's first spawn. */
  delayBeforeStart: number;
  /** Spawn groups run in array order - each group fully drains (its `count`, at its own `interval`) before the next group's interval takes over. */
  spawns: SpawnConfig[];
}

export interface LevelConfig {
  waves: WaveConfig[];
}

export type BossKind = 'miniboss' | 'boss';

/**
 * Derives whether a wave contains a boss-tier enemy directly from its spawn
 * list, rather than a separate hand-authored flag on WaveConfig that could
 * drift out of sync with the spawns themselves. Any spawn whose enemyType
 * resolves to an `isElite` EnemyTypeDefinition counts; the enemyType id
 * containing "miniboss" (case-insensitive) selects the miniboss BGM instead
 * of the full boss one - a naming convention, not a schema field, so new
 * miniboss types need no changes here. Returns undefined for a normal wave.
 */
export function getWaveBossKind(config: WaveConfig, isEliteEnemyType: (enemyType: string) => boolean): BossKind | undefined {
  const eliteSpawn = config.spawns.find((spawn) => isEliteEnemyType(spawn.enemyType));
  if (!eliteSpawn) {
    return undefined;
  }
  return /miniboss/i.test(eliteSpawn.enemyType) ? 'miniboss' : 'boss';
}
