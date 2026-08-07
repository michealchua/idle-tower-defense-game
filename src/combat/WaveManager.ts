import { CombatEngine } from './CombatEngine';
import { EnemyFactory } from './EnemyFactory';
import type { LevelConfig, WaveConfig } from './WaveConfig';

export enum WaveState {
  /** Counting down the current wave's delayBeforeStart before its first spawn. */
  Waiting = 'waiting',
  /** Draining the current wave's spawn queue, then waiting for the field to clear once it's empty. */
  Spawning = 'spawning',
}

export interface WaveManagerCallbacks {
  onWaveStart?: (config: WaveConfig, waveIndex: number) => void;
  /** `nextDelaySeconds` is the upcoming wave's own delayBeforeStart, or null if the wave that just cleared was the level's last one. */
  onWaveComplete?: (waveId: string, waveIndex: number, nextDelaySeconds: number | null) => void;
  /** Fired exactly once, when the level's last wave finishes spawning and every enemy from it is gone (dead or escaped). */
  onLevelCleared?: () => void;
}

/** One flattened spawn-queue entry - a single enemy still waiting to appear, carrying its own group's interval. */
interface QueuedSpawn {
  enemyType: string;
  interval: number;
}

/**
 * Drives a LevelConfig's wave-by-wave progression for one CombatEngine:
 * WAITING (delayBeforeStart countdown) -> SPAWNING (drains the wave's
 * flattened spawn queue, then waits for the field to clear) -> next wave's
 * WAITING, or - past the last wave - isLevelCleared() flips true and stays
 * true (update() becomes a no-op from then on, mirroring GameManager's own
 * GameOver/Victory halt). Owns its own EnemyFactory and only ever talks to
 * the engine through combatEngine.addEnemy/getAliveEnemies - a one-way
 * flow from wave state into the engine, never the other direction.
 */
export class WaveManager {
  private readonly combatEngine: CombatEngine;
  private readonly levelConfig: LevelConfig;
  private readonly callbacks: WaveManagerCallbacks;
  private readonly enemyFactory = new EnemyFactory();

  private currentWaveIndex = -1;
  private waveState: WaveState = WaveState.Waiting;
  private waitTimer = 0;
  private spawnQueue: QueuedSpawn[] = [];
  private spawnTimer = 0;
  private cleared = false;

  constructor(combatEngine: CombatEngine, levelConfig: LevelConfig, callbacks: WaveManagerCallbacks = {}) {
    this.combatEngine = combatEngine;
    this.levelConfig = levelConfig;
    this.callbacks = callbacks;
  }

  get activeWaveId(): string | null {
    return this.currentWaveConfig?.waveId ?? null;
  }

  /** 0-based index of the wave currently WAITING/SPAWNING - stays at the last wave's index once isLevelCleared(), -1 before start() is called. */
  get currentIndex(): number {
    return this.currentWaveIndex;
  }

  get totalWaveCount(): number {
    return this.levelConfig.waves.length;
  }

  get state(): WaveState {
    return this.waveState;
  }

  /** True once the level's final wave has fully spawned and every enemy from it is gone (dead or escaped) - GameManager's trigger for GameState.Victory. */
  isLevelCleared(): boolean {
    return this.cleared;
  }

  private get currentWaveConfig(): WaveConfig | undefined {
    return this.levelConfig.waves[this.currentWaveIndex];
  }

  /** Begins the level: enters WAITING on wave 0. No-op if already started or the level has no waves. */
  start(): void {
    if (this.currentWaveIndex >= 0 || this.levelConfig.waves.length === 0) {
      return;
    }
    this.currentWaveIndex = 0;
    this.enterWaiting(this.levelConfig.waves[0]);
  }

  /**
   * Hardcore-mechanic seam: skips the rest of the current wave's WAITING
   * countdown and begins SPAWNING immediately - the hook a future "start
   * early for bonus gold" feature calls into. A no-op outside WAITING
   * (already spawning, level cleared, or start() never called) - there's
   * no countdown to skip in any of those states.
   */
  forceStartNextWave(): void {
    if (this.waveState !== WaveState.Waiting) {
      return;
    }
    const config = this.currentWaveConfig;
    if (config) {
      this.beginSpawning(config);
    }
  }

  /**
   * Advances deltaTime seconds through whichever state the current wave is
   * in. A no-op once isLevelCleared() or before start() has been called.
   */
  update(deltaTime: number): void {
    if (this.cleared || this.currentWaveIndex < 0) {
      return;
    }

    if (this.waveState === WaveState.Waiting) {
      this.waitTimer -= deltaTime;
      if (this.waitTimer <= 0) {
        const config = this.currentWaveConfig;
        if (config) {
          this.beginSpawning(config);
        }
      }
      return;
    }

    this.tickSpawning(deltaTime);
  }

  private enterWaiting(config: WaveConfig): void {
    this.waveState = WaveState.Waiting;
    this.waitTimer = config.delayBeforeStart;
  }

  private beginSpawning(config: WaveConfig): void {
    this.waveState = WaveState.Spawning;
    this.spawnQueue = this.buildSpawnQueue(config);
    // Mirrors the pre-step-14 single-interval design: the first enemy still
    // waits out one full interval rather than appearing the instant
    // spawning starts.
    this.spawnTimer = this.spawnQueue[0]?.interval ?? 0;
    this.callbacks.onWaveStart?.(config, this.currentWaveIndex);
  }

  /** Expands each SpawnConfig group into `count` individually-queued entries, each still carrying its own group's interval - what lets goblins arrive faster than the orcs/boss queued after them in the same wave. */
  private buildSpawnQueue(config: WaveConfig): QueuedSpawn[] {
    const queue: QueuedSpawn[] = [];
    for (const spawn of config.spawns) {
      for (let i = 0; i < spawn.count; i += 1) {
        queue.push({ enemyType: spawn.enemyType, interval: spawn.interval });
      }
    }
    return queue;
  }

  /**
   * Counts the spawn timer down by deltaTime; each time it lapses, pops
   * the next queued enemy and pushes it into the CombatEngine, then resets
   * the timer using *that entry's own* interval. A while loop (not a
   * single if) so a large deltaTime spike still spawns every enemy whose
   * interval elapsed rather than silently dropping ticks. Once the queue's
   * empty AND the field's clear, this wave (and possibly the whole level)
   * is done.
   */
  private tickSpawning(deltaTime: number): void {
    this.spawnTimer -= deltaTime;

    while (this.spawnTimer <= 0 && this.spawnQueue.length > 0) {
      const next = this.spawnQueue.shift();
      if (next) {
        this.combatEngine.addEnemy(this.enemyFactory.create(next.enemyType));
        this.spawnTimer += next.interval;
      }
    }

    if (this.spawnQueue.length === 0 && this.combatEngine.getAliveEnemies().length === 0) {
      this.handleWaveCleared();
    }
  }

  private handleWaveCleared(): void {
    const finishedConfig = this.currentWaveConfig;
    if (!finishedConfig) {
      return;
    }

    const nextIndex = this.currentWaveIndex + 1;
    const nextConfig = this.levelConfig.waves[nextIndex];

    this.callbacks.onWaveComplete?.(finishedConfig.waveId, this.currentWaveIndex, nextConfig?.delayBeforeStart ?? null);

    if (!nextConfig) {
      this.cleared = true;
      this.callbacks.onLevelCleared?.();
      return;
    }

    this.currentWaveIndex = nextIndex;
    this.enterWaiting(nextConfig);
  }
}
