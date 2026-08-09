// Step 23's out-of-run currency ("Memory Fragments") - thin, stable-API
// wrapper around SaveManager's in-memory snapshot (step 24 consolidated
// every piece of persisted meta state, fragments included, into that one
// module). Kept as its own module rather than inlining these calls at every
// use site (GameManager, TalentManager, main.ts) so "where do fragments
// come from" stays a single, obvious import regardless of how SaveManager's
// internals evolve.
import {
  getMemoryFragments as getSavedMemoryFragments,
  addMemoryFragments as addSavedMemoryFragments,
  spendMemoryFragments as spendSavedMemoryFragments,
} from './SaveManager';

export function getMemoryFragments(): number {
  return getSavedMemoryFragments();
}

/** Adds `amount` (clamped to >= 0) to the in-memory balance - GameManager calls this the instant an elite/boss dies. Doesn't itself call SaveManager.save() (see that function's doc comment on step 24's checkpointed-save timing) - a mid-run crash between this and the next save checkpoint can lose it, by design. Returns the new total. */
export function addMemoryFragments(amount: number): number {
  return addSavedMemoryFragments(amount);
}

/** Deducts `amount` if (and only if) the current balance covers it - returns whether the spend succeeded, same typed-result-over-thrown-error convention GameManager's own try* methods use for a rejected action. */
export function spendMemoryFragments(amount: number): boolean {
  return spendSavedMemoryFragments(amount);
}
