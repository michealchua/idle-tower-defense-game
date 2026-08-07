// Standalone browser entry point for the new combat/GameManager architecture
// (combat-test.html) - independent of the main React app in src/main.tsx,
// which doesn't wire this system in yet.

import { GameManager } from './GameManager';
import { BattleHero } from './BattleHero';
import type { WaveConfig } from './WaveManager';
import { GameRenderer } from '../render/GameRenderer';
import { HeroFactory } from '../data/hero/HeroFactory';
import { swordsmanTemplate } from '../data/hero/warriorTemplates';
import { bladeSlashSkill, bloodFurySkill, bloodrageSlashSkill } from '../data/skills/warriorSkills';

/** Clamps deltaTime so a backgrounded/throttled tab doesn't feed a huge dt into GameManager.update on refocus. */
const MAX_DELTA_SECONDS = 0.1;

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
heroInstance.skills.growthSkills[0].unlocked = true;
const hero = new BattleHero(heroInstance, [bladeSlashSkill, bloodFurySkill, bloodrageSlashSkill]);

let waveLabel = '-';

const gameManager = new GameManager(waveConfigs, {
  onWaveStart: (config, index) => {
    waveLabel = `第 ${index + 1} 波 (${config.waveId})`;
  },
  onWaveComplete: (waveId, delaySeconds) => {
    waveLabel = `${waveId} 已完成，${delaySeconds}s 后进入下一波`;
  },
});

gameManager.addHero(hero);
gameManager.start();

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new GameRenderer(canvas, gameManager);

const hudGold = document.getElementById('hud-gold') as HTMLSpanElement;
const hudExp = document.getElementById('hud-exp') as HTMLSpanElement;
const hudWave = document.getElementById('hud-wave') as HTMLSpanElement;

function updateHud(): void {
  hudGold.textContent = String(gameManager.gold);
  hudExp.textContent = String(gameManager.experience);
  hudWave.textContent = waveLabel;
}

let lastTimestamp: number | null = null;

function gameLoop(timestamp: number): void {
  if (lastTimestamp === null) {
    lastTimestamp = timestamp;
  }

  const rawDeltaSeconds = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;
  const deltaSeconds = Math.min(rawDeltaSeconds, MAX_DELTA_SECONDS);

  gameManager.update(deltaSeconds);
  renderer.render();
  updateHud();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
