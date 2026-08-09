// Step 24/25's unified persistence hub - the single place every piece of
// out-of-run ("meta") state serializes to and deserializes from. Everything
// else that needs to persist across sessions (MetaProgression's fragments,
// TalentManager's node levels, OfflineManager's lastSaveTime/
// highestStageCleared basis) reads and writes through this module rather
// than each owning a separate localStorage key - one blob, one source of
// truth, so a save() at any checkpoint always captures everything at once.
//
// Two-tier by design: `current` is an in-memory snapshot every getter/
// setter below actually reads and mutates; load()/save() are the only two
// functions that ever touch persistentStore (and therefore localStorage/
// its Node fallback) directly. That split is what makes "mutate a bunch of
// state, then call save() once" a real, meaningful checkpoint - and what
// lets test-run.ts's headless persistence test prove out actual serialize/
// deserialize fidelity (clear the in-memory snapshot, then load() again)
// rather than just re-reading a value that was never actually dropped.
import type { EquipmentItem } from './Equipment';
import { createPersistentValue } from './persistentStore';

/** Step 30's onboarding flags - one per tutorial step, flipped true the instant that step's real completion action happens (or its dialog is dismissed - see TutorialManager) and never reset, so a step only ever shows once per save, on its first playthrough. */
export interface TutorialFlags {
  hasPlacedFirstHero: boolean;
  hasUpgradedHero: boolean;
  hasEquippedItem: boolean;
  hasSeenPrestige: boolean;
}

function defaultTutorialFlags(): TutorialFlags {
  return {
    hasPlacedFirstHero: false,
    hasUpgradedHero: false,
    hasEquippedItem: false,
    hasSeenPrestige: false,
  };
}

export interface SaveData {
  /** Unix ms timestamp of the last time save() ran - what OfflineManager's offline-window calculation measures "now" against. */
  lastSaveTime: number;
  /** Highest 0-based wave index this save has ever fully cleared, across every run - a monotonically-increasing high-water mark, not the current run's own progress. */
  highestStageCleared: number;
  /** Current Memory Fragments balance (step 23's meta currency). */
  memoryFragments: number;
  /** TalentManager node id -> current level, for every node the player has ever put at least one point into. A node absent from this map reads as level 0 - see TalentManager.getLevel. */
  talentLevels: Record<string, number>;
  /** Equipment permanently retained across runs (step 24's "长线持有的核心装备") - distinct from the run-scoped InventoryManager, which starts empty every fresh GameManager. */
  heirloomEquipment: EquipmentItem[];
  /** Step 27's prestige/rebirth currency ("永恒星火") - never spent, only ever accumulated across prestiges; every unspent point contributes a permanent global damage/maxHp multiplier (see PrestigeManager.getGlobalBonusMultiplier, consumed by BattleHero.computeFinalStat). */
  eternitySparks: number;
  /** Step 30's progressive tutorial flags - see TutorialFlags' own doc comment. */
  tutorialFlags: TutorialFlags;
}

function defaultSaveData(): SaveData {
  return {
    lastSaveTime: Date.now(),
    highestStageCleared: 0,
    memoryFragments: 0,
    talentLevels: {},
    heirloomEquipment: [],
    eternitySparks: 0,
    tutorialFlags: defaultTutorialFlags(),
  };
}

const saveDataStore = createPersistentValue<SaveData>('tatakai.combat.saveData', defaultSaveData());

let current: SaveData = defaultSaveData();
let hasLoadedOnce = false;

/** Auto-loads on first access if nothing has explicitly called load() yet - a safety net, not a substitute for main.ts's own "call load() first, before anything else touches meta state" responsibility (see load()'s own doc comment). */
function ensureLoaded(): void {
  if (!hasLoadedOnce) {
    load();
  }
}

/**
 * Reads persisted save data from storage into the in-memory `current`
 * snapshot, replacing it wholesale (never merged with whatever `current`
 * held before) - call this first, before anything else in the game touches
 * meta state (main.ts does, at the very top of the module, ahead of even
 * GameManager construction), so talent progress/currency are correct from
 * the first frame rather than briefly reading stale defaults.
 */
export function load(): SaveData {
  const loaded = saveDataStore.get();
  // Merges onto a fresh default rather than trusting `loaded` wholesale -
  // a save written before tutorialFlags (or any future field) existed
  // would otherwise come back with that key simply missing, and every
  // getter/setter below assumes the full shape is always present.
  current = { ...defaultSaveData(), ...loaded, tutorialFlags: { ...defaultTutorialFlags(), ...loaded.tutorialFlags } };
  hasLoadedOnce = true;
  return current;
}

/**
 * Flushes the current in-memory snapshot to persisted storage - the only
 * function (besides load()) that actually touches localStorage. Called at
 * specific checkpoints, not on every mutation: after every successful
 * TalentManager.upgradeTalent (irreversible, so the moment it happens it
 * must survive a crash) and at run-end settlement (see GameManager's boss-
 * death/Victory/GameOver handling) - not, e.g., on every single Memory
 * Fragment gained mid-run, which would mean a write on every elite kill.
 */
export function save(): void {
  saveDataStore.set(current);
}

/** Read-only snapshot of every persisted field at once - what the talent UI panel reads for its "记忆碎片" display, avoiding one call per field. */
export function getSaveDataSnapshot(): Readonly<SaveData> {
  ensureLoaded();
  return current;
}

export function getLastSaveTime(): number {
  ensureLoaded();
  return current.lastSaveTime;
}

/** Stamps `lastSaveTime` to now (or `atMs`, for tests) - does not itself call save(); callers that want this to survive a crash still need to call save() afterward, same as every other mutator here. */
export function recordSaveNow(atMs: number = Date.now()): void {
  ensureLoaded();
  current = { ...current, lastSaveTime: atMs };
}

export function getHighestStageCleared(): number {
  ensureLoaded();
  return current.highestStageCleared;
}

/** Raises highestStageCleared to `stageIndex` if it's a new high-water mark - a no-op otherwise, so calling this on every wave clear (even a replay of an already-beaten stage) never lowers the recorded value. */
export function recordStageCleared(stageIndex: number): void {
  ensureLoaded();
  if (stageIndex > current.highestStageCleared) {
    current = { ...current, highestStageCleared: stageIndex };
  }
}

export function getMemoryFragments(): number {
  ensureLoaded();
  return current.memoryFragments;
}

/** Adds `amount` (clamped to >= 0) to the in-memory balance - returns the new total. Doesn't call save() itself; GameManager's elite-kill handler intentionally lets these accumulate in memory between the checkpoint saves described in save()'s doc comment. */
export function addMemoryFragments(amount: number): number {
  ensureLoaded();
  current = { ...current, memoryFragments: Math.max(0, current.memoryFragments + Math.max(0, amount)) };
  return current.memoryFragments;
}

/** Deducts `amount` if (and only if) the current balance covers it - returns whether the spend succeeded, same typed-result-over-thrown-error convention GameManager's own try* methods use for a rejected action. */
export function spendMemoryFragments(amount: number): boolean {
  ensureLoaded();
  if (amount <= 0 || current.memoryFragments < amount) {
    return false;
  }
  current = { ...current, memoryFragments: current.memoryFragments - amount };
  return true;
}

export function getTalentLevel(nodeId: string): number {
  ensureLoaded();
  return current.talentLevels[nodeId] ?? 0;
}

/** Overwrites a single node's level - TalentManager.upgradeTalent is the only real caller, and only ever increments by exactly 1 (this system is irreversible by design; nothing here stops a caller from setting a lower level, but no code path in this game ever does). */
export function setTalentLevel(nodeId: string, level: number): void {
  ensureLoaded();
  current = { ...current, talentLevels: { ...current.talentLevels, [nodeId]: level } };
}

/** Shallow copy - mutating the returned array can never affect the persisted list. */
export function getHeirloomEquipment(): EquipmentItem[] {
  ensureLoaded();
  return [...current.heirloomEquipment];
}

export function addHeirloomEquipment(item: EquipmentItem): void {
  ensureLoaded();
  current = { ...current, heirloomEquipment: [...current.heirloomEquipment, item] };
}

export function getEternitySparks(): number {
  ensureLoaded();
  return current.eternitySparks;
}

/** Adds `amount` (clamped to >= 0) to the persisted Eternity Sparks total - never subtracted anywhere in this game (there's no "spend a Spark" mechanic, only "own more of them"). Returns the new total. */
export function addEternitySparks(amount: number): number {
  ensureLoaded();
  current = { ...current, eternitySparks: Math.max(0, current.eternitySparks + Math.max(0, amount)) };
  return current.eternitySparks;
}

/** Read-only snapshot of every tutorial flag at once - TutorialManager never caches its own copy, it just reads through here on every check. */
export function getTutorialFlags(): Readonly<TutorialFlags> {
  ensureLoaded();
  return current.tutorialFlags;
}

/** Flips a single tutorial flag - permanently (there's no un-see-a-tutorial-step mechanic, mirroring TalentManager's own "no regrets" one-way state). Doesn't call save() itself; TutorialManager.completeActiveStep() does that immediately after, same "irreversible progress persists right away" rule upgradeTalent already follows. */
export function setTutorialFlag(flag: keyof TutorialFlags, value: boolean): void {
  ensureLoaded();
  current = { ...current, tutorialFlags: { ...current.tutorialFlags, [flag]: value } };
}

/**
 * Test-only: discards the in-memory `current` snapshot (without touching
 * whatever's already been save()'d to storage) so a subsequent load() call
 * proves out a genuine round trip through storage rather than trivially
 * returning whatever was already sitting in memory - this is what test-
 * run.ts's headless persistence boundary test needs to actually validate
 * serialize/deserialize fidelity end to end (spec: "强制清空当前内存数据，
 * 再调用读取接口"). This is a testing seam for SaveManager's own
 * serialization role, not a player-facing "reset" of any game system -
 * TalentManager itself exposes no reset/respec capability at all (see its
 * own doc comment); this only ever discards an in-memory cache that load()
 * immediately repopulates from whatever was actually saved.
 */
export function clearInMemorySnapshotForTesting(): void {
  current = defaultSaveData();
  hasLoadedOnce = false;
}
