import { getBossKindForWave, getBossTimeLimit, getNormalWaveEnemyCount, waveConfig } from '../../data/waveConfig';
import { effectLifetimes, victoryPoseConfig } from '../../data/effectConfig';
import { getDiamondChapterClearReward } from '../../data/diamondConfig';
import { spawnVisualEffect, queueSfx } from './EffectsSystem';
import { incrementDailyQuestProgress } from './DailyQuestSystem';
import { getAliveDeployedHeroes } from './HeroStatsSystem';
import type { GameState, WaveState } from '../types';

// Pure - derives a wave's "shape" purely from chapter/waveInChapter. Shared
// by every entry point below so "what a fresh wave N looks like" is defined
// in exactly one place.
function configureWaveShape(wave: WaveState): void {
  const bossKind = getBossKindForWave(wave.waveInChapter);
  wave.isBossWave = bossKind !== undefined;
  wave.bossKind = bossKind;
  wave.enemiesRemainingToSpawn = bossKind ? 0 : getNormalWaveEnemyCount(wave.chapter);
  wave.timeRemaining = bossKind ? getBossTimeLimit(bossKind) : undefined;
  wave.bossSpawned = false;
}

// Flattens chapter/waveInChapter into one monotonically-increasing counter -
// the unit unlockConditionConfig.panelUnlockWave gates panels on, since
// "Wave 11/20/50/100" reads as a single running count, not a chapter-
// relative one that resets every 10 waves.
export function getGlobalWaveNumber(wave: WaveState): number {
  return (wave.chapter - 1) * waveConfig.wavesPerChapter + wave.waveInChapter;
}

export function createInitialWaveState(): WaveState {
  const wave: WaveState = {
    chapter: 1,
    waveInChapter: 1,
    isBossWave: false,
    bossSpawned: false,
    enemiesRemainingToSpawn: 0,
  };
  configureWaveShape(wave);
  return wave;
}

// Resets the battlefield for a fresh wave attempt - shared by both
// advancing and retrying, since both start the wave "clean" (see plan: base
// full-heals each wave rather than carrying chip damage over). Heroes get
// the same treatment - chip damage from CombatSystem.tickEnemyAttacksOnHeroes
// doesn't carry across waves, only within one.
function resetBattlefieldForWave(state: GameState): void {
  for (const hero of state.heroes) {
    hero.currentHp = hero.maxHp;
    hero.isDowned = false;
    // A hero mid-walk (or mid-fight) when the wave ends snaps back to its
    // slot for the fresh attempt, same "clean start" treatment as HP/enemies
    // above - see MovementSystem.tickHeroMovement.
    hero.position = { ...hero.homePosition };
    hero.moveTargetEnemyInstanceId = null;
  }
  state.enemies = [];
  state.spawnCooldownRemaining = 0;
}

export function advanceToNextWave(state: GameState): void {
  const wave = state.wave;
  if (wave.waveInChapter >= waveConfig.wavesPerChapter) {
    // Milestone reward for clearing a whole chapter (its wave-10 boss just
    // died) - separate from the per-boss-kill reward in
    // DamageSystem.handleDeath, which already fired for this same kill.
    state.diamonds += getDiamondChapterClearReward(wave.chapter);
    wave.chapter += 1;
    wave.waveInChapter = 1;
  } else {
    wave.waveInChapter += 1;
  }
  configureWaveShape(wave);
  resetBattlefieldForWave(state);
  incrementDailyQuestProgress(state, 'clearWaves');
  state.highestGlobalWaveReached = Math.max(state.highestGlobalWaveReached, getGlobalWaveNumber(wave));

  // Per-biome chapter-intro story beat (plan section 21's "剧情以短对话→
  // 战斗→Boss→奖励→新地图为主") disabled per user request - used to pause
  // gameplay for a StoryDialog on the first wave of every newly-entered
  // biome (biomeConfig.ts's getBiomeForChapter/storyScripts,
  // GameState.seenChapterStoryIds). That trigger call was removed from here;
  // seenChapterStoryIds/storyScripts themselves are left alone (still valid
  // save data/config) in case this gets re-enabled later.

  spawnVisualEffect(state, {
    kind: 'waveClear',
    x: state.base.position.x,
    y: state.base.position.y,
    lifetime: effectLifetimes.waveClear,
  });
  queueSfx(state, 'waveClear');
  state.victoryPoseRemaining = victoryPoseConfig.seconds;
}

// What a failed wave (timer expired without clearing, or the whole squad
// went down) triggers - never isGameOver. Same chapter/waveInChapter, so
// hero/gear/gold progress carries over but the attempt starts fresh.
export function retryCurrentWave(state: GameState): void {
  if (state.wave.isBossWave) {
    // Failing a boss wave re-surfaces tutorialConfig.ts's one-shot 'bossPrep'
    // equipment reminder even if it was already dismissed once - a lost
    // boss fight is real evidence the player wasn't ready, worth nudging
    // again rather than trusting the first (possibly ignored) dismissal
    // forever. Only boss waves do this; a normal-wave retry doesn't touch it.
    state.completedTutorialStepIds = state.completedTutorialStepIds.filter((id) => id !== 'bossPrep');
  }
  configureWaveShape(state.wave);
  resetBattlefieldForWave(state);
}

function isBossAlive(state: GameState): boolean {
  const bossArchetypeId = state.wave.bossKind;
  return state.enemies.some((enemy) => enemy.archetypeId === bossArchetypeId);
}

// Replaces the old base-HP-reaches-0 lose condition (see BaseState's doc
// comment) - true once every currently-deployed hero is downed at the same
// time (DamageSystem.applyDamageToHero). Empty-squad states (nothing
// deployed at all) deliberately don't count as a wipe - there's nothing to
// have lost yet.
function checkSquadWipe(state: GameState): boolean {
  return state.deployedHeroIds.length > 0 && getAliveDeployedHeroes(state).length === 0;
}

// Checks clear/fail conditions and advances/retries - called every tick
// after combat/skills resolve, so a boss killed or a squad wiped this tick
// is detected the same tick.
export function tickWaveProgress(state: GameState, deltaSeconds: number): void {
  if (checkSquadWipe(state)) {
    retryCurrentWave(state);
    return;
  }

  const wave = state.wave;

  if (wave.isBossWave) {
    if (wave.timeRemaining !== undefined) {
      wave.timeRemaining = Math.max(0, wave.timeRemaining - deltaSeconds);
    }

    if (wave.bossSpawned && !isBossAlive(state)) {
      advanceToNextWave(state);
      return;
    }

    if (wave.timeRemaining === 0) {
      retryCurrentWave(state);
    }
    return;
  }

  if (wave.enemiesRemainingToSpawn <= 0 && state.enemies.length === 0) {
    advanceToNextWave(state);
  }
}

// Fires the new-player tutorial StoryDialog exactly once - the moment a
// save reaches Wave 1 for the first time. hasSeenTutorialStory guards
// against refiring (including on every later tick of wave 1 itself, and
// after loading a save that already saw it). See GameLoop.step for where
// this is called and how pendingStoryId pauses gameplay while set.
export function tickTutorialStoryTrigger(state: GameState): void {
  if (state.hasSeenTutorialStory || state.pendingStoryId !== null) {
    return;
  }
  if (getGlobalWaveNumber(state.wave) === 1) {
    state.pendingStoryId = 'tutorial';
    state.hasSeenTutorialStory = true;
  }
}
