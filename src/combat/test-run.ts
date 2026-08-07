// Manual, data-driven simulation of GameManager over sampleLevelConfig's
// 2 waves, ending in an explicit victory assertion.
// Run with: npx tsx src/combat/test-run.ts

import { GameManager, GameState } from './GameManager';
import { WaveState } from './WaveManager';
import { BattleHero } from './BattleHero';
import { sampleLevelConfig } from './sampleLevelConfig';
import { HeroFactory } from '../data/hero/HeroFactory';
import { swordsmanTemplate } from '../data/hero/warriorTemplates';
import { bladeSlashSkill, bloodFurySkill, bloodrageSlashSkill } from '../data/skills/warriorSkills';
import { gridCellCenter } from './gridConfig';

// --- forceStartNextWave edge cases -----------------------------------
//
// Isolated from the main simulation below so a failure here points
// straight at the hardcore-mechanic seam itself, not at the choke-point
// hero cluster's damage math.
console.log('=== forceStartNextWave 边界验证 ===');
{
  const gm = new GameManager(sampleLevelConfig, {}, { maxBaseHp: 100 });
  gm.start();
  // Read WaveManager.state into a fresh local after every mutating call
  // (start()/forceStartNextWave()) rather than repeatedly comparing the
  // live gm.waveManager.state expression - TypeScript's control-flow
  // narrowing doesn't know those calls can change what that getter
  // returns, and "remembers" an earlier comparison's result straight
  // through them, flagging the next comparison as an impossible literal
  // overlap.
  const stateAfterStart = gm.waveManager.state;
  console.log('  start() 后波次状态:', stateAfterStart, '(期望 waiting)');
  if (stateAfterStart !== WaveState.Waiting) {
    throw new Error('Expected WaveManager to start in WaveState.Waiting.');
  }

  gm.forceStartNextWave();
  const stateAfterForce = gm.waveManager.state;
  console.log('  调用 forceStartNextWave() 后:', stateAfterForce, '(期望立即跳过倒计时进入 spawning)');
  if (stateAfterForce !== WaveState.Spawning) {
    throw new Error('forceStartNextWave() should transition WAITING -> SPAWNING immediately.');
  }

  gm.forceStartNextWave();
  const stateAfterSecondForce = gm.waveManager.state;
  console.log('  SPAWNING 期间再次调用，状态仍为:', stateAfterSecondForce, '(期望无操作，仍是 spawning)');
  if (stateAfterSecondForce !== WaveState.Spawning) {
    throw new Error('forceStartNextWave() should be a no-op while already SPAWNING.');
  }
}
{
  // No heroes at all - baseHp drains to 0 quickly, forcing GAME_OVER, so we
  // can confirm forceStartNextWave() is inert once the run has ended.
  const gm = new GameManager(sampleLevelConfig, {}, { maxBaseHp: 1 });
  gm.start();
  let ticks = 0;
  while (gm.gameState === GameState.Playing && ticks < 3000) {
    gm.update(0.1);
    ticks += 1;
  }
  console.log('  达成', gm.gameState, '后调用 forceStartNextWave()...');
  const waveStateBefore = gm.waveManager.state;
  gm.forceStartNextWave();
  const waveStateAfter = gm.waveManager.state;
  console.log('  波次状态未变:', waveStateAfter === waveStateBefore, `(${waveStateBefore} -> ${waveStateAfter})`);
  if (waveStateAfter !== waveStateBefore) {
    throw new Error('forceStartNextWave() should be a no-op once gameState has left Playing.');
  }
}
console.log('[PASS] forceStartNextWave 边界验证通过。\n');

// A single melee hero's DPS (~4.3/s from blade slash's 4s cooldown) can't
// out-damage a goblin (50hp) within the ~3.5s window one range circle
// spends overlapping the path - that's a real dwell-time/DPS limit, not a
// targeting bug. Four heroes clustered on adjacent cells below the path's
// first leg overlap their range circles enough to hit a passing goblin
// simultaneously, comfortably clearing 50hp inside that same window - a
// believable choke-point cluster, and what actually proves out "walks into
// range -> autofires -> dies" end to end.
function createChokePointHero(col: number, row: number) {
  const heroInstance = HeroFactory.createHero(swordsmanTemplate);
  heroInstance.skills.growthSkills[0].unlocked = true;
  return new BattleHero(heroInstance, [bladeSlashSkill, bloodFurySkill, bloodrageSlashSkill], gridCellCenter(col, row));
}

const heroes = [1, 2, 3, 4].map((col) => createChokePointHero(col, 3));

// sampleLevelConfig's wave 2 boss (2000hp) walks the path exactly once and
// never comes back for a second pass, so this cluster can only ever land
// one pass's worth of hits on it - nowhere near enough to kill it. It (and
// likely both orcs) will realistically escape rather than die. Victory
// only requires the field to end up empty with baseHp still positive, not
// every enemy killed (see GameManager.update's isLevelCleared/baseHp>0
// check) - a higher maxBaseHp than the default just keeps a few realistic
// escapes from flipping this into GameOver instead, without needing to
// hand-tune exact damage numbers to guarantee the boss dies.
const TEST_MAX_BASE_HP = 20;

const gameManager = new GameManager(sampleLevelConfig, {
  onWaveStart: (config, index) => {
    console.log(`\n=== 第 ${index + 1} 波开始: ${config.waveId} ===`);
  },
  onWaveComplete: (waveId, _index, nextDelaySeconds) => {
    console.log(
      nextDelaySeconds === null
        ? `--- 波次完成: ${waveId}（最后一波） ---`
        : `--- 波次完成: ${waveId}，${nextDelaySeconds} 秒后进入下一波 ---`,
    );
  },
  onDamageDealt: (event) => {
    const executeTag = event.wasExecuted ? '[处决]' : '';
    console.log(
      `英雄 ${event.source.instanceId} 释放技能 ${event.skillAction.skillId} ${executeTag}对 ${event.target.instanceId} ` +
        `造成 ${event.amount.toFixed(1)} 伤害 (剩余HP ${Math.max(0, event.target.currentHp).toFixed(1)}/${event.target.maxHp})`,
    );
  },
  onEnemyDefeated: (enemy, gold, exp) => {
    console.log(`敌人 ${enemy.instanceId} 死亡，掉落金币 +${gold}，经验 +${exp}`);
  },
  onEnemyReachedEnd: (enemy) => {
    console.log(`敌人 ${enemy.instanceId} 突破防线！大本营 HP -${enemy.baseDamage} (剩余 ${Math.max(0, gameManager.baseHp - enemy.baseDamage)})`);
  },
  onGameOver: () => {
    console.log('\n!!! GAME OVER：大本营已被攻陷 !!!');
  },
  onVictory: () => {
    console.log('\n*** VICTORY：所有波次已清空，大本营存活 ***');
  },
}, { maxBaseHp: TEST_MAX_BASE_HP });

for (const hero of heroes) {
  gameManager.addHero(hero);
}
gameManager.start();

const TICK_SECONDS = 0.1;
const TOTAL_TICKS = 1500;

// Demonstrates forceStartNextWave() in context: the moment wave 2 enters
// its WAITING countdown, skip straight to SPAWNING instead of waiting out
// the full delayBeforeStart.
let forcedWave2Start = false;

let tick = 0;
for (; tick < TOTAL_TICKS && gameManager.gameState === GameState.Playing; tick += 1) {
  if (!forcedWave2Start && gameManager.waveManager.currentIndex === 1 && gameManager.waveManager.state === WaveState.Waiting) {
    console.log('\n>>> forceStartNextWave(): 跳过第 2 波的等待倒计时 <<<');
    gameManager.forceStartNextWave();
    forcedWave2Start = true;
  }
  gameManager.update(TICK_SECONDS);
}

console.log(`\nforceStartNextWave() 是否被触发: ${forcedWave2Start}`);
if (!forcedWave2Start) {
  throw new Error('Expected forceStartNextWave() to have been exercised during the main simulation.');
}

console.log(`\n=== 模拟结束 (共 ${(tick * TICK_SECONDS).toFixed(1)} 秒, gameState=${gameManager.gameState}) ===`);
console.log(`最终金币: ${gameManager.gold}`);
console.log(`最终经验: ${gameManager.experience}`);
console.log(`最终大本营 HP: ${gameManager.baseHp}/${gameManager.maxBaseHp}`);
console.log(`最终波次进度: ${gameManager.waveManager.currentIndex + 1}/${gameManager.waveManager.totalWaveCount}`);
console.log(`isLevelCleared(): ${gameManager.waveManager.isLevelCleared()}`);

// Victory assertion - fails loudly (non-zero exit) if the level didn't
// actually clear within the simulated window, rather than silently
// reporting a passing-looking log.
if (gameManager.gameState !== GameState.Victory) {
  throw new Error(`Expected GameState.Victory after the simulation, got "${gameManager.gameState}" instead.`);
}
if (!gameManager.waveManager.isLevelCleared()) {
  throw new Error('Expected waveManager.isLevelCleared() to be true once GameState.Victory is reached.');
}
console.log('\n[PASS] 胜利断言通过：GameState.Victory 且 isLevelCleared() 均为真。');
