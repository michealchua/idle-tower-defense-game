import { CombatEngine } from './CombatEngine';
import { EnemyFactory } from './EnemyFactory';

export interface WaveEnemySpawn {
  enemyTypeId: string;
  count: number;
}

export interface WaveConfig {
  waveId: string;
  enemiesToSpawn: WaveEnemySpawn[];
  /** Milliseconds between each individual enemy spawn within this wave. */
  spawnInterval: number;
}

/**
 * Drives enemy spawning for one CombatEngine over time. Owns its own
 * EnemyFactory and only ever talks to the engine through
 * combatEngine.addEnemy/getAliveEnemies - a one-way flow from wave state
 * into the engine, never the other direction.
 */
export class WaveManager {
  private readonly combatEngine: CombatEngine;
  private readonly enemyFactory = new EnemyFactory();

  private currentWave: WaveConfig | null = null;
  /** Flattened enemy type ids still waiting to spawn, in spawn order. */
  private spawnQueue: string[] = [];
  private spawnTimerMs = 0;

  constructor(combatEngine: CombatEngine) {
    this.combatEngine = combatEngine;
  }

  get activeWaveId(): string | null {
    return this.currentWave?.waveId ?? null;
  }

  /** Resets spawn state and begins spawning the given wave's enemies one at a time. */
  startWave(config: WaveConfig): void {
    this.currentWave = config;
    this.spawnQueue = config.enemiesToSpawn.flatMap((spawn) => Array(spawn.count).fill(spawn.enemyTypeId) as string[]);
    this.spawnTimerMs = config.spawnInterval;
  }

  /** True once every enemy for the current wave has been spawned and none remain alive in the engine. */
  isWaveComplete(): boolean {
    return this.spawnQueue.length === 0 && this.combatEngine.getAliveEnemies().length === 0;
  }

  /**
   * Counts the spawn timer down by deltaTime (seconds); each time it lapses,
   * pops the next queued enemy type, builds it via EnemyFactory, and pushes
   * it straight into the CombatEngine. A while-loop (not a single if) so a
   * large deltaTime spike still spawns every enemy whose interval elapsed,
   * rather than silently dropping ticks.
   */
  update(deltaTime: number): void {
    if (!this.currentWave || this.spawnQueue.length === 0) {
      return;
    }

    this.spawnTimerMs -= deltaTime * 1000;

    while (this.spawnTimerMs <= 0 && this.spawnQueue.length > 0) {
      const enemyTypeId = this.spawnQueue.shift();
      if (enemyTypeId) {
        this.combatEngine.addEnemy(this.enemyFactory.create(enemyTypeId));
      }
      this.spawnTimerMs += this.currentWave.spawnInterval;
    }
  }
}
