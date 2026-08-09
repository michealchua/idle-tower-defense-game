// Shared localStorage-with-in-memory-fallback plumbing for every module in
// src/combat/* that persists small pieces of state across page loads
// (MetaProgression's fragments, TalentManager's node levels, SaveManager's
// lastSaveTime/highestStageCleared) - test-run.ts's headless Node
// simulation has no localStorage/window at all, so every one of them needs
// the exact same "fall back to an in-memory value" behavior. This is the
// one place that logic lives, instead of being copy-pasted per module.

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    // Some sandboxed embeds throw on the mere property access rather than
    // just being undefined - treat that the same as "not available".
    return false;
  }
}

/**
 * A single persisted JSON-serializable value keyed by `storageKey` - reads/
 * writes go straight to localStorage when available, or an in-memory box
 * otherwise. No caching layered on top of localStorage (every get()
 * re-reads/re-parses), so a value changed elsewhere (another tab, another
 * module instance) is always seen immediately - the same "correctness over
 * a read-per-call cost" trade-off this codebase's other persisted state
 * already makes.
 */
export function createPersistentValue<T>(storageKey: string, defaultValue: T) {
  let memoryValue: T = defaultValue;

  return {
    get(): T {
      if (!hasLocalStorage()) {
        return memoryValue;
      }
      try {
        const raw = localStorage.getItem(storageKey);
        return raw === null ? defaultValue : (JSON.parse(raw) as T);
      } catch {
        return defaultValue;
      }
    },
    set(value: T): void {
      if (hasLocalStorage()) {
        localStorage.setItem(storageKey, JSON.stringify(value));
      } else {
        memoryValue = value;
      }
    },
  };
}
