import { CombatEngine, type DamageDealtEvent } from './CombatEngine';
import { WaveManager, type WaveConfig } from './WaveManager';
import type { BattleHero } from './BattleHero';
import type { BattleEnemy } from './BattleEnemy';

/** Seconds of downtime between one wave finishing and the next one starting. */
const WAVE_DELAY_SECONDS = 2;

export interface GameManagerCallbacks {
  onDamageDealt?: (event: DamageDealtEvent) => void;
  onEnemyDefeated?: (enemy: BattleEnemy, goldGained: number, expGained: number) => void;
  onWaveComplete?: (waveId: string, nextDelaySeconds: number) => void;
  onWaveStart?: (config: WaveConfig, waveIndex: number) => void;
}

/**
 * Top-level orchestrator that owns the run's CombatEngine + WaveManager and
 * the persistent gold/experience totals earned across every wave. Also owns
 * the wave-to-wave state machine: once a wave finishes, it counts down
 * WAVE_DELAY_SECONDS before auto-starting the next configured wave (if any).
 */
export class GameManager {
  readonly combatEngine: CombatEngine;
  readonly waveManager: WaveManager;

  gold = 0;
  experience = 0;

  autoNextWave = true;

  private readonly waveConfigs: WaveConfig[];
  private currentWaveIndex = -1;
  private waveDelayTimer: number | null = null;

  private readonly callbacks: GameManagerCallbacks;

  constructor(waveConfigs: WaveConfig[], callbacks: GameManagerCallbacks = {}) {
    this.waveConfigs = waveConfigs;
    this.callbacks = callbacks;

    this.combatEngine = new CombatEngine({
      onDamageDealt: (event) => this.callbacks.onDamageDealt?.(event),
      onEnemyDefeated: (enemy) => this.handleEnemyDefeated(enemy),
    });
    this.waveManager = new WaveManager(this.combatEngine);
  }

  addHero(hero: BattleHero): void {
    this.combatEngine.addHero(hero);
  }

  /** Starts the first configured wave. No-op if there are no waves or a wave is already running. */
  start(): void {
    if (this.currentWaveIndex >= 0) {
      return;
    }
    this.advanceToNextWave();
  }

  private handleEnemyDefeated(enemy: BattleEnemy): void {
    this.gold += enemy.goldReward;
    this.experience += enemy.expReward;
    this.callbacks.onEnemyDefeated?.(enemy, enemy.goldReward, enemy.expReward);
  }

  private advanceToNextWave(): void {
    this.currentWaveIndex += 1;
    const nextConfig = this.waveConfigs[this.currentWaveIndex];
    if (!nextConfig) {
      return;
    }
    this.waveDelayTimer = null;
    this.waveManager.startWave(nextConfig);
    this.callbacks.onWaveStart?.(nextConfig, this.currentWaveIndex);
  }

  /**
   * Advances combat and spawning by deltaTime seconds, then drives the wave
   * state machine: detects wave completion, counts down the inter-wave
   * delay, and auto-starts the next wave once the delay lapses.
   */
  update(deltaTime: number): void {
    this.combatEngine.update(deltaTime);
    this.waveManager.update(deltaTime);

    const activeWaveId = this.waveManager.activeWaveId;
    if (!activeWaveId) {
      return;
    }

    if (this.waveManager.isWaveComplete()) {
      if (this.waveDelayTimer === null) {
        this.waveDelayTimer = WAVE_DELAY_SECONDS;
        this.callbacks.onWaveComplete?.(activeWaveId, WAVE_DELAY_SECONDS);
      } else {
        this.waveDelayTimer -= deltaTime;
        if (this.waveDelayTimer <= 0 && this.autoNextWave) {
          this.advanceToNextWave();
        }
      }
    }
  }
}
