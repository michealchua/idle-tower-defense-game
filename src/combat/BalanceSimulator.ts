// Step 31's headless balance simulator - a pure Node/CLI script with zero
// DOM, Canvas, or audio dependency anywhere in its import graph (every
// module it pulls in - CombatEngine, BattleHero, EnemyFactory, TalentManager,
// SaveManager - is already proven Node-safe by test-run.ts's own headless
// run). Deliberately bypasses GameManager/WaveManager entirely: this file
// drives CombatEngine directly with its own `while` loop (no
// requestAnimationFrame anywhere), so a scenario's 10,000 iterations run at
// raw CPU speed instead of real wall-clock time. Never touches `fs` and
// never writes a file - every data point is aggregated in memory and the
// only output is one console.log(JSON.stringify(...)) at the very end.
//
// Run with: npx tsx src/combat/BalanceSimulator.ts
import { CombatEngine } from './CombatEngine';
import { BattleHero } from './BattleHero';
import { BattleEnemy } from './BattleEnemy';
import { EnemyFactory, enemyTypeDefinitions, ENEMY_HP_SCALING_BASE, ENEMY_ATTACK_SCALING_BASE } from './EnemyFactory';
import { talentManager } from './TalentManager';
import { HeroFactory } from '../data/hero/HeroFactory';
import { swordsmanTemplate } from '../data/hero/warriorTemplates';
import { bladeSlashSkill } from '../data/skills/warriorSkills';
import { gridCellCenter } from './gridConfig';
import { themeDefinitions, type ThemeId } from './ThemeManager';
import type { BiomeMechanics } from './activeBiome';
import {
  load as loadSave,
  save as saveMeta,
  clearInMemorySnapshotForTesting,
  addMemoryFragments,
  addEternitySparks,
  getEternitySparks,
} from './SaveManager';

// SaveManager's own "call load() before anything else touches meta state"
// contract (see main.ts/test-run.ts) - BattleHero reads talentManager/
// PrestigeManager bonuses off SaveManager's in-memory snapshot the instant
// it's constructed, so this has to run before scenario B/C ever build one.
loadSave();

// --- Section 2: standard scaling formulas -----------------------------------
//
// Enemy HP/attack scaling now lives in EnemyFactory.ts itself (see
// ENEMY_HP_SCALING_BASE/ENEMY_ATTACK_SCALING_BASE there) - real gameplay
// code (WaveManager) already passes a 1-based wave number through
// EnemyFactory.create, so that formula applies to actual runs too, not just
// this simulator. The hero EXP-growth formula below has no equivalent home
// in the live game: BattleHero's real upgrade() is gold-gated (see its
// getUpgradeCost), not EXP-gated, so this exists purely as this simulator's
// own reporting figure for Scenario B ("how much EXP would maxing a hero to
// level N represent"), not a mechanic anything else in the codebase reads.
const BASE_HERO_LEVEL_UP_EXP = 100;
const HERO_LEVEL_UP_EXP_GROWTH = 1.2;

/** EXP required to advance *from* `level` to `level + 1` - "当前等级升级所需 EXP = 基础 EXP * (1.2 ^ Level)". */
function expRequiredForLevel(level: number): number {
  return BASE_HERO_LEVEL_UP_EXP * HERO_LEVEL_UP_EXP_GROWTH ** level;
}

/** Cumulative EXP a hero would have needed to climb from level 1 to `targetLevel`. */
function cumulativeExpToReachLevel(targetLevel: number): number {
  let total = 0;
  for (let level = 1; level < targetLevel; level += 1) {
    total += expRequiredForLevel(level);
  }
  return total;
}

// --- Simulation tuning ------------------------------------------------------

/** Fixed tick size for every `while` loop below - coarser than the 60fps a real frame would use, since this simulator only needs statistically sound aggregates, not visually smooth playback nobody ever watches. */
const DT = 0.15;
/** Hard per-run wall-clock (sim-time) safety cap - guards against a pathological build that can neither die nor ever clear a wave (should never actually happen with real hero/enemy stats, but a runaway `while` loop with no upper bound at all is never worth the risk in a script meant to run unattended). */
const MAX_SIM_SECONDS = 600;
/** Hard per-run wave cap - a build still alive at this point is recorded as having "cleared" the simulated range rather than continuing indefinitely; see RunResult.reachedWaveCap. */
const MAX_WAVES = 50;
const ENEMIES_PER_WAVE = 4;
const RUNS_PER_SCENARIO = 10000;
/** Where the lone standoff hero sits - a cell overlapping the path's first leg, same chokepoint convention test-run.ts's own choke-point simulation already uses, just a single cell instead of four. */
const HERO_CELL = { col: 2, row: 3 };

const enemySpawnPosition = gridCellCenter(HERO_CELL.col, HERO_CELL.row);
const heroPosition = gridCellCenter(HERO_CELL.col, HERO_CELL.row);

/** Every registered biome's mechanics, in a fixed order - rotated through every WAVES_PER_STAGE waves (see biomeForWave), mirroring ThemeManager's own real stage-based rotation cadence (its default wavesPerStage) rather than switching biome every single wave. This matters for more than just realism: Volcano's burn (a multi-second DoT, see biomeMechanicsCatalog's VOLCANO_BURN_DURATION) can still be ticking on a hero a tick or two after the wave that applied it ends, and this simulator's environmental-damage attribution (see the unexplainedLoss accounting in simulateRun) has no way to know a damage tick's *origin* biome, only whichever biome is active *right now* - rotating slowly keeps that "whichever's active right now" approximation honest by making cross-boundary spillover a small fraction of each biome's total active time, instead of every rotation. */
// Volcano first (not themeDefinitions' own insertion order) - it's the only
// biome mechanic in biomeMechanicsCatalog.ts that deals direct, unavoidable
// hero damage (its periodic burn), so putting it in the very first stage
// guarantees even a short-lived Scenario A/C run (stuck by wave ~8-10 in
// practice) still actually samples it, instead of the environmental-damage
// section of the report coming back all zeros just because a fragile build
// never survived long enough to reach whichever stage volcano happened to
// land on.
const BIOME_ROTATION_ORDER: ThemeId[] = [
  'volcano',
  'forest',
  'desert',
  'ocean',
  'snowMountain',
  'poisonSwamp',
  'darkCave',
  'ancientRuins',
  'skyRealm',
  'demonAbyss',
];
const biomeCycle: BiomeMechanics[] = BIOME_ROTATION_ORDER.map((themeId) => themeDefinitions[themeId].mechanics);
const WAVES_PER_STAGE = 10;

function biomeForWave(wave: number): BiomeMechanics {
  const stageIndex = Math.floor((wave - 1) / WAVES_PER_STAGE);
  return biomeCycle[stageIndex % biomeCycle.length];
}

/** Deterministic enemy-type pattern per wave: a boss on the first slot of every 10th wave, orcs on every third slot otherwise, goblins filling the rest - simple, but consistent enough that "how far did this build get" numbers are comparable across scenarios/runs. */
function enemyTypeForSlot(wave: number, slotIndex: number): string {
  if (slotIndex === 0 && wave % 10 === 0) {
    return 'boss_demon';
  }
  return slotIndex % 3 === 2 ? 'orc' : 'goblin';
}

interface RunResult {
  /** The 1-based wave the build was still fighting when every hero died - equals MAX_WAVES + 1 if the run instead hit the wave cap alive (see reachedWaveCap). */
  stuckWave: number;
  survivedSeconds: number;
  /** True if every hero was still alive when MAX_WAVES was reached (or MAX_SIM_SECONDS - the safety cap only, expected to never actually bind in practice). */
  reachedWaveCap: boolean;
  /** Non-combat hero HP loss this run, bucketed by the ThemeId that was active when it happened - see the unexplainedLoss accounting inside simulateRun. */
  environmentalDamageByTheme: Record<ThemeId, number>;
}

function emptyEnvironmentalDamageMap(): Record<ThemeId, number> {
  const map = {} as Record<ThemeId, number>;
  for (const theme of Object.values(themeDefinitions)) {
    map[theme.id] = 0;
  }
  return map;
}

/**
 * Drives one full standoff between `buildHeroes()`'s roster and an endless,
 * wave-scaled stream of enemies until either every hero dies (the "stuck
 * wave" this run recorded) or MAX_WAVES/MAX_SIM_SECONDS caps out. Manually
 * replicates the handful of GameManager/WaveManager responsibilities this
 * simulator actually needs (spawning a wave's worth of enemies, applying the
 * active biome's onUpdate/onEnemySpawn hooks) directly against a bare
 * CombatEngine - no WaveManager, no GameManager, no rendering, and no
 * requestAnimationFrame anywhere in the loop below.
 *
 * Environmental damage attribution: `onHeroDamaged` fires for every real
 * combat hit (enemy attack/AoE) an engine.update() tick produces, so summing
 * those events gives the tick's "explained" hero HP loss. Comparing that
 * against the tick's *actual* total hero HP loss (summed directly off
 * stats.currentHp before/after) isolates whatever's left over - i.e. damage
 * that happened without a combat hit behind it, which in this codebase only
 * ever means Volcano's periodic burn (the only BiomeMechanics hook that
 * subtracts hero HP outside the combat-hit path). That unexplained delta is
 * what gets bucketed into environmentalDamageByTheme under whichever theme
 * was active that tick.
 */
/** Seconds between each enemy within a wave's spawn queue trickling in - mirrors sampleLevelConfig's own real per-group intervals (0.5-1s) rather than dumping a whole wave onto the field in one instant, so a lone standoff hero gets a real chance to thin a wave down before the rest of it arrives, same as any real WaveConfig already guarantees. */
const SPAWN_INTERVAL_SECONDS = 0.8;

function simulateRun(buildHeroes: () => BattleHero[]): RunResult {
  let combatDamageThisTick = 0;
  let currentWave = 1;

  const engine = new CombatEngine({
    onHeroDamaged: (event) => {
      combatDamageThisTick += event.amount;
    },
    onEnemyAdded: (enemy) => {
      biomeForWave(currentWave).onEnemySpawn?.(enemy);
    },
  });

  const heroes = buildHeroes();
  for (const hero of heroes) {
    engine.addHero(hero);
  }

  const enemyFactory = new EnemyFactory();
  const environmentalDamageByTheme = emptyEnvironmentalDamageMap();

  /** Enemy type ids for the current wave still waiting to actually spawn - drained one at a time by the spawn-timer loop below, same "trickle in over the wave" shape WaveManager's own spawnQueue/spawnTimer follows. */
  let pendingSpawns: string[] = [];
  let spawnTimer = 0;

  function queueWave(wave: number): void {
    pendingSpawns = Array.from({ length: ENEMIES_PER_WAVE }, (_, slot) => enemyTypeForSlot(wave, slot));
    spawnTimer = 0;
  }

  function spawnNextIfDue(deltaTime: number): void {
    if (pendingSpawns.length === 0) {
      return;
    }
    spawnTimer -= deltaTime;
    if (spawnTimer > 0) {
      return;
    }
    const enemyType = pendingSpawns.shift()!;
    const enemy = enemyFactory.create(enemyType, currentWave);
    enemy.x = enemySpawnPosition.x;
    enemy.y = enemySpawnPosition.y - 200; // a little further up the path than the hero, so it has to walk into range rather than spawning already engaged
    engine.addEnemy(enemy);
    spawnTimer = SPAWN_INTERVAL_SECONDS;
  }

  queueWave(currentWave);

  let elapsedSeconds = 0;
  let reachedWaveCap = false;

  while (elapsedSeconds < MAX_SIM_SECONDS) {
    if (heroes.every((hero) => !hero.isAlive)) {
      break;
    }
    if (currentWave > MAX_WAVES) {
      reachedWaveCap = true;
      break;
    }

    combatDamageThisTick = 0;
    const hpBefore = heroes.reduce((sum, hero) => sum + hero.stats.currentHp, 0);

    spawnNextIfDue(DT);
    engine.update(DT);
    const activeMechanics = biomeForWave(currentWave);
    activeMechanics.onUpdate?.(DT, engine);

    const hpAfter = heroes.reduce((sum, hero) => sum + hero.stats.currentHp, 0);
    const unexplainedLoss = Math.max(0, hpBefore - hpAfter - combatDamageThisTick);
    if (unexplainedLoss > 0) {
      // BiomeMechanics.themeId is typed as a plain `string` (see
      // activeBiome.ts's own doc comment on why - it's debug/logging only
      // there), but every value biomeCycle can ever produce actually comes
      // straight from themeDefinitions, so it's always a real ThemeId.
      environmentalDamageByTheme[activeMechanics.themeId as ThemeId] += unexplainedLoss;
    }

    elapsedSeconds += DT;

    // A wave is only actually "cleared" once its queue has fully drained
    // AND every enemy it already spawned is gone (dead or escaped) - both
    // conditions guard against advancing mid-wave just because the handful
    // of enemies spawned *so far* happen to be momentarily wiped out before
    // the rest have trickled in.
    if (pendingSpawns.length === 0 && engine.getAliveEnemies().length === 0) {
      currentWave += 1;
      if (currentWave <= MAX_WAVES) {
        queueWave(currentWave);
      }
    }
  }

  if (elapsedSeconds >= MAX_SIM_SECONDS && heroes.some((hero) => hero.isAlive)) {
    reachedWaveCap = true;
  }

  return {
    stuckWave: reachedWaveCap ? MAX_WAVES + 1 : currentWave,
    survivedSeconds: elapsedSeconds,
    reachedWaveCap,
    environmentalDamageByTheme,
  };
}

// --- Hero builders -----------------------------------------------------------

function freshSwordsman(): BattleHero {
  return new BattleHero(HeroFactory.createHero(swordsmanTemplate), [bladeSlashSkill], heroPosition);
}

/** Same fresh level-1 swordsman as freshSwordsman(), but placed at the world origin - what measureTimeToKill actually needs, since its target sits at a fixed (50, 0) (mirroring test-run.ts's own isolated single-hero-vs-single-enemy boundary tests), not the chokepoint cell freshSwordsman() otherwise places a hero at for the wave-standoff scenarios above. */
function freshSwordsmanAtOrigin(): BattleHero {
  return new BattleHero(HeroFactory.createHero(swordsmanTemplate), [bladeSlashSkill], { x: 0, y: 0 });
}

/** Scenario A: a single level-1 hero, no talents, no prestige - the game's absolute floor. */
function buildScenarioAHero(): BattleHero[] {
  return [freshSwordsman()];
}

/** Scenario B: the same hero leveled to 50 via 49 direct upgrade() calls (bypassing the gold gate entirely - this simulator is modeling the *stat curve*, not re-proving the economy test-run.ts's own boundary tests already cover) - talent bonuses come along for free since BattleHero reads talentManager's persisted level on every stat access. */
function buildScenarioBHero(): BattleHero[] {
  const hero = freshSwordsman();
  for (let i = 0; i < 49; i += 1) {
    hero.upgrade();
  }
  return [hero];
}

/** Scenario C: a fresh level-1 hero under a persisted 10-Spark global bonus (PrestigeManager.getGlobalBonusMultiplier(), consumed automatically by BattleHero.computeFinalStat) - deliberately level 1 again (not level 50) so its standoff numbers isolate what the Sparks multiplier alone buys a run, rather than compounding with Scenario B's leveling. */
function buildScenarioCHero(): BattleHero[] {
  return [freshSwordsman()];
}

// --- Scenario C's own Time-to-Kill comparison --------------------------------

/**
 * Seconds for `buildHero()`'s hero (assumed already positioned in range of
 * one stationary, wave-scaled goblin) to kill it - the two-participant,
 * no-wave-progression measurement Scenario C's spec explicitly asks for
 * ("对比其前期推图的效率"). `waveNumber` picks which point on
 * EnemyFactory's scaling curve the target goblin sits at (wave 3, an early-
 * game data point, for both the baseline and Sparks-boosted measurements
 * below, so the comparison isolates the Sparks multiplier's effect and
 * nothing else).
 */
function measureTimeToKill(buildHero: () => BattleHero, waveNumber: number): number {
  const hero = buildHero();
  // Built directly (not via EnemyFactory.create) so `speed` can be 0 -
  // BattleEnemy's own `speed` field is readonly, and this measurement wants
  // a stationary target already in range rather than one that has to walk
  // into it first, same "isolate the one thing being measured" reasoning
  // test-run.ts's own DOT boundary test already follows. Still applies the
  // exact same wave-scaling formula EnemyFactory.create uses internally, so
  // this stays a faithful "wave 3 goblin", not a hand-tuned stand-in.
  const goblinBase = enemyTypeDefinitions.goblin;
  const target = new BattleEnemy({
    instanceId: `ttk-target-${waveNumber}`,
    archetypeId: 'goblin',
    maxHp: goblinBase.maxHp * ENEMY_HP_SCALING_BASE ** waveNumber,
    defense: goblinBase.defense,
    speed: 0,
    goldReward: goblinBase.goldReward,
    expReward: goblinBase.expReward,
    baseDamage: goblinBase.baseDamage,
    attackDamage: goblinBase.attackDamage * ENEMY_ATTACK_SCALING_BASE ** waveNumber,
    attackRange: goblinBase.attackRange,
    attackSpeed: goblinBase.attackSpeed,
  });
  target.x = 50;
  target.y = 0;

  const engine = new CombatEngine();
  engine.addHero(hero);
  engine.addEnemy(target);

  let elapsedSeconds = 0;
  const CAP_SECONDS = 60;
  while (target.isAlive && elapsedSeconds < CAP_SECONDS) {
    engine.update(DT);
    elapsedSeconds += DT;
  }
  return elapsedSeconds;
}

// --- Aggregation --------------------------------------------------------------

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Merges every run's own environmentalDamageByTheme map into one scenario-wide total, then expresses each theme as a percentage share of the grand total - what the report's "造成伤害最多的环境机制占比" figure reads from. */
function summarizeEnvironmentalDamage(runs: RunResult[]): { shareByTheme: Record<ThemeId, number>; dominantTheme: ThemeId | null; dominantSharePercent: number } {
  const totals = emptyEnvironmentalDamageMap();
  for (const run of runs) {
    for (const themeId of Object.keys(totals) as ThemeId[]) {
      totals[themeId] += run.environmentalDamageByTheme[themeId];
    }
  }

  const grandTotal = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const shareByTheme = {} as Record<ThemeId, number>;
  let dominantTheme: ThemeId | null = null;
  let dominantShare = 0;

  for (const themeId of Object.keys(totals) as ThemeId[]) {
    const share = grandTotal > 0 ? (totals[themeId] / grandTotal) * 100 : 0;
    shareByTheme[themeId] = round2(share);
    if (share > dominantShare) {
      dominantShare = share;
      dominantTheme = themeId;
    }
  }

  return { shareByTheme, dominantTheme, dominantSharePercent: round2(dominantShare) };
}

function runScenario(runs: number, buildHeroes: () => BattleHero[]): RunResult[] {
  const results: RunResult[] = [];
  for (let i = 0; i < runs; i += 1) {
    results.push(simulateRun(buildHeroes));
  }
  return results;
}

// --- Scenario A: zero-investment blank slate ---------------------------------

console.log('=== 场景 A（零转生白板）模拟中... ===');
clearInMemorySnapshotForTesting();
saveMeta();
const scenarioAStart = Date.now();
const scenarioARuns = runScenario(RUNS_PER_SCENARIO, buildScenarioAHero);
const scenarioAElapsedMs = Date.now() - scenarioAStart;
const scenarioAEnv = summarizeEnvironmentalDamage(scenarioARuns);
console.log(`  完成 ${RUNS_PER_SCENARIO} 次模拟，用时 ${scenarioAElapsedMs}ms。`);

// --- Scenario B: mid-investment build -----------------------------------------

console.log('=== 场景 B（中度养成）模拟中... ===');
clearInMemorySnapshotForTesting();
saveMeta();
addMemoryFragments(500);
let vitalityLevelsPurchased = 0;
{
  // "点满基础 Vitality" - spends the real upgradeTalent path (respecting its
  // costFormula/maxLevel), not a shortcut setTalentLevel call, so the
  // report's own vitalityLevelReached honestly reflects what 500 fragments
  // can actually afford rather than assuming it's always enough.
  let result = talentManager.upgradeTalent('vitality');
  while (result.success) {
    vitalityLevelsPurchased += 1;
    result = talentManager.upgradeTalent('vitality');
  }
}
const scenarioBStart = Date.now();
const scenarioBRuns = runScenario(RUNS_PER_SCENARIO, buildScenarioBHero);
const scenarioBElapsedMs = Date.now() - scenarioBStart;
const scenarioBEnv = summarizeEnvironmentalDamage(scenarioBRuns);
console.log(`  完成 ${RUNS_PER_SCENARIO} 次模拟，用时 ${scenarioBElapsedMs}ms。Vitality 实际点到 Lv.${vitalityLevelsPurchased}。`);

// --- Scenario C: post-prestige build + Time-to-Kill comparison ---------------

console.log('=== 场景 C（一转质变）模拟中... ===');
clearInMemorySnapshotForTesting();
saveMeta();

// Baseline TTK measured with zero Sparks first (SaveManager already at a
// fresh, Sparks-less default from the clear above), then the same
// measurement repeated after granting 10 Sparks - both against an identical
// wave-3 goblin, so the only variable between the two batches is the
// PrestigeManager global multiplier itself.
console.log('  测量转生前 TTK 基准...');
const ttkBaselineSamples: number[] = [];
for (let i = 0; i < RUNS_PER_SCENARIO; i += 1) {
  ttkBaselineSamples.push(measureTimeToKill(freshSwordsmanAtOrigin, 3));
}

addEternitySparks(10);
saveMeta();
console.log(`  已授予 10 点永恒星火（当前 ${getEternitySparks()} 点），测量转生后 TTK...`);
const ttkSparkedSamples: number[] = [];
for (let i = 0; i < RUNS_PER_SCENARIO; i += 1) {
  ttkSparkedSamples.push(measureTimeToKill(freshSwordsmanAtOrigin, 3));
}

const scenarioCStart = Date.now();
const scenarioCRuns = runScenario(RUNS_PER_SCENARIO, buildScenarioCHero);
const scenarioCElapsedMs = Date.now() - scenarioCStart;
const scenarioCEnv = summarizeEnvironmentalDamage(scenarioCRuns);
console.log(`  完成 ${RUNS_PER_SCENARIO} 次标准对抗模拟，用时 ${scenarioCElapsedMs}ms。`);

// Leaves no persisted state behind for anything that might run after this
// script in the same process - same test-isolation courtesy test-run.ts's
// own persistence-touching boundary tests already follow.
clearInMemorySnapshotForTesting();
saveMeta();

// --- Section 4: in-memory aggregation + terminal JSON report -----------------
//
// No `fs` import anywhere in this file, and nothing here ever calls
// writeFile/writeFileSync/appendFile or opens any file handle - every number
// below lives only in these plain arrays/objects for the lifetime of this
// process, and the sole way any of it leaves this script is the single
// console.log(JSON.stringify(...)) call at the very bottom.
const ttkBaselineAverage = average(ttkBaselineSamples);
const ttkSparkedAverage = average(ttkSparkedSamples);

const report = {
  generatedAt: new Date().toISOString(),
  simulationConfig: {
    runsPerScenario: RUNS_PER_SCENARIO,
    tickSeconds: DT,
    maxSimSecondsPerRun: MAX_SIM_SECONDS,
    maxWavesPerRun: MAX_WAVES,
    enemiesPerWave: ENEMIES_PER_WAVE,
    scalingFormulas: {
      enemyHp: 'baseHp * 1.15^waveNumber',
      enemyAttack: 'baseAttack * 1.08^waveNumber',
      heroLevelUpExp: 'baseExp * 1.2^level (base=100, reporting-only - see cumulativeExpToReachLevel)',
    },
  },
  scenarios: {
    scenarioA_zeroInvestmentBaseline: {
      description: '仅放置一个 1 级初始英雄，无天赋、无星火加成',
      runs: RUNS_PER_SCENARIO,
      simulationWallTimeMs: scenarioAElapsedMs,
      averageStuckWave: round2(average(scenarioARuns.map((run) => run.stuckWave))),
      medianStuckWave: median(scenarioARuns.map((run) => run.stuckWave)),
      averageSurvivalSeconds: round2(average(scenarioARuns.map((run) => run.survivedSeconds))),
      waveCapReachedRatioPercent: round2((scenarioARuns.filter((run) => run.reachedWaveCap).length / RUNS_PER_SCENARIO) * 100),
      environmentalDamageSharePercentByTheme: scenarioAEnv.shareByTheme,
      dominantEnvironmentalMechanic: scenarioAEnv.dominantTheme,
      dominantEnvironmentalMechanicSharePercent: scenarioAEnv.dominantSharePercent,
    },
    scenarioB_midInvestmentBuild: {
      description: '英雄达到 50 级，拥有 500 点记忆碎片并点满基础 Vitality（生命）天赋',
      runs: RUNS_PER_SCENARIO,
      simulationWallTimeMs: scenarioBElapsedMs,
      heroLevel: 50,
      vitalityLevelReached: vitalityLevelsPurchased,
      vitalityMaxLevel: talentManager.getNode('vitality')?.maxLevel ?? null,
      estimatedCumulativeExpToReachLevel50: Math.round(cumulativeExpToReachLevel(50)),
      averageStuckWave: round2(average(scenarioBRuns.map((run) => run.stuckWave))),
      medianStuckWave: median(scenarioBRuns.map((run) => run.stuckWave)),
      averageClearOrDeathTimeSeconds: round2(average(scenarioBRuns.map((run) => run.survivedSeconds))),
      waveCapReachedRatioPercent: round2((scenarioBRuns.filter((run) => run.reachedWaveCap).length / RUNS_PER_SCENARIO) * 100),
      environmentalDamageSharePercentByTheme: scenarioBEnv.shareByTheme,
      dominantEnvironmentalMechanic: scenarioBEnv.dominantTheme,
      dominantEnvironmentalMechanicSharePercent: scenarioBEnv.dominantSharePercent,
    },
    scenarioC_postPrestigeBuild: {
      description: '经历一次转生，拥有 10 点 Eternity Sparks（+50% 独立全局乘区加成）',
      runs: RUNS_PER_SCENARIO,
      simulationWallTimeMs: scenarioCElapsedMs,
      eternitySparks: 10,
      globalBonusMultiplierPercent: 50,
      averageStuckWave: round2(average(scenarioCRuns.map((run) => run.stuckWave))),
      medianStuckWave: median(scenarioCRuns.map((run) => run.stuckWave)),
      averageSurvivalSeconds: round2(average(scenarioCRuns.map((run) => run.survivedSeconds))),
      waveCapReachedRatioPercent: round2((scenarioCRuns.filter((run) => run.reachedWaveCap).length / RUNS_PER_SCENARIO) * 100),
      environmentalDamageSharePercentByTheme: scenarioCEnv.shareByTheme,
      dominantEnvironmentalMechanic: scenarioCEnv.dominantTheme,
      dominantEnvironmentalMechanicSharePercent: scenarioCEnv.dominantSharePercent,
      timeToKillComparison: {
        targetEnemy: 'goblin at wave 3 scaling',
        samplesPerBatch: RUNS_PER_SCENARIO,
        averageSecondsWithoutSparks: round2(ttkBaselineAverage),
        averageSecondsWithSparks: round2(ttkSparkedAverage),
        efficiencyImprovementPercent: round2(ttkBaselineAverage > 0 ? ((ttkBaselineAverage - ttkSparkedAverage) / ttkBaselineAverage) * 100 : 0),
      },
    },
  },
};

console.log(JSON.stringify(report, null, 2));
