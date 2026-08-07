import type { GameState } from '../types';

// localStorage-backed persistence for 3 independent save slots. Pure
// storage layer - knows nothing about zustand or the live gameState
// singleton, see useGameStore.ts's saveGame/loadGame/deleteSave actions for
// the UI-facing wiring (resyncing the store, resetting transient combat
// state on load, etc).
const STORAGE_KEY_PREFIX = 'tatakai.save.slot.';
const SAVE_FILE_VERSION = 1;

export type SaveSlot = 1 | 2 | 3;
export const SAVE_SLOTS: SaveSlot[] = [1, 2, 3];

export interface SaveMetadata {
  savedAt: string;
  castleLevel: number;
  globalWaveLabel: string;
  gold: number;
}

interface SaveFile {
  version: number;
  metadata: SaveMetadata;
  state: GameState;
}

function storageKey(slot: SaveSlot): string {
  return `${STORAGE_KEY_PREFIX}${slot}`;
}

function readSaveFile(slot: SaveSlot): SaveFile | null {
  const raw = localStorage.getItem(storageKey(slot));
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as SaveFile;
  } catch (error) {
    console.error(`[SaveSystem] Failed to parse save slot ${slot}`, error);
    return null;
  }
}

export function saveGame(slot: SaveSlot, state: GameState): void {
  const file: SaveFile = {
    version: SAVE_FILE_VERSION,
    metadata: {
      savedAt: new Date().toISOString(),
      castleLevel: state.castleLevel,
      globalWaveLabel: `${state.wave.chapter}-${state.wave.waveInChapter}`,
      gold: state.gold,
    },
    state,
  };
  try {
    localStorage.setItem(storageKey(slot), JSON.stringify(file));
  } catch (error) {
    console.error(`[SaveSystem] Failed to save slot ${slot}`, error);
  }
}

// Returns the saved GameState, or null if the slot is empty/corrupt. Callers
// are responsible for resetting transient combat fields (enemies on field,
// visual effects, etc.) before resuming - see useGameStore.loadGame.
export function loadGame(slot: SaveSlot): GameState | null {
  return readSaveFile(slot)?.state ?? null;
}

export function deleteSave(slot: SaveSlot): void {
  localStorage.removeItem(storageKey(slot));
}

export function hasSave(slot: SaveSlot): boolean {
  return localStorage.getItem(storageKey(slot)) !== null;
}

export function getSaveMetadata(slot: SaveSlot): SaveMetadata | null {
  return readSaveFile(slot)?.metadata ?? null;
}

// Whichever slot was saved most recently, or null if every slot is empty -
// drives TitleScreen's "click/space to continue" quick-start.
export function getMostRecentSlot(): SaveSlot | null {
  let best: SaveSlot | null = null;
  let bestSavedAt = '';
  for (const slot of SAVE_SLOTS) {
    const metadata = getSaveMetadata(slot);
    if (metadata && metadata.savedAt > bestSavedAt) {
      best = slot;
      bestSavedAt = metadata.savedAt;
    }
  }
  return best;
}
