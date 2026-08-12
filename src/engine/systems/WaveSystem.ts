import { getBossKindForWave, getBossTimeLimit, getNormalWaveEnemyCount, waveConfig } from '../../data/waveConfig';
import { getBaseMaxHpForWave } from '../../data/baseConfig';
import { effectLifetimes } from '../../data/effectConfig';
import { getDiamondChapterClearReward } from '../../data/diamondConfig';
import { getBiomeForChapter } from '../../data/biomeConfig';
import { storyScripts } from '../../data/storyConfig';
import { spawnVisualEffect } from './EffectsSystem';
import { incrementDailyQuestProgress } from './DailyQuestSystem';
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
  state.base.maxHp = getBaseMaxHpForWave(getGlobalWaveNumber(state.wave));
  state.base.currentHp = state.base.maxHp;
  for (const hero of state.heroes) {
    hero.currentHp = hero.maxHp;
  }
  state.enemies = [];
  state.spawnCooldownRemaining = 0;
}

export function advanceToNextWave(state: GameState): void {
  const wave = state.wave;
  let enteredNewChapter = false;
  if (wave.waveInChapter >= waveConfig.wavesPerChapter) {
    // Milestone reward for clearing a whole chapter (its wave-10 boss just
    // died) - separate from the per-boss-kill reward in
    // DamageSystem.handleDeath, which already fired for this same kill.
    state.diamonds += getDiamondChapterClearReward(wave.chapter);
    wave.chapter += 1;
    wave.waveInChapter = 1;
    enteredNewChapter = true;
  } else {
    wave.waveInChapter += 1;
  }
  configureWaveShape(wave);
  resetBattlefieldForWave(state);
  incrementDailyQuestProgress(state, 'clearWaves');
  state.highestGlobalWaveReached = Math.max(state.highestGlobalWaveReached, getGlobalWaveNumber(wave));

  // Plan section 21's "剧情以短对话→战斗→Boss→奖励→新地图为主" - the new
  // chapter's biome gets a short story beat the first time it's ever
  // entered (biomeConfig's 10-biome cycle repeats every 10 chapters, but
  // each biome's own beat should only play once - see
  // GameState.seenChapterStoryIds). forest has no storyScripts entry
  // (chapter 1's intro is the tutorial script instead), so this silently
  // no-ops the first time through the cycle.
  if (enteredNewChapter) {
    const biomeId = getBiomeForChapter(wave.chapter).id;
    if (storyScripts[biomeId] && !state.seenChapterStoryIds.includes(biomeId)) {
      state.seenChapterStoryIds.push(biomeId);
      state.pendingStoryId = biomeId;
    }
  }

  spawnVisualEffect(state, {
    kind: 'waveClear',
    x: state.base.position.x,
    y: state.base.position.y,
    lifetime: effectLifetimes.waveClear,
  });
}

// What a failed wave (timer expired without clearing, or the base was
// destroyed) triggers - never isGameOver. Same chapter/waveInChapter, so
// hero/gear/gold progress carries over but the attempt starts fresh.
export function retryCurrentWave(state: GameState): void {
  configureWaveShape(state.wave);
  resetBattlefieldForWave(state);
}

function isBossAlive(state: GameState): boolean {
  const bossArchetypeId = state.wave.bossKind;
  return state.enemies.some((enemy) => enemy.archetypeId === bossArchetypeId);
}

// Checks clear conditions and advances - called every tick after combat/
// skills resolve, so a boss killed this tick is detected the same tick.
export function tickWaveProgress(state: GameState, deltaSeconds: number): void {
  const wave = state.wave;

  if (wave.isBossWave) {
    if (wave.timeRemaining !== undefined) {
      wave.timeRemaining = Math.max(0, wave.timeRemaining - deltaSeconds);
    }

    if (wave.bossSpawned && !isBossAlive(state)) {
      advanceToNextWave(state);
      return;
    }

    if (wave.timeRemaining === 0 && state.base.currentHp > 0) {
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
