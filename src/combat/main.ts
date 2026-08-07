// Standalone browser entry point for the new combat/GameManager architecture
// (combat-test.html) - independent of the main React app in src/main.tsx,
// which doesn't wire this system in yet.

import { GameManager, GameState } from './GameManager';
import { heroCatalog } from './heroCatalog';
import type { WaveConfig } from './WaveManager';
import { GameRenderer } from '../render/GameRenderer';
import { InputManager } from '../input/InputManager';

/** Clamps deltaTime so a backgrounded/throttled tab doesn't feed a huge dt into GameManager.update on refocus. */
const MAX_DELTA_SECONDS = 0.1;
/** Enough to afford heroCatalog's cheapest entry (swordsman, 10) the moment the page loads - otherwise gold could never accrue, since it only comes from kills a hero has to already be placed to make happen. */
const STARTING_GOLD = 20;
const BASE_MAX_HP = 10;
const BUILD_MESSAGE_DURATION_MS = 2000;

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

let waveLabel = '-';

const gameManager = new GameManager(
  waveConfigs,
  {
    onWaveStart: (config, index) => {
      waveLabel = `第 ${index + 1} 波 (${config.waveId})`;
    },
    onWaveComplete: (waveId, delaySeconds) => {
      waveLabel = `${waveId} 已完成，${delaySeconds}s 后进入下一波`;
    },
    onEnemyReachedEnd: (enemy) => {
      if (gameManager.gameState !== GameState.GameOver) {
        showMessage(`${enemy.archetypeId} 突破了防线！大本营 HP -${enemy.baseDamage}`);
      }
    },
    onGameOver: () => {
      showMessage('游戏结束！大本营已被攻陷');
      inputManager.cancelBuildMode();
    },
  },
  { startingGold: STARTING_GOLD, maxBaseHp: BASE_MAX_HP },
);

gameManager.start();

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

const hudGold = document.getElementById('hud-gold') as HTMLSpanElement;
const hudExp = document.getElementById('hud-exp') as HTMLSpanElement;
const hudWave = document.getElementById('hud-wave') as HTMLSpanElement;
const hudMessage = document.getElementById('hud-message') as HTMLDivElement;
const buildPanel = document.getElementById('build-panel') as HTMLDivElement;

let messageTimeoutId: number | undefined;
function showMessage(text: string): void {
  hudMessage.textContent = text;
  window.clearTimeout(messageTimeoutId);
  messageTimeoutId = window.setTimeout(() => {
    hudMessage.textContent = '';
  }, BUILD_MESSAGE_DURATION_MS);
}

const inputManager = new InputManager(canvas, {
  onPlaceHero: (heroTypeId, cell) => {
    const result = gameManager.tryPlaceHero(heroTypeId, cell);
    if (result.success) {
      showMessage(`已放置：${heroCatalog[heroTypeId].displayName}`);
    } else if (result.reason === 'insufficient_gold') {
      showMessage('金币不足！');
    } else if (result.reason === 'cell_occupied') {
      showMessage('该格子已被占用！');
    } else if (result.reason === 'game_over') {
      showMessage('游戏已结束！');
    } else {
      showMessage('未知的英雄类型');
    }
    // Not refreshBuildPanel() here: InputManager still reports the just-used
    // heroTypeId as active until *after* this callback returns (it calls
    // cancelBuildMode() next), so reading build-mode state synchronously
    // inside this callback would show stale "still armed" button state.
    // The gameLoop's per-frame updateHud() picks up the real post-placement
    // state on the very next frame instead.
    return result.success;
  },
});

const renderer = new GameRenderer(canvas, gameManager, inputManager);

// Build-mode buttons are generated straight from heroCatalog, one per entry,
// plus a cancel button - so the UI can never drift out of sync with cost/
// name changes made in heroCatalog.ts.
const buildButtons = new Map<string, HTMLButtonElement>();

for (const entry of Object.values(heroCatalog)) {
  const button = document.createElement('button');
  button.textContent = `购买${entry.displayName} (${entry.cost}金币)`;
  button.addEventListener('click', () => {
    inputManager.enterBuildMode(entry.heroTypeId);
    refreshBuildPanel();
  });
  buildButtons.set(entry.heroTypeId, button);
  buildPanel.appendChild(button);
}

const cancelButton = document.createElement('button');
cancelButton.textContent = '取消建造';
cancelButton.addEventListener('click', () => {
  inputManager.cancelBuildMode();
  refreshBuildPanel();
});
buildPanel.appendChild(cancelButton);

function refreshBuildPanel(): void {
  const gameOver = gameManager.gameState === GameState.GameOver;
  for (const [heroTypeId, button] of buildButtons) {
    const entry = heroCatalog[heroTypeId];
    button.classList.toggle('active', inputManager.activeHeroTypeId === heroTypeId);
    button.disabled = gameOver || gameManager.gold < entry.cost;
  }
  cancelButton.disabled = gameOver;
}

function updateHud(): void {
  hudGold.textContent = String(gameManager.gold);
  hudExp.textContent = String(gameManager.experience);
  hudWave.textContent = waveLabel;
  // Self-healing rather than relying solely on the onGameOver callback's
  // one-shot cancelBuildMode() - if build mode somehow got re-armed after
  // game over (or the callback ordering ever changes), this closes it
  // again on the very next frame regardless.
  if (gameManager.gameState === GameState.GameOver) {
    inputManager.cancelBuildMode();
  }
  refreshBuildPanel();
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
