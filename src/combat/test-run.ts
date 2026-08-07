// Manual, data-driven simulation of GameManager over two hardcoded waves.
// Run with: npx tsx src/combat/test-run.ts

import { GameManager } from './GameManager';
import { BattleHero } from './BattleHero';
import type { WaveConfig } from './WaveManager';
import { HeroFactory } from '../data/hero/HeroFactory';
import { swordsmanTemplate } from '../data/hero/warriorTemplates';
import { bladeSlashSkill, bloodFurySkill, bloodrageSlashSkill } from '../data/skills/warriorSkills';

const waveConfigs: WaveConfig[] = [
  {
    waveId: 'wave-1-goblins',
    enemiesToSpawn: [{ enemyTypeId: 'goblin', count: 3 }],
    spawnInterval: 800,
  },
  {
    waveId: 'wave-2-boss',
    enemiesToSpawn: [{ enemyTypeId: 'boss_demon', count: 1 }],
    spawnInterval: 800,
  },
];

const heroInstance = HeroFactory.createHero(swordsmanTemplate);
// Unlock the growth skill so the hero has more than one skill to alternate between.
heroInstance.skills.growthSkills[0].unlocked = true;

const hero = new BattleHero(heroInstance, [bladeSlashSkill, bloodFurySkill, bloodrageSlashSkill]);

const gameManager = new GameManager(waveConfigs, {
  onWaveStart: (config, index) => {
    console.log(`\n=== 第 ${index + 1} 波开始: ${config.waveId} ===`);
  },
  onWaveComplete: (waveId, delay) => {
    console.log(`--- 波次完成: ${waveId}，${delay} 秒后进入下一波 ---`);
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
});

gameManager.addHero(hero);
gameManager.start();

const TICK_SECONDS = 0.1;
const TOTAL_TICKS = 1000;

for (let tick = 0; tick < TOTAL_TICKS; tick += 1) {
  gameManager.update(TICK_SECONDS);
}

console.log(`\n=== 模拟结束 (共 ${(TOTAL_TICKS * TICK_SECONDS).toFixed(1)} 秒) ===`);
console.log(`最终金币: ${gameManager.gold}`);
console.log(`最终经验: ${gameManager.experience}`);
