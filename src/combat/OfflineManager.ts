// Step 25's offline-progress system: a fixed, "低保" (welfare-guarantee)
// reward package scaled off the save's historical highestStageCleared and
// however long the player was away - not a simulation of an actual battle,
// so it can never out-earn active play and never produces core-power gear
// (Epic/Legendary stays exclusive to InventoryManager.rollLootFor's real
// elite/boss kills - see generateRandomEquipment's allowedRarities param).
import { EquipmentRarity, type EquipmentItem } from './Equipment';
import { generateRandomEquipment } from './equipmentCatalog';

/** Offline progress stops accruing past this many seconds (12h) - "防止玩家流失过久后上线直接数值崩坏". Someone away for a week is capped exactly the same as someone away for 12 hours. */
export const MAX_OFFLINE_SECONDS = 12 * 60 * 60;

/**
 * Gold per stage-cleared per hour offline - deliberately generous (the
 * spec's "极高的数值乘数，制造视觉上的丰厚感") since gold's own purchasing
 * power is already self-limiting: every hero upgrade/placement cost in this
 * game grows geometrically (see BattleHero.getUpgradeCost), so a large flat
 * gold number here doesn't actually let offline progress buy more permanent
 * power than a comparable amount of active play would - it just clears
 * more of the geometric curve's cheap early rungs, which is exactly the
 * "welcome back" feeling this is going for.
 */
const GOLD_PER_STAGE_PER_HOUR = 40;

/**
 * Memory Fragments per stage-cleared per hour offline - deliberately much
 * more conservative than gold ("实际购买力在公式上受到严格控制"), since
 * fragments buy TalentManager's *permanent*, run-independent power. Offline
 * time should never be a faster way to max the talent tree than actually
 * playing and killing elites/bosses (see GameManager's own
 * MEMORY_FRAGMENT_DROP_RATIO for the in-run rate this is deliberately kept
 * well below, per hour of equivalent time).
 */
const FRAGMENTS_PER_STAGE_PER_HOUR = 0.6;

/** One "dog food" equipment drop is generated every this many offline hours - kept slow enough that even the full MAX_OFFLINE_SECONDS cap only produces a handful of items, not a full inventory dump. */
const EQUIPMENT_HOURS_PER_DROP = 2;

/** Offline drops are restricted to these two rarities - "离线收益只能产出 Common 和 Rare 级别的装备，绝不产出 Epic 和 Legendary". */
const OFFLINE_EQUIPMENT_RARITIES: EquipmentRarity[] = [EquipmentRarity.Common, EquipmentRarity.Rare];

export interface OfflineRewards {
  /** Seconds actually credited - min(rawElapsedSeconds, MAX_OFFLINE_SECONDS), what every reward figure below is computed from. */
  offlineSeconds: number;
  gold: number;
  memoryFragments: number;
  /** Common/Rare only - see OFFLINE_EQUIPMENT_RARITIES. */
  equipment: EquipmentItem[];
}

export class OfflineManager {
  /**
   * Computes the fixed reward package for having been away `rawElapsedSeconds`
   * (clamped to MAX_OFFLINE_SECONDS) with a save whose historical best run
   * reached `highestStageCleared` (0-based wave index, see SaveManager.
   * getHighestStageCleared) - a pure function of those two inputs, no
   * randomness anywhere except which specific equipment templates roll
   * (their *rarity pool* is fixed, not random). A `highestStageCleared` of
   * 0 (a save that's never cleared a single wave) still returns a
   * well-formed, all-zero-ish reward rather than throwing - there's simply
   * nothing to scale the "低保" off yet.
   */
  static calculateRewards(highestStageCleared: number, rawElapsedSeconds: number): OfflineRewards {
    const offlineSeconds = Math.max(0, Math.min(rawElapsedSeconds, MAX_OFFLINE_SECONDS));
    const offlineHours = offlineSeconds / 3600;
    const stageFactor = Math.max(0, highestStageCleared);

    const gold = Math.round(stageFactor * GOLD_PER_STAGE_PER_HOUR * offlineHours);
    const memoryFragments = Math.round(stageFactor * FRAGMENTS_PER_STAGE_PER_HOUR * offlineHours);

    const equipmentCount = Math.floor(offlineHours / EQUIPMENT_HOURS_PER_DROP);
    const equipment = Array.from({ length: equipmentCount }, () => generateRandomEquipment(OFFLINE_EQUIPMENT_RARITIES));

    return { offlineSeconds, gold, memoryFragments, equipment };
  }
}
