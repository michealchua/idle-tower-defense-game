import { CombatEngine, type DamageDealtEvent, type HeroDamagedEvent, type HeroHealedEvent } from './CombatEngine';
import { WaveManager } from './WaveManager';
import { getWaveBossKind, type LevelConfig, type WaveConfig } from './WaveConfig';
import type { BattleHero } from './BattleHero';
import type { BattleEnemy } from './BattleEnemy';
import { heroCatalog, createBattleHeroFromCatalog } from './heroCatalog';
import { heroEvolutions } from './heroEvolution';
import { gridCellCenter, type GridCell } from './gridConfig';
import { InventoryManager } from './InventoryManager';
import { RARITY_MAX_LEVEL, applyEnhancementExp, type EquipmentItem, type EquipmentSlot } from './Equipment';
import { enemyTypeDefinitions } from './EnemyFactory';
import { ThemeManager, bossMusicTracks } from './ThemeManager';
import { AudioManager } from './AudioManager';
import { addMemoryFragments, getMemoryFragments } from './MetaProgression';
import { recordStageCleared, save as saveMeta } from './SaveManager';

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
  /** Fired every time a Priest's heal cast actually lands (step 23) - see CombatEngine's HeroHealedEvent doc comment. */
  onHeroHealed?: (event: HeroHealedEvent) => void;
  /** Fired whenever an elite/boss kill drops Memory Fragments (step 23's out-of-run currency, see MetaProgression.ts) - `total` is the persisted balance immediately after this drop. */
  onMemoryFragmentsGained?: (amount: number, total: number) => void;
}

/** One transient "+XX" heal callout GameRenderer draws above its target and fades out over FLOATING_TEXT_LIFETIME_MS - see GameManager.floatingTexts and handleHeroHealed. */
export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  createdAtMs: number;
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

/** Memory Fragments (step 23's meta currency) awarded per elite/boss kill, as a fraction of that enemy's own goldReward - "按比例掉落" per the spec, rounded up so even a cheap elite always drops at least MEMORY_FRAGMENT_MINIMUM. */
const MEMORY_FRAGMENT_DROP_RATIO = 0.1;
const MEMORY_FRAGMENT_MINIMUM = 1;

/** How long a heal's "+XX" floating text (see FloatingText) stays visible before GameManager.update() prunes it - GameRenderer imports this too, so its own fade/rise animation window always matches exactly. */
export const FLOATING_TEXT_LIFETIME_MS = 1000;
const HEAL_FLOATING_TEXT_COLOR = '#4ade80';

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

export type EnhanceEquipmentResult =
  | { success: true; item: EquipmentItem; expGained: number; levelsGained: number }
  | {
      success: false;
      reason: 'game_over' | 'unknown_target' | 'target_is_food' | 'unknown_food_item' | 'no_food_items' | 'already_max_level';
    };

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
  /** Tracks the current background/BGM theme and its stage-based rotation (step 22) - GameRenderer reads `.currentTheme` every frame to draw the bottom-most background layer and detect when to play its transition effect. */
  readonly themeManager = new ThemeManager();
  /** Owns the actual <audio> playback for `themeManager.currentTheme.musicTrack`, overridden by a boss track for the duration of a boss wave - see the onWaveStart hook below and handleEnemyDefeated. */
  readonly audioManager = new AudioManager();

  /** Set for the duration of a boss/miniboss wave (see getWaveBossKind) so handleEnemyDefeated knows a defeated `isElite` enemy is *the* boss whose death should revert the BGM, not just any elite spawn. */
  private activeBossKind: 'miniboss' | 'boss' | undefined;

  /** Live "+XX" heal callouts (step 23) - pushed by handleHeroHealed, pruned once older than FLOATING_TEXT_LIFETIME_MS by update(). GameRenderer reads getActiveFloatingTexts() every frame to draw them; this array is otherwise never read outside this class. */
  private readonly floatingTexts: FloatingText[] = [];

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
      // Step 22's onEnemySpawn biome hook (Snow Mountain's permanent
      // on-spawn Slow) - reads the *current* theme fresh on every call
      // rather than closing over one, so it stays correct across a
      // mid-run theme rotation.
      onEnemyAdded: (enemy) => this.themeManager.currentTheme.mechanics.onEnemySpawn?.(enemy),
      onHeroHealed: (event) => this.handleHeroHealed(event),
    });
    this.waveManager = new WaveManager(this.combatEngine, levelConfig, {
      onWaveStart: (config, index) => {
        // Whatever heroes died during the wave that just finished get a
        // chance to fight again from the very next wave, not left dead for
        // the rest of the run - fired here (spawning actually beginning,
        // not just the WAITING countdown starting) so the field is fully
        // reset before the first enemy of the new wave appears.
        this.reviveDeadHeroes();
        this.updateEnvironmentForWave(config, index);
        this.callbacks.onWaveStart?.(config, index);
      },
      onWaveComplete: (waveId, index, nextDelay) => {
        // Step 25's offline-progress basis (see OfflineManager.calculateRewards)
        // - a monotonic high-water mark across every run on this save, not
        // this run's own progress alone (recordStageCleared already no-ops
        // below any previously-recorded value).
        recordStageCleared(index + 1);
        this.callbacks.onWaveComplete?.(waveId, index, nextDelay);
      },
    });

    // Environment check on init (step 22 spec) - so the very first wave's
    // theme/BGM is already correct before onWaveStart ever fires, rather
    // than starting on ThemeManager's hardcoded initial theme with silence.
    this.audioManager.playTrack(this.themeManager.currentTheme.musicTrack);
  }

  /**
   * Re-derives the current stage's theme from the wave index that's about
   * to start spawning, and points the BGM at either that theme's ambient
   * track or a dedicated boss track, per getWaveBossKind. ThemeManager
   * itself only updates `currentTheme` when the stage actually advances
   * (see ThemeManager.updateForWave) - GameRenderer picks up that change on
   * its own next frame by comparing theme ids, so no separate "theme
   * changed" callback is needed here.
   */
  private updateEnvironmentForWave(config: WaveConfig, waveIndex: number): void {
    this.themeManager.updateForWave(waveIndex);

    this.activeBossKind = getWaveBossKind(config, (enemyType) => enemyTypeDefinitions[enemyType]?.isElite ?? false);
    const track = this.activeBossKind ? bossMusicTracks[this.activeBossKind] : this.themeManager.currentTheme.musicTrack;
    this.audioManager.playTrack(track);
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

  /**
   * Consumes `foodItemIds` as fodder to level up `targetItemInstanceId` -
   * the item can be either sitting unequipped in `inventory` or currently
   * worn by any hero on the field; food items must always come from the
   * bag (an equipped item can't be fed to another item's enhancement
   * without unequipping it first - tryUnequipItem exists for that).
   *
   * Two paths, same underlying math (Equipment.ts's applyEnhancementExp):
   * - Target equipped: found via findEquippedItem, validated/consumed
   *   here directly since InventoryManager only ever holds unequipped
   *   items and can't reach it. No separate "recalculate BattleHero.stats"
   *   step is needed after this mutates the item - stats' getters
   *   (BattleHero.computeFinalStat) read the equipped item's level/
   *   modifiers fresh on every access, so this exact object being more
   *   enhanced is already a real-time stat change the instant it happens.
   * - Target unequipped: delegated straight to InventoryManager.
   *   enhanceEquipment, which owns that (simpler) bag-only case.
   */
  tryEnhanceEquipment(targetItemInstanceId: string, foodItemIds: string[]): EnhanceEquipmentResult {
    if (this.isRunOver) {
      return { success: false, reason: 'game_over' };
    }

    const equippedTarget = this.findEquippedItem(targetItemInstanceId);
    if (!equippedTarget) {
      return this.inventory.enhanceEquipment(targetItemInstanceId, foodItemIds);
    }

    if (foodItemIds.length === 0) {
      return { success: false, reason: 'no_food_items' };
    }
    if (foodItemIds.includes(targetItemInstanceId)) {
      return { success: false, reason: 'target_is_food' };
    }
    if (equippedTarget.level >= RARITY_MAX_LEVEL[equippedTarget.rarity]) {
      return { success: false, reason: 'already_max_level' };
    }

    const foodItems: EquipmentItem[] = [];
    for (const foodItemId of foodItemIds) {
      const foodItem = this.inventory.getItem(foodItemId);
      if (!foodItem) {
        return { success: false, reason: 'unknown_food_item' };
      }
      foodItems.push(foodItem);
    }

    const totalExp = foodItems.reduce((sum, item) => sum + item.baseExpValue, 0);
    const levelsGained = applyEnhancementExp(equippedTarget, totalExp);
    for (const foodItemId of foodItemIds) {
      this.inventory.removeItem(foodItemId);
    }

    return { success: true, item: equippedTarget, expGained: totalExp, levelsGained };
  }

  /** The live EquipmentItem instance named by `itemInstanceId`, if any hero currently has it equipped in any slot - null if it's unequipped (or doesn't exist at all). */
  private findEquippedItem(itemInstanceId: string): EquipmentItem | null {
    for (const hero of this.combatEngine.getHeroes()) {
      for (const item of Object.values(hero.getAllEquipment())) {
        if (item && item.instanceId === itemInstanceId) {
          return item;
        }
      }
    }
    return null;
  }

  /** Starts the level's first wave. No-op if already started or the level has no waves (see WaveManager.start). */
  start(): void {
    this.waveManager.start();
  }

  /**
   * Step 27's prestige reset - "重置GameManager的当前波次为1 -> 重置金币为0
   * -> 重置所有英雄的Level为1". PrestigeManager.executePrestige is the only
   * real caller (after it's already granted and persisted the Eternity
   * Sparks this reset is being traded for); called directly it's just an
   * unconditional reset with no eligibility check of its own, so callers
   * that need the "highestStageCleared > 20" gate must go through
   * PrestigeManager instead.
   *
   * Equipment (worn and bagged, via `inventory`/each hero's own
   * `equipment`), Memory Fragments, and TalentManager node levels are all
   * left completely untouched - none of them are reset by anything in this
   * method, per the spec's "绝对保留" list. Also resets baseHp/gameState
   * back to a fresh-run state and clears any mid-flight enemies/
   * projectiles (see CombatEngine.clearField) so "波次归1" is actually
   * true even if prestige was triggered mid-wave or after a loss/win,
   * neither of which the spec's own reset list mentions by name but both
   * of which that guarantee implicitly requires.
   */
  resetForPrestige(): void {
    this.gold = 0;
    this.baseHp = this.maxBaseHp;
    this.gameState = GameState.Playing;

    for (const hero of this.combatEngine.getHeroes()) {
      hero.resetLevel();
    }

    this.combatEngine.clearField();
    this.waveManager.restart();
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

    // Step 23's meta currency - persisted immediately (addMemoryFragments
    // writes straight to localStorage/its Node fallback), not batched to
    // run-end, so it survives even a crash/force-quit mid-run same as the
    // spec's "存入 localStorage" calls for.
    if (enemy.isElite) {
      const fragmentsGained = Math.max(MEMORY_FRAGMENT_MINIMUM, Math.round(enemy.goldReward * MEMORY_FRAGMENT_DROP_RATIO));
      const total = addMemoryFragments(fragmentsGained);
      this.callbacks.onMemoryFragmentsGained?.(fragmentsGained, total);
    }

    // The boss itself dying reverts the BGM to the current theme's ambient
    // track immediately, rather than waiting for the wave to fully clear
    // (which can lag behind by however long trailing trash mobs take) -
    // guarded on activeBossKind so a stray isElite kill outside a tracked
    // boss wave can't trigger a spurious revert/restart of the same track
    // (playTrack already no-ops if it's already playing, but this also
    // avoids clearing activeBossKind's "we are still in a boss wave" state
    // for enemies that aren't actually it).
    if (this.activeBossKind && enemy.isElite) {
      this.activeBossKind = undefined;
      this.audioManager.playTrack(this.themeManager.currentTheme.musicTrack);
      // Step 24's "单局游戏结束（如 Boss 死亡结算）时" save checkpoint -
      // the boss kill just banked a chunk of Memory Fragments (see the
      // addMemoryFragments call above) that would otherwise only persist
      // at the next checkpoint; flushing here means that reward survives
      // even a crash the very next moment.
      saveMeta();
    }

    this.callbacks.onEnemyDefeated?.(enemy, enemy.goldReward, enemy.expReward);
  }

  /** Records one FloatingText entry at the heal target's position (step 23's "绿色的 +XX 文本" visual feedback) and forwards the raw event to callbacks - GameRenderer never sees CombatEngine's HeroHealedEvent directly, only the FloatingText this produces via getActiveFloatingTexts(). */
  private handleHeroHealed(event: HeroHealedEvent): void {
    this.floatingTexts.push({
      x: event.target.x,
      y: event.target.y,
      text: `+${Math.round(event.amount)}`,
      color: HEAL_FLOATING_TEXT_COLOR,
      createdAtMs: Date.now(),
    });
    this.callbacks.onHeroHealed?.(event);
  }

  /** Every heal callout still within its FLOATING_TEXT_LIFETIME_MS window - GameRenderer reads this every frame to draw/fade/rise them; update() is what actually prunes expired entries out of the backing array. */
  getActiveFloatingTexts(): readonly FloatingText[] {
    return this.floatingTexts;
  }

  /** Current persisted Memory Fragments balance (step 23) - a thin passthrough to MetaProgression.getMemoryFragments() so UI code only ever needs to reach into GameManager, not a second module, for run-adjacent numbers. */
  get memoryFragments(): number {
    return getMemoryFragments();
  }

  /** Drops any FloatingText entry older than FLOATING_TEXT_LIFETIME_MS - called once per update() tick so the array never grows unbounded over a long run and GameRenderer never has to filter it itself. */
  private pruneExpiredFloatingTexts(): void {
    if (this.floatingTexts.length === 0) {
      return;
    }
    const now = Date.now();
    for (let i = this.floatingTexts.length - 1; i >= 0; i -= 1) {
      if (now - this.floatingTexts[i].createdAtMs >= FLOATING_TEXT_LIFETIME_MS) {
        this.floatingTexts.splice(i, 1);
      }
    }
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
      // Step 24's "单局游戏结束...时" save checkpoint, the run-over case.
      saveMeta();
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
    this.pruneExpiredFloatingTexts();

    if (this.isRunOver) {
      return;
    }

    // Step 22's periodic biome hook (Volcano's burn pulse, Poison Swamp's
    // enemy regen, Forest's lowest-HP heal, Ocean's knockback wave) - runs
    // after combat resolves for the tick, same ordering onEnemyReachedEnd's
    // baseHp change already follows relative to combatEngine.update().
    this.themeManager.currentTheme.mechanics.onUpdate?.(deltaTime, this.combatEngine);

    this.waveManager.update(deltaTime);

    if (this.waveManager.isLevelCleared() && this.baseHp > 0) {
      this.gameState = GameState.Victory;
      // Step 24's "单局游戏结束...时" save checkpoint, the victory case.
      saveMeta();
      this.callbacks.onVictory?.();
    }
  }
}
