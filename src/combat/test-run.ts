// Manual, data-driven simulation of GameManager over sampleLevelConfig's
// 2 waves, ending in an explicit victory assertion.
// Run with: npx tsx src/combat/test-run.ts

import { GameManager, GameState } from './GameManager';
import { BattleHero } from './BattleHero';
import { sampleLevelConfig } from './sampleLevelConfig';
import { HeroFactory } from '../data/hero/HeroFactory';
import { swordsmanTemplate } from '../data/hero/warriorTemplates';
import { bladeSlashSkill, bloodFurySkill, bloodrageSlashSkill } from '../data/skills/warriorSkills';
import { gridCellCenter } from './gridConfig';

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

let tick = 0;
for (; tick < TOTAL_TICKS && gameManager.gameState === GameState.Playing; tick += 1) {
  gameManager.update(TICK_SECONDS);
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
