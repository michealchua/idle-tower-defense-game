// Step 27's prestige/rebirth system - Eternity Sparks (永恒星火), a second
// out-of-run currency alongside Memory Fragments, earned by voluntarily
// resetting the current run's wave/gold/hero-level progress in exchange
// for a permanent, ever-stacking global damage/maxHp multiplier (see
// BattleHero.computeFinalStat's own prestige layer). Persisted through
// SaveManager (step 24's unified save blob), same pattern MetaProgression/
// TalentManager already follow - this file owns none of the storage
// itself, only the eligibility/reward math and the run-reset orchestration.
import type { GameManager } from './GameManager';
import { getHighestStageCleared, getEternitySparks as getSavedEternitySparks, addEternitySparks, save as saveMeta } from './SaveManager';

/** Historical highestStageCleared must exceed this before a prestige is even possible - "只有超过第 20 波才能转生". Uses the same 1-based "wave N" convention SaveManager.recordStageCleared already stores (see GameManager's onWaveComplete: `recordStageCleared(index + 1)`). */
export const PRESTIGE_UNLOCK_STAGE = 20;
const SPARKS_DIVISOR = 10;
const SPARKS_EXPONENT = 1.5;
/** Percent bonus (both global damage AND global maxHp) every unspent Eternity Spark grants - "+5%全局伤害和+5%全局最大生命值加成", applied as BattleHero.computeFinalStat's own independent outermost multiplier layer. */
export const SPARK_BONUS_PER_POINT = 0.05;

export class PrestigeManager {
  /** Whether a prestige is even available at `highestStage` - what the Ascension button's disabled state (main.ts) reads, and what executePrestige itself gates on so it can never be called into producing 0 Sparks and a pointless reset. */
  static canPrestige(highestStage: number): boolean {
    return highestStage > PRESTIGE_UNLOCK_STAGE;
  }

  /**
   * Eternity Sparks a prestige at `highestStage` would grant right now -
   * the spec's own non-linear formula, floored to a whole number. Returns
   * 0 for anything at/under PRESTIGE_UNLOCK_STAGE rather than a negative
   * or fractional-but-truthy value right at the boundary (the formula
   * itself would already floor a sub-1 result to 0 for most such inputs,
   * but this makes "not eligible yet" an explicit, unconditional 0 rather
   * than relying on that coincidence).
   */
  static calculateSparks(highestStage: number): number {
    if (highestStage <= PRESTIGE_UNLOCK_STAGE) {
      return 0;
    }
    return Math.max(0, Math.floor(Math.pow((highestStage - PRESTIGE_UNLOCK_STAGE) / SPARKS_DIVISOR, SPARKS_EXPONENT)));
  }

  /** Current persisted Eternity Sparks balance. */
  static getEternitySparks(): number {
    return getSavedEternitySparks();
  }

  /** Current global bonus (e.g. 0.25 = +25%) every unspent Eternity Spark contributes to BattleHero's attack/maxHp getters - see that file's computeFinalStat. */
  static getGlobalBonusMultiplier(): number {
    return getSavedEternitySparks() * SPARK_BONUS_PER_POINT;
  }

  /**
   * Executes a prestige against `gameManager`'s live run: computes
   * calculateSparks off SaveManager's persisted highestStageCleared (the
   * run's *historical* best, not necessarily wherever this particular
   * GameManager instance currently sits), adds them to the permanent
   * Eternity Sparks total and immediately persists that (irreversible the
   * instant it happens, same "save right away" reasoning TalentManager.
   * upgradeTalent already follows), then resets the live run via
   * GameManager.resetForPrestige - wave/gold/hero-levels only. Equipment
   * (worn and bagged), Memory Fragments, and every TalentManager node
   * level are all untouched by this call, per the spec's explicit "绝对
   * 保留" list - none of those live in GameManager's own reset path at
   * all. A no-op (returns 0, calls neither addEternitySparks nor
   * resetForPrestige) when the run isn't eligible - see canPrestige.
   */
  static executePrestige(gameManager: GameManager): number {
    const highestStage = getHighestStageCleared();
    if (!this.canPrestige(highestStage)) {
      return 0;
    }

    const sparksGained = this.calculateSparks(highestStage);
    addEternitySparks(sparksGained);
    saveMeta();

    gameManager.resetForPrestige();

    return sparksGained;
  }
}
