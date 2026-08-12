import type { GameState } from '../types';

// Persistence for 3 independent save slots, backed by one of two storage
// backends (see `backend` below) depending on where the app is running.
// Pure storage layer - knows nothing about zustand or the live gameState
// singleton, see useGameStore.ts's saveGame/loadGame/deleteSave actions for
// the UI-facing wiring (resyncing the store, resetting transient combat
// state on load, etc). Every exported function's signature is unchanged
// from the original localStorage-only version, so no caller (useGameStore.ts,
// TitleScreen.tsx) needed to change.
const STORAGE_KEY_PREFIX = 'tatakai.save.slot.';
const SAVE_FILE_VERSION = 1;

export type SaveSlot = 1 | 2 | 3;
export const SAVE_SLOTS: SaveSlot[] = [1, 2, 3];

export interface SaveMetadata {
  savedAt: string;
  globalWaveLabel: string;
  gold: number;
}

interface SaveFile {
  version: number;
  metadata: SaveMetadata;
  state: GameState;
}

// electron/preload.cjs's contextBridge surface (only present in the
// packaged/dev Electron shell - undefined in the plain web build). Every
// method is synchronous (backed by ipcRenderer.sendSync on the other side of
// the bridge), matching this file's existing sync contract - see
// preload.cjs's doc comment for why sendSync instead of invoke.
interface TataKaiSaveBridge {
  save: (slot: SaveSlot, data: SaveFile) => void;
  load: (slot: SaveSlot) => SaveFile | null;
  del: (slot: SaveSlot) => void;
  list: () => { slot: SaveSlot; metadata: SaveMetadata | null }[];
}

declare global {
  interface Window {
    tataKAISave?: TataKaiSaveBridge;
  }
}

interface SaveBackend {
  write(slot: SaveSlot, file: SaveFile): void;
  read(slot: SaveSlot): SaveFile | null;
  del(slot: SaveSlot): void;
  list(): { slot: SaveSlot; metadata: SaveMetadata | null }[];
}

function storageKey(slot: SaveSlot): string {
  return `${STORAGE_KEY_PREFIX}${slot}`;
}

// Original (pre-IPC) implementation, kept as-is - this is also the only
// backend the plain web build ever uses (no Electron preload script there),
// and the migration source for the IPC backend below.
const localStorageBackend: SaveBackend = {
  write(slot, file) {
    try {
      localStorage.setItem(storageKey(slot), JSON.stringify(file));
    } catch (error) {
      console.error(`[SaveSystem] Failed to save slot ${slot}`, error);
    }
  },
  read(slot) {
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
  },
  del(slot) {
    localStorage.removeItem(storageKey(slot));
  },
  list() {
    return SAVE_SLOTS.map((slot) => ({ slot, metadata: localStorageBackend.read(slot)?.metadata ?? null }));
  },
};

// Delegates straight to window.tataKAISave - only ever selected as `backend`
// below when that bridge actually exists, so the `!` assertions here are
// safe (see the `backend` selection immediately after this).
const ipcBackend: SaveBackend = {
  write(slot, file) {
    window.tataKAISave!.save(slot, file);
  },
  read(slot) {
    return window.tataKAISave!.load(slot);
  },
  del(slot) {
    window.tataKAISave!.del(slot);
  },
  list() {
    return window.tataKAISave!.list();
  },
};

const backend: SaveBackend = window.tataKAISave ? ipcBackend : localStorageBackend;

// One-time, idempotent migration: a save made before this IPC/file backend
// existed lives only in localStorage. If this session has the IPC backend
// (packaged/dev Electron shell) and a slot's new-backend copy doesn't exist
// yet but an old localStorage copy does, copy it over - never deletes the
// localStorage copy, it stays as a passive backup rather than the source of
// truth once migrated. No-op on the web build (backend is
// localStorageBackend there, so there's nothing to migrate into) and a
// no-op on every run after the first real migration (the IPC backend
// already has the data by then, so `ipcBackend.read(slot)` stops being
// null).
function migrateLocalStorageSavesToIpcIfNeeded(): void {
  if (backend !== ipcBackend) {
    return;
  }
  for (const slot of SAVE_SLOTS) {
    if (ipcBackend.read(slot)) {
      continue;
    }
    const legacy = localStorageBackend.read(slot);
    if (legacy) {
      console.info(`[SaveSystem] Migrating slot ${slot} from localStorage to local save files`);
      ipcBackend.write(slot, legacy);
    }
  }
}
migrateLocalStorageSavesToIpcIfNeeded();

export function saveGame(slot: SaveSlot, state: GameState): void {
  const file: SaveFile = {
    version: SAVE_FILE_VERSION,
    metadata: {
      savedAt: new Date().toISOString(),
      globalWaveLabel: `${state.wave.chapter}-${state.wave.waveInChapter}`,
      gold: state.gold,
    },
    state,
  };
  backend.write(slot, file);
}

// Returns the saved GameState, or null if the slot is empty/corrupt. Callers
// are responsible for resetting transient combat fields (enemies on field,
// visual effects, etc.) before resuming - see useGameStore.loadGame.
export function loadGame(slot: SaveSlot): GameState | null {
  return backend.read(slot)?.state ?? null;
}

export function deleteSave(slot: SaveSlot): void {
  backend.del(slot);
}

export function hasSave(slot: SaveSlot): boolean {
  return backend.read(slot) !== null;
}

export function getSaveMetadata(slot: SaveSlot): SaveMetadata | null {
  return backend.read(slot)?.metadata ?? null;
}

// Whichever slot was saved most recently, or null if every slot is empty -
// drives TitleScreen's "click/space to continue" quick-start. Uses list()
// (a single IPC round trip under the IPC backend) rather than looping
// getSaveMetadata per slot, since this is the one place all 3 slots'
// metadata is genuinely needed at once.
export function getMostRecentSlot(): SaveSlot | null {
  let best: SaveSlot | null = null;
  let bestSavedAt = '';
  for (const { slot, metadata } of backend.list()) {
    if (metadata && metadata.savedAt > bestSavedAt) {
      best = slot;
      bestSavedAt = metadata.savedAt;
    }
  }
  return best;
}
