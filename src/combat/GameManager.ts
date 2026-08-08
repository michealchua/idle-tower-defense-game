import { CombatEngine, type DamageDealtEvent, type HeroDamagedEvent } from './CombatEngine';
import { WaveManager } from './WaveManager';
import type { LevelConfig, WaveConfig } from './WaveConfig';
import type { BattleHero } from './BattleHero';
import type { BattleEnemy } from './BattleEnemy';
import { heroCatalog, createBattleHeroFromCatalog } from './heroCatalog';
import { heroEvolutions } from './heroEvolution';
import { gridCellCenter, type GridCell } from './gridConfig';
import { InventoryManager } from './InventoryManager';
import type { EquipmentItem, EquipmentSlot } from './Equipment';

/** Coarse run state - GameManager.update becomes a no-op the instant this leaves Playing, and tryPlaceHero starts rejecting every request. */
export enum GameState {
  Playing = 'playing',
  GameOver = 'gameOver',
  Victory = 'victory',
}

export interface GameManagerCallbacks {
  onDamageDealt?: (event: DamageDealtEvent) => void;
  /** Fired for every enemy attack or AoE-pulse hit that lands on a hero - see CombatEngine's HeroDamagedEvent doc comment. */
  onHeroDamaged?: (event: HeroDamagedEvent) => void;
  onEnemyDefeated?: (enemy: BattleEnemy, goldGained: number, expGained: number) => void;
  /** Fired whenever a defeated elite/boss enemy's loot roll actually produces an item (see InventoryManager.rollLootFor) - the item's already in `inventory` by the time this fires. */
  onLootDropped?: (item: EquipmentItem) => void;
  /** An enemy walked past ENEMY_PATH's final waypoint uncontested - fired *after* GameManager has already applied its baseDamage to baseHp (and, if that dropped baseHp to 0, after gameState has already flipped to GameOver and onGameOver has already fired). */
  onEnemyReachedEnd?: (enemy: BattleEnemy) => void;
  onWaveStart?: (config: WaveConfig, waveIndex: number) => void;
  /** `nextDelaySeconds` is the upcoming wave's own delayBeforeStart, or null if the wave that just cleared was the level's last one (about to trigger onVictory, baseHp permitting). */
  onWaveComplete?: (waveId: string, waveIndex: number, nextDelaySeconds: number | null) => void;
  /** Fires exactly once, the instant baseHp first reaches 0. */
  onGameOver?: () => void;
  /** Fires exactly once, the instant the level's last wave clears with baseHp still above 0. */
  onVictory?: () => void;
  /** Fired whenever forceStartNextWave() actually skipped a WAITING countdown (not on a no-op call) - `amount` is however much bonus gold that just earned. */
  onForceStartBonus?: (amount: number) => void;
}

export interface GameManagerOptions {
  /** Gold the run starts with - without some seed amount the player could never afford heroCatalog's cheapest entry, since gold only otherwise accrues from kills a hero has to already be on the field to make happen. */
  startingGold?: number;
  /** Base HP the run starts (and tops out) at. */
  maxBaseHp?: number;
  /** Gold awarded each time forceStartNextWave() actually skips a WAITING countdown - the reward for taking the risk of fighting the next wave without the full delay to prepare. */
  forceStartBonusGold?: number;
}

/** Fraction of maxHp a dead hero comes back with when reviveDeadHeroes() runs at the start of the next wave - a real cost (not a full heal) for having gone down, but enough to actually contribute again rather than dying to the first hit. */
const HERO_REVIVE_HP_RATIO = 0.5;

export type PlaceHeroResult =
  | { success: true; hero: BattleHero }
  | { success: false; reason: 'unknown_hero_type' | 'insufficient_gold' | 'cell_occupied' | 'game_over' };

export type UpgradeHeroResult =
  | { success: true; hero: BattleHero }
  | { success: false; reason: 'game_over' | 'unknown_hero' | 'insufficient_gold' };

export type EvolveHeroResult =
  | { success: true; hero: BattleHero }
  | {
      success: false;
      reason: 'game_over' | 'unknown_hero' | 'already_evolved' | 'no_evolution_available' | 'level_too_low' | 'unknown_evolution_option' | 'insufficient_gold';
    };

export type EquipItemResult =
  | { success: true; hero: BattleHero; equippedItem: EquipmentItem; previousItem: EquipmentItem | null }
  | { success: false; reason: 'game_over' | 'unknown_hero' | 'unknown_item' };

export type UnequipItemResult =
  | { success: true; hero: BattleHero; unequippedItem: EquipmentItem | null }
  | { success: false; reason: 'game_over' | 'unknown_hero' };

/**
 * Top-level orchestrator that owns the run's CombatEngine + WaveManager and
 * the persistent gold/experience/baseHp totals across the whole level.
 * Wave-to-wave progression (delays, spawn pacing, level-cleared detection)
 * all lives in WaveManager now - GameManager just constructs it with the
 * LevelConfig, starts it, and each tick checks whether it's time to end the
 * run (GameOver via baseHp, or Victory via WaveManager.isLevelCleared()).
 */
export class GameManager {
  readonly combatEngine: CombatEngine;
  readonly waveManager: WaveManager;
  /** Global, run-scoped bag of unequipped EquipmentItems - see InventoryManager's doc comment. Populated by handleEnemyDefeated's loot roll, drained/refilled by tryEquipItem/tryUnequipItem. */
  readonly inventory = new InventoryManager();

  gold = 0;
  experience = 0;

  readonly maxBaseHp: number;
  baseHp: number;
  gameState: GameState = GameState.Playing;

  private readonly forceStartBonusGold: number;
  private readonly callbacks: GameManagerCallbacks;

  constructor(levelConfig: LevelConfig, callbacks: GameManagerCallbacks = {}, options: GameManagerOptions = {}) {
    this.callbacks = callbacks;
    this.gold = options.startingGold ?? 0;
    this.maxBaseHp = options.maxBaseHp ?? 10;
    this.baseHp = this.maxBaseHp;
    this.forceStartBonusGold = options.forceStartBonusGold ?? 20;

    this.combatEngine = new CombatEngine({
      onDamageDealt: (event) => this.callbacks.onDamageDealt?.(event),
      onEnemyDefeated: (enemy) => this.handleEnemyDefeated(enemy),
      onEnemyReachedEnd: (enemy) => this.handleEnemyReachedEnd(enemy),
      onHeroDamaged: (event) => this.callbacks.onHeroDamaged?.(event),
    });
    this.waveManager = new WaveManager(this.combatEngine, levelConfig, {
      onWaveStart: (config, index) => {
        // Whatever heroes died during the wave that just finished get a
        // chance to fight again from the very next wave, not left dead for
        // the rest of the run - fired here (spawning actually beginning,
        // not just the WAITING countdown starting) so the field is fully
        // reset before the first enemy of the new wave appears.
        this.reviveDeadHeroes();
        this.callbacks.onWaveStart?.(config, index);
      },
      onWaveComplete: (waveId, index, nextDelay) => this.callbacks.onWaveComplete?.(waveId, index, nextDelay),
    });
  }

  /** Revives every hero still dead (see BattleHero.isDead) at HERO_REVIVE_HP_RATIO of its maxHp - a no-op for any hero that's still alive, so calling this over the whole roster every wave never disturbs a hero mid-fight. */
  private reviveDeadHeroes(): void {
    for (const hero of this.combatEngine.getHeroes()) {
      if (hero.isDead) {
        hero.revive(HERO_REVIVE_HP_RATIO);
      }
    }
  }

  addHero(hero: BattleHero): void {
    this.combatEngine.addHero(hero);
  }

  // A plain boolean-typed getter, not a direct `this.gameState ===
  // GameState.X` comparison, at every call site in update() below -
  // TypeScript's control-flow narrowing otherwise "remembers" an earlier
  // check's result straight through the combatEngine.update()/
  // waveManager.update() calls in between, even though those calls can (via
  // handleEnemyReachedEnd / the level-cleared check) mutate gameState out
  // from under it, and flags a later comparison as an impossible literal-
  // type overlap.
  private get isRunOver(): boolean {
    return this.gameState !== GameState.Playing;
  }

  /**
   * Validates the requested heroCatalog entry against the run's state, the
   * target grid cell's occupancy, and current gold, in that order - the
   * cell must be free *before* gold is ever touched, so a rejected
   * placement never costs anything. Only once every check passes does it
   * deduct cost, build the hero via createBattleHeroFromCatalog positioned
   * at the cell's center, and register it in the CombatEngine at that
   * cell. Read-only callers (InputManager, UI) get a typed result back
   * instead of a thrown error, since every failure mode here is an
   * expected everyday outcome, not a bug.
   */
  tryPlaceHero(heroTypeId: string, cell: GridCell): PlaceHeroResult {
    if (this.isRunOver) {
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

  /**
   * Validates the run state, that `heroInstanceId` names a hero actually
   * on the field, and current gold against BattleHero.getUpgradeCost() -
   * in that order, gold last, so a rejected upgrade never costs anything.
   * Only once every check passes does it deduct cost and call
   * hero.upgrade(). Same typed-result-over-thrown-error pattern as
   * tryPlaceHero.
   */
  tryUpgradeHero(heroInstanceId: string): UpgradeHeroResult {
    if (this.isRunOver) {
      return { success: false, reason: 'game_over' };
    }

    const hero = this.combatEngine.getHero(heroInstanceId);
    if (!hero) {
      return { success: false, reason: 'unknown_hero' };
    }

    const cost = hero.getUpgradeCost();
    if (this.gold < cost) {
      return { success: false, reason: 'insufficient_gold' };
    }

    this.gold -= cost;
    hero.upgrade();
    return { success: true, hero };
  }

  /**
   * Validates, in order: run state, that `heroInstanceId` names a hero on
   * the field, that it hasn't already evolved, that heroEvolutions even
   * has an entry for its heroTypeId, that its level meets that entry's
   * requiredLevel, that `evolutionOptionId` names one of that entry's
   * actual options, and finally that there's enough gold for that
   * option's cost - gold checked dead last, same "never charge for a
   * rejected action" rule tryPlaceHero/tryUpgradeHero already follow. Only
   * once everything passes does it deduct cost and call hero.evolveInto.
   */
  tryEvolveHero(heroInstanceId: string, evolutionOptionId: string): EvolveHeroResult {
    if (this.isRunOver) {
      return { success: false, reason: 'game_over' };
    }

    const hero = this.combatEngine.getHero(heroInstanceId);
    if (!hero) {
      return { success: false, reason: 'unknown_hero' };
    }

    if (hero.evolvedInto) {
      return { success: false, reason: 'already_evolved' };
    }

    const evolutionConfig = heroEvolutions[hero.heroTypeId];
    if (!evolutionConfig) {
      return { success: false, reason: 'no_evolution_available' };
    }

    if (hero.level < evolutionConfig.requiredLevel) {
      return { success: false, reason: 'level_too_low' };
    }

    const option = evolutionConfig.options.find((candidate) => candidate.id === evolutionOptionId);
    if (!option) {
      return { success: false, reason: 'unknown_evolution_option' };
    }

    if (this.gold < option.cost) {
      return { success: false, reason: 'insufficient_gold' };
    }

    this.gold -= option.cost;
    hero.evolveInto(option);
    return { success: true, hero };
  }

  /**
   * Validates the run state, that `heroInstanceId` names a hero on the
   * field, and that `itemInstanceId` names an item actually sitting in
   * `inventory` - in that order. Only once both pass does it remove the
   * item from the bag and hand it to hero.equipItem; whatever was
   * previously worn in that slot (if anything) goes straight back into
   * the bag, so gear is never lost, just swapped. Free (no gold cost) -
   * equipping is a loadout choice, not a purchase.
   */
  tryEquipItem(heroInstanceId: string, itemInstanceId: string): EquipItemResult {
    if (this.isRunOver) {
      return { success: false, reason: 'game_over' };
    }

    const hero = this.combatEngine.getHero(heroInstanceId);
    if (!hero) {
      return { success: false, reason: 'unknown_hero' };
    }

    const item = this.inventory.getItem(itemInstanceId);
    if (!item) {
      return { success: false, reason: 'unknown_item' };
    }

    this.inventory.removeItem(itemInstanceId);
    const previousItem = hero.equipItem(item);
    if (previousItem) {
      this.inventory.addItem(previousItem);
    }

    return { success: true, hero, equippedItem: item, previousItem };
  }

  /**
   * Validates the run state and that `heroInstanceId` names a hero on the
   * field, then removes whatever's equipped in `slot` (if anything) and
   * returns it to `inventory`. A no-op-but-successful call (unequippedItem:
   * null) if the slot was already empty, same "typed result, not a thrown
   * error" convention every other try* method here follows.
   */
  tryUnequipItem(heroInstanceId: string, slot: EquipmentSlot): UnequipItemResult {
    if (this.isRunOver) {
      return { success: false, reason: 'game_over' };
    }

    const hero = this.combatEngine.getHero(heroInstanceId);
    if (!hero) {
      return { success: false, reason: 'unknown_hero' };
    }

    const removed = hero.unequipItem(slot);
    if (removed) {
      this.inventory.addItem(removed);
    }

    return { success: true, hero, unequippedItem: removed };
  }

  /** Starts the level's first wave. No-op if already started or the level has no waves (see WaveManager.start). */
  start(): void {
    this.waveManager.start();
  }

  /**
   * Skips the current wave's WAITING countdown (see
   * WaveManager.forceStartNextWave) - gated on the run still being Playing
   * so a stray click after GameOver/Victory can't flip WaveManager into
   * SPAWNING when nothing will ever tick it forward again. Awards
   * forceStartBonusGold only when WaveManager confirms it actually skipped
   * something (not on a no-op call, e.g. one that lands mid-SPAWNING).
   */
  forceStartNextWave(): void {
    if (this.isRunOver) {
      return;
    }
    const skipped = this.waveManager.forceStartNextWave();
    if (skipped) {
      this.gold += this.forceStartBonusGold;
      this.callbacks.onForceStartBonus?.(this.forceStartBonusGold);
    }
  }

  private handleEnemyDefeated(enemy: BattleEnemy): void {
    this.gold += enemy.goldReward;
    this.experience += enemy.expReward;

    const droppedItem = this.inventory.rollLootFor(enemy.isElite);
    if (droppedItem) {
      this.callbacks.onLootDropped?.(droppedItem);
    }

    this.callbacks.onEnemyDefeated?.(enemy, enemy.goldReward, enemy.expReward);
  }

  /**
   * Applies `enemy`'s baseDamage to baseHp and, if that's the hit that
   * drains it to 0, flips gameState to GameOver and fires onGameOver -
   * exactly once, since the top-of-function guard below stops a second
   * enemy reaching the end in the same tick (CombatEngine's cleanup can
   * call this more than once per update()) from re-entering the <=0 branch
   * or firing a redundant GameOver once the run's already decided (also
   * covers the (unreachable in practice, since a cleared level stops
   * spawning) case of a stray reached-end arriving after Victory).
   */
  private handleEnemyReachedEnd(enemy: BattleEnemy): void {
    if (this.isRunOver) {
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

  /**
   * Advances combat and wave progression by deltaTime seconds, then checks
   * whether the run just ended. A no-op the instant gameState leaves
   * Playing - checked up front (skips the whole tick once the run's
   * already decided), again right after combatEngine.update() (in case
   * *this* tick's enemy-reached-end cleanup is what just triggered
   * GameOver, so waveManager.update() below never gets one extra tick of
   * spawning/timer progress after the loss - and, since nothing between
   * that check and here can mutate gameState again, GameOver this same
   * tick is guaranteed to have already taken precedence over a level-clear
   * that would otherwise have coincided with it).
   */
  update(deltaTime: number): void {
    if (this.isRunOver) {
      return;
    }

    this.combatEngine.update(deltaTime);

    if (this.isRunOver) {
      return;
    }

    this.waveManager.update(deltaTime);

    if (this.waveManager.isLevelCleared() && this.baseHp > 0) {
      this.gameState = GameState.Victory;
      this.callbacks.onVictory?.();
    }
  }
}
