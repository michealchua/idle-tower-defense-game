// Step 28's elite/boss affix system - a small pool of random modifiers
// EnemyFactory rolls onto isElite enemies (which already covers every boss,
// see EnemyFactory.ts) based on the current wave number, independent of
// that enemy's base archetype stats. Pure data + roll logic lives here;
// the actual gameplay hooks (shield absorption, lifesteal, teleport,
// death-split, berserk) live on BattleEnemy/CombatEngine themselves, which
// import the tuning constants below rather than redefining them.

export enum AffixId {
  /** Spawns with a shield worth SHIELDED_SHIELD_RATIO of maxHp - incoming damage (skill hits, projectiles, DOT ticks) depletes the shield before touching currentHp at all. */
  Shielded = 'shielded',
  /** VAMPIRIC_LIFESTEAL_RATIO of every point of damage this enemy deals to a hero heals it for the same amount. */
  Vampiric = 'vampiric',
  /** TELEPORTER_CHANCE odds, on taking direct hero damage (not DOT), to instantly jump TELEPORTER_DISTANCE_PX forward along its path - gated by its own TELEPORTER_COOLDOWN_SECONDS cooldown so it can't chain-teleport every single hit. */
  Teleporter = 'teleporter',
  /** On death, doesn't settle normally (no gold/exp/loot for the original) - instead splits into two half-stat, half-size copies of itself (with Cloner itself stripped from the copies, so they can't split again) which register into CombatEngine and settle normally when *they* die. */
  Cloner = 'cloner',
  /** Once currentHp drops to/below BERSERKER_HP_THRESHOLD of maxHp, doubles both attack cadence and movement speed and reads visually "enraged" (GameRenderer tints it red) for the remainder of the fight. */
  Berserker = 'berserker',
}

export interface AffixDefinition {
  id: AffixId;
  /** Short label GameRenderer draws above an affixed enemy's HP bar, e.g. "[Shielded]". */
  label: string;
  /** Color that label (and any affix-specific effect overlay) draws in. */
  color: string;
}

export const affixDefinitions: Record<AffixId, AffixDefinition> = {
  [AffixId.Shielded]: { id: AffixId.Shielded, label: 'Shielded', color: '#60a5fa' },
  [AffixId.Vampiric]: { id: AffixId.Vampiric, label: 'Vampiric', color: '#f87171' },
  [AffixId.Teleporter]: { id: AffixId.Teleporter, label: 'Teleporter', color: '#c084fc' },
  [AffixId.Cloner]: { id: AffixId.Cloner, label: 'Cloner', color: '#4ade80' },
  [AffixId.Berserker]: { id: AffixId.Berserker, label: 'Berserker', color: '#facc15' },
};

const ALL_AFFIX_IDS: AffixId[] = Object.values(AffixId);

// --- Tuning constants, one per affix's own mechanic ------------------------

/** Shielded: shield HP granted on spawn, as a fraction of maxHp. */
export const SHIELDED_SHIELD_RATIO = 0.5;
/** Vampiric: fraction of outgoing hero-directed damage returned as self-heal. */
export const VAMPIRIC_LIFESTEAL_RATIO = 0.3;
/** Teleporter: odds per qualifying hit of actually triggering the warp. */
export const TELEPORTER_CHANCE = 0.15;
/** Teleporter: minimum seconds between two triggers. */
export const TELEPORTER_COOLDOWN_SECONDS = 2;
/** Teleporter: how far forward (toward the base) each trigger jumps, in px. */
export const TELEPORTER_DISTANCE_PX = 80;
/** Cloner: each split copy's size/stat scale relative to the original. */
export const CLONER_SCALE = 0.5;
/** Berserker: currentHp/maxHp threshold that flips isBerserking on. */
export const BERSERKER_HP_THRESHOLD = 0.5;
/** Berserker: multiplier applied to both attack cadence and movement speed while berserking. */
export const BERSERKER_SPEED_MULTIPLIER = 2;

/**
 * How many affixes an elite/boss spawned at `waveNumber` (1-based, same
 * convention as SaveManager.recordStageCleared/PrestigeManager) can roll at
 * most - "20 波起 1 个词缀，每多 30 波增加 1 个词缀上限，最多 3 个". 0 below
 * wave 20 (no affixes at all yet).
 */
export function maxAffixCountForWave(waveNumber: number): number {
  if (waveNumber < 20) {
    return 0;
  }
  return Math.min(3, 1 + Math.floor((waveNumber - 20) / 30));
}

/**
 * Rolls a random, non-repeating affix list for one elite/boss spawn at
 * `waveNumber` - anywhere from 1 up to maxAffixCountForWave(waveNumber)
 * affixes (a random count each time, not always the cap), drawn from the
 * full pool without replacement so the same affix can never appear twice
 * on one enemy. Returns an empty array below wave 20, per
 * maxAffixCountForWave.
 */
export function rollAffixes(waveNumber: number): AffixId[] {
  const maxCount = maxAffixCountForWave(waveNumber);
  if (maxCount <= 0) {
    return [];
  }

  const count = 1 + Math.floor(Math.random() * maxCount);
  const pool = [...ALL_AFFIX_IDS];
  const rolled: AffixId[] = [];

  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const index = Math.floor(Math.random() * pool.length);
    rolled.push(pool[index]);
    pool.splice(index, 1);
  }

  return rolled;
}
