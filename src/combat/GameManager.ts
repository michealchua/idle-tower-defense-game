import { CombatEngine, type DamageDealtEvent } from './CombatEngine';
import { WaveManager, type WaveConfig } from './WaveManager';
import type { BattleHero } from './BattleHero';
import type { BattleEnemy } from './BattleEnemy';
import { heroCatalog, createBattleHeroFromCatalog } from './heroCatalog';
import { gridCellCenter, type GridCell } from './gridConfig';

/** Seconds of downtime between one wave finishing and the next one starting. */
const WAVE_DELAY_SECONDS = 2;

export interface GameManagerCallbacks {
  onDamageDealt?: (event: DamageDealtEvent) => void;
  onEnemyDefeated?: (enemy: BattleEnemy, goldGained: number, expGained: number) => void;
  onWaveComplete?: (waveId: string, nextDelaySeconds: number) => void;
  onWaveStart?: (config: WaveConfig, waveIndex: number) => void;
}

export interface GameManagerOptions {
  /** Gold the run starts with - without some seed amount the player could never afford heroCatalog's cheapest entry, since gold only otherwise accrues from kills a hero has to already be on the field to make happen. */
  startingGold?: number;
}

export type PlaceHeroResult =
  | { success: true; hero: BattleHero }
  | { success: false; reason: 'unknown_hero_type' | 'insufficient_gold' | 'cell_occupied' };

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

  constructor(waveConfigs: WaveConfig[], callbacks: GameManagerCallbacks = {}, options: GameManagerOptions = {}) {
    this.waveConfigs = waveConfigs;
    this.callbacks = callbacks;
    this.gold = options.startingGold ?? 0;

    this.combatEngine = new CombatEngine({
      onDamageDealt: (event) => this.callbacks.onDamageDealt?.(event),
      onEnemyDefeated: (enemy) => this.handleEnemyDefeated(enemy),
    });
    this.waveManager = new WaveManager(this.combatEngine);
  }

  addHero(hero: BattleHero): void {
    this.combatEngine.addHero(hero);
  }

  /**
   * Validates the requested heroCatalog entry against the target grid
   * cell's occupancy and current gold, in that order - the cell must be
   * free *before* gold is ever touched, so a rejected placement never costs
   * anything. Only once both checks pass does it deduct cost, build the
   * hero via createBattleHeroFromCatalog positioned at the cell's center,
   * and register it in the CombatEngine at that cell. Read-only callers
   * (InputManager, UI) get a typed result back instead of a thrown error,
   * since both failure modes are expected everyday outcomes here, not bugs.
   */
  tryPlaceHero(heroTypeId: string, cell: GridCell): PlaceHeroResult {
    const entry = heroCatalog[heroTypeId];
    if (!entry) {
      return { success: false, reason: 'unknown_hero_type' };
    }

    if (this.combatEngine.isCellOccupied(cell.col, cell.row)) {
      console.warn(`GameManager.tryPlaceHero: cell (${cell.col}, ${cell.row}) is already occupied - placement rejected`);
      return { success: false, reason: 'cell_occupied' };
    }

    if (this.gold < entry.cost) {
      return { success: false, reason: 'insufficient_gold' };
    }

    this.gold -= entry.cost;
    const hero = createBattleHeroFromCatalog(entry, gridCellCenter(cell.col, cell.row));
    this.combatEngine.addHeroAtCell(hero, cell);
    return { success: true, hero };
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
