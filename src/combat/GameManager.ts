import { CombatEngine, type DamageDealtEvent } from './CombatEngine';
import { WaveManager, type WaveConfig } from './WaveManager';
import type { BattleHero } from './BattleHero';
import type { BattleEnemy } from './BattleEnemy';
import { heroCatalog, createBattleHeroFromCatalog } from './heroCatalog';
import { gridCellCenter, type GridCell } from './gridConfig';

/** Seconds of downtime between one wave finishing and the next one starting. */
const WAVE_DELAY_SECONDS = 2;

/** Coarse run state - GameManager.update becomes a no-op the instant this flips to GameOver, and tryPlaceHero starts rejecting every request. */
export enum GameState {
  Playing = 'playing',
  GameOver = 'gameOver',
}

export interface GameManagerCallbacks {
  onDamageDealt?: (event: DamageDealtEvent) => void;
  onEnemyDefeated?: (enemy: BattleEnemy, goldGained: number, expGained: number) => void;
  /** An enemy walked past ENEMY_PATH's final waypoint uncontested - fired *after* GameManager has already applied its baseDamage to baseHp (and, if that dropped baseHp to 0, after gameState has already flipped to GameOver and onGameOver has already fired). */
  onEnemyReachedEnd?: (enemy: BattleEnemy) => void;
  onWaveComplete?: (waveId: string, nextDelaySeconds: number) => void;
  onWaveStart?: (config: WaveConfig, waveIndex: number) => void;
  /** Fires exactly once, the instant baseHp first reaches 0. */
  onGameOver?: () => void;
}

export interface GameManagerOptions {
  /** Gold the run starts with - without some seed amount the player could never afford heroCatalog's cheapest entry, since gold only otherwise accrues from kills a hero has to already be on the field to make happen. */
  startingGold?: number;
  /** Base HP the run starts (and tops out) at. */
  maxBaseHp?: number;
}

export type PlaceHeroResult =
  | { success: true; hero: BattleHero }
  | { success: false; reason: 'unknown_hero_type' | 'insufficient_gold' | 'cell_occupied' | 'game_over' };

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

  readonly maxBaseHp: number;
  baseHp: number;
  gameState: GameState = GameState.Playing;

  autoNextWave = true;

  private readonly waveConfigs: WaveConfig[];
  private currentWaveIndex = -1;
  private waveDelayTimer: number | null = null;

  private readonly callbacks: GameManagerCallbacks;

  constructor(waveConfigs: WaveConfig[], callbacks: GameManagerCallbacks = {}, options: GameManagerOptions = {}) {
    this.waveConfigs = waveConfigs;
    this.callbacks = callbacks;
    this.gold = options.startingGold ?? 0;
    this.maxBaseHp = options.maxBaseHp ?? 10;
    this.baseHp = this.maxBaseHp;

    this.combatEngine = new CombatEngine({
      onDamageDealt: (event) => this.callbacks.onDamageDealt?.(event),
      onEnemyDefeated: (enemy) => this.handleEnemyDefeated(enemy),
      onEnemyReachedEnd: (enemy) => this.handleEnemyReachedEnd(enemy),
    });
    this.waveManager = new WaveManager(this.combatEngine);
  }

  addHero(hero: BattleHero): void {
    this.combatEngine.addHero(hero);
  }

  // A plain boolean-typed getter, not a direct `this.gameState ===
  // GameState.GameOver` comparison, at both call sites in update() below -
  // TypeScript's control-flow narrowing otherwise "remembers" the first
  // check's result (gameState is GameState.Playing) straight through the
  // combatEngine.update() call in between, even though that call can - via
  // handleEnemyReachedEnd - mutate gameState out from under it, and flags
  // the second comparison as an impossible literal-type overlap.
  private get isGameOver(): boolean {
    return this.gameState === GameState.GameOver;
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
    if (this.isGameOver) {
      return { success: false, reason: 'game_over' };
    }

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

  /**
   * Applies `enemy`'s baseDamage to baseHp and, if that's the hit that
   * drains it to 0, flips gameState to GameOver and fires onGameOver -
   * exactly once, since the top-of-function guard below stops a second
   * enemy reaching the end in the same tick (CombatEngine's cleanup can
   * call this more than once per update()) from re-entering the <=0 branch.
   */
  private handleEnemyReachedEnd(enemy: BattleEnemy): void {
    if (this.isGameOver) {
      this.callbacks.onEnemyReachedEnd?.(enemy);
      return;
    }

    this.baseHp = Math.max(0, this.baseHp - enemy.baseDamage);
    if (this.baseHp <= 0) {
      this.gameState = GameState.GameOver;
      this.callbacks.onGameOver?.();
    }

    this.callbacks.onEnemyReachedEnd?.(enemy);
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
   * delay, and auto-starts the next wave once the delay lapses. A no-op the
   * instant gameState is GameOver - checked both up front (skips the whole
   * tick outright once the base has already fallen) and again right after
   * combatEngine.update (in case *this* tick's enemy-reached-end cleanup is
   * what just flipped it, so the wave machine below never gets one extra
   * tick's worth of spawning/timer progress after the loss).
   */
  update(deltaTime: number): void {
    if (this.isGameOver) {
      return;
    }

    this.combatEngine.update(deltaTime);

    if (this.isGameOver) {
      return;
    }

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
