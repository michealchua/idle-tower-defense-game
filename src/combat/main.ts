// Standalone browser entry point for the new combat/GameManager architecture
// (combat-test.html) - independent of the main React app in src/main.tsx,
// which doesn't wire this system in yet.

import { GameManager, GameState } from './GameManager';
import { WaveState } from './WaveManager';
import { heroCatalog } from './heroCatalog';
import { heroEvolutions } from './heroEvolution';
import { sampleLevelConfig } from './sampleLevelConfig';
import { CELL_SIZE } from './gridConfig';
import { GameRenderer } from '../render/GameRenderer';
import { InputManager } from '../input/InputManager';
import { EquipmentSlot, type EquipmentItem, type StatModifierValue, type StatModifiers } from './Equipment';

const SLOT_LABELS: Record<EquipmentSlot, string> = {
  [EquipmentSlot.Weapon]: '武器',
  [EquipmentSlot.Armor]: '护甲',
  [EquipmentSlot.Boots]: '靴子',
  [EquipmentSlot.Accessory]: '饰品',
};

const STAT_LABELS: Record<keyof StatModifiers, string> = {
  maxHp: '生命',
  attack: '攻击',
  defense: '防御',
  attackSpeed: '攻速',
  crit: '暴击',
};

/** "生命+100, 攻击+12, 攻击+5%" style summary of one item's modifiers - flat and percent bonuses for the same stat both get their own segment rather than being merged into one string. */
function formatModifiers(modifiers: StatModifiers): string {
  const parts: string[] = [];
  (Object.keys(modifiers) as (keyof StatModifiers)[]).forEach((key) => {
    const modifier: StatModifierValue | undefined = modifiers[key];
    if (!modifier) {
      return;
    }
    const label = STAT_LABELS[key];
    if (modifier.flat) {
      const displayValue = key === 'crit' || key === 'attackSpeed' ? modifier.flat.toFixed(2) : modifier.flat.toFixed(0);
      parts.push(`${label}+${displayValue}`);
    }
    if (modifier.percent) {
      parts.push(`${label}+${(modifier.percent * 100).toFixed(0)}%`);
    }
  });
  return parts.join(', ');
}

/** Clamps deltaTime so a backgrounded/throttled tab doesn't feed a huge dt into GameManager.update on refocus. */
const MAX_DELTA_SECONDS = 0.1;
/** Enough to afford heroCatalog's cheapest entry (swordsman, 50) the moment the page loads - otherwise gold could never accrue, since it only comes from kills a hero has to already be placed to make happen. */
const STARTING_GOLD = 100;
const BASE_MAX_HP = 10;
const BUILD_MESSAGE_DURATION_MS = 2000;

const gameManager = new GameManager(
  sampleLevelConfig,
  {
    onWaveStart: (config, index) => {
      showMessage(`第 ${index + 1} 波开始: ${config.waveId}`);
    },
    onWaveComplete: (waveId, _index, nextDelaySeconds) => {
      showMessage(nextDelaySeconds === null ? `${waveId} 已完成` : `${waveId} 已完成，${nextDelaySeconds}s 后进入下一波`);
    },
    onEnemyReachedEnd: (enemy) => {
      if (gameManager.gameState === GameState.Playing) {
        showMessage(`${enemy.archetypeId} 突破了防线！大本营 HP -${enemy.baseDamage}`);
      }
    },
    onGameOver: () => {
      showMessage('游戏结束！大本营已被攻陷');
      inputManager.cancelBuildMode();
    },
    onVictory: () => {
      showMessage('胜利！所有波次已清空');
      inputManager.cancelBuildMode();
    },
    onForceStartBonus: (amount) => {
      showMessage(`快速开局奖励 +${amount} 金币！`);
    },
    onLootDropped: (item) => {
      showMessage(`战利品掉落：${item.name}（${item.rarity}）`);
      refreshInventoryPanel();
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
const heroPanel = document.getElementById('hero-panel') as HTMLDivElement;
const inventoryItemsContainer = document.getElementById('inventory-items') as HTMLDivElement;

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
  onCanvasClick: (worldX, worldY) => {
    // Hit-test against every placed hero's real x/y - CELL_SIZE/2 is a
    // generous-enough radius for "did the player mean to click this hero"
    // without needing GameRenderer's exact sprite size exported just for
    // this. A click that doesn't land on anyone clears the selection.
    const hitRadius = CELL_SIZE / 2;
    const hero = gameManager.combatEngine
      .getHeroes()
      .find((candidate) => Math.hypot(candidate.x - worldX, candidate.y - worldY) <= hitRadius);
    inputManager.setSelectedHero(hero?.instanceId ?? null);
    refreshHeroPanel();
    refreshInventoryPanel();
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

// Test button for the hardcore-mechanic seam (WaveManager.forceStartNextWave)
// - only meaningful while WAITING for the next wave's delayBeforeStart to
// elapse, so it's disabled the rest of the time rather than being a no-op
// click.
const forceStartButton = document.createElement('button');
forceStartButton.textContent = '⚡ 提前开始下一波';
forceStartButton.addEventListener('click', () => {
  gameManager.forceStartNextWave();
  refreshBuildPanel();
});
buildPanel.appendChild(forceStartButton);

function refreshBuildPanel(): void {
  const runOver = gameManager.gameState !== GameState.Playing;
  for (const [heroTypeId, button] of buildButtons) {
    const entry = heroCatalog[heroTypeId];
    button.classList.toggle('active', inputManager.activeHeroTypeId === heroTypeId);
    button.disabled = runOver || gameManager.gold < entry.cost;
  }
  cancelButton.disabled = runOver;
  forceStartButton.disabled = runOver || gameManager.waveManager.state !== WaveState.Waiting;
}

/**
 * Rebuilds #hero-panel's content from scratch every call (cheap - at most
 * a level line, 4 stat lines, an upgrade button, and up to 2 evolution
 * buttons) rather than diffing, so it never drifts out of sync with
 * whatever's actually selected. Hides the panel entirely once nothing's
 * selected or the selected hero's gone (can't currently happen - heroes
 * never die in this engine - but kept as a safety net rather than assumed).
 */
function refreshHeroPanel(): void {
  const selectedId = inputManager.selectedHeroInstanceId;
  if (!selectedId) {
    heroPanel.style.display = 'none';
    heroPanel.innerHTML = '';
    return;
  }

  const hero = gameManager.combatEngine.getHero(selectedId);
  if (!hero) {
    inputManager.setSelectedHero(null);
    heroPanel.style.display = 'none';
    heroPanel.innerHTML = '';
    return;
  }

  const runOver = gameManager.gameState !== GameState.Playing;
  const displayName = hero.evolvedInto ? (heroEvolutions[hero.heroTypeId]?.options.find((o) => o.id === hero.evolvedInto)?.displayName ?? hero.evolvedInto) : (heroCatalog[hero.heroTypeId]?.displayName ?? hero.heroTypeId);
  const upgradeCost = hero.getUpgradeCost();

  heroPanel.style.display = 'block';
  heroPanel.innerHTML = `
    <div class="hero-panel-title">${displayName} · Lv.${hero.level}</div>
    <div class="hero-panel-stats">
      攻击力: ${hero.stats.currentAttack.toFixed(1)}<br>
      攻速: ${hero.stats.currentAttackSpeed.toFixed(2)}<br>
      防御: ${hero.stats.currentDefense.toFixed(1)}<br>
      暴击: ${(hero.stats.currentCrit * 100).toFixed(1)}%<br>
      生命: ${hero.stats.currentHp.toFixed(0)} / ${hero.stats.maxHp.toFixed(0)}
    </div>
  `;

  // 4 equipment slots (Weapon/Armor/Boots/Accessory) - reads straight off
  // hero.getAllEquipment() every refresh, so it can never drift out of
  // sync with what's actually equipped. Each filled slot gets its own
  // "卸下" (unequip) button; equipping itself happens from the inventory
  // panel's own "装备" buttons (see refreshInventoryPanel), not from here.
  const equipmentSlotsContainer = document.createElement('div');
  equipmentSlotsContainer.className = 'equipment-slots';
  const equippedItems = hero.getAllEquipment();
  for (const slot of Object.values(EquipmentSlot)) {
    const item = equippedItems[slot];
    const slotDiv = document.createElement('div');
    slotDiv.className = item ? 'equipment-slot filled' : 'equipment-slot';
    slotDiv.innerHTML = `<div class="slot-name">${SLOT_LABELS[slot]}</div>${item ? item.name : '（空）'}`;

    if (item) {
      const unequipButton = document.createElement('button');
      unequipButton.textContent = '卸下';
      unequipButton.disabled = runOver;
      unequipButton.addEventListener('click', () => {
        gameManager.tryUnequipItem(hero.instanceId, slot);
        refreshHeroPanel();
        refreshInventoryPanel();
      });
      slotDiv.appendChild(unequipButton);
    }

    equipmentSlotsContainer.appendChild(slotDiv);
  }
  heroPanel.appendChild(equipmentSlotsContainer);

  const upgradeButton = document.createElement('button');
  upgradeButton.textContent = `升级 (${upgradeCost}金币)`;
  upgradeButton.disabled = runOver || gameManager.gold < upgradeCost;
  upgradeButton.addEventListener('click', () => {
    const result = gameManager.tryUpgradeHero(hero.instanceId);
    showMessage(result.success ? `升级成功！当前 Lv.${hero.level}` : '升级失败：金币不足');
    refreshHeroPanel();
  });
  heroPanel.appendChild(upgradeButton);

  const evolutionConfig = heroEvolutions[hero.heroTypeId];
  if (evolutionConfig && !hero.evolvedInto) {
    if (hero.level >= evolutionConfig.requiredLevel) {
      for (const option of evolutionConfig.options) {
        const evolveButton = document.createElement('button');
        evolveButton.textContent = `进化为 ${option.displayName} (${option.cost}金币)`;
        evolveButton.disabled = runOver || gameManager.gold < option.cost;
        evolveButton.addEventListener('click', () => {
          const result = gameManager.tryEvolveHero(hero.instanceId, option.id);
          showMessage(result.success ? `进化成功：${option.displayName}！` : '进化失败：金币不足');
          refreshHeroPanel();
        });
        heroPanel.appendChild(evolveButton);
      }
    } else {
      const hint = document.createElement('div');
      hint.textContent = `Lv.${evolutionConfig.requiredLevel} 解锁进化`;
      hint.style.marginTop = '6px';
      hint.style.opacity = '0.7';
      heroPanel.appendChild(hint);
    }
  }
}

/**
 * Rebuilds #inventory-items from gameManager.inventory.getItems() every
 * call, same "cheap enough to fully rebuild, never diffed" approach
 * refreshHeroPanel/refreshBuildPanel already use. Each item gets one
 * "装备" button; it's only enabled while a hero is actually selected
 * (equipping needs a target), and clicking it calls tryEquipItem then
 * refreshes both this panel and the hero panel so the swap shows up
 * immediately in both places.
 */
function refreshInventoryPanel(): void {
  inventoryItemsContainer.innerHTML = '';

  const selectedHeroId = inputManager.selectedHeroInstanceId;
  const runOver = gameManager.gameState !== GameState.Playing;
  const items = gameManager.inventory.getItems();

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = '（背包是空的）';
    empty.style.opacity = '0.6';
    inventoryItemsContainer.appendChild(empty);
    return;
  }

  for (const item of items) {
    inventoryItemsContainer.appendChild(buildInventoryItemCard(item, selectedHeroId, runOver));
  }
}

function buildInventoryItemCard(item: EquipmentItem, selectedHeroId: string | null, runOver: boolean): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'inventory-item';
  card.innerHTML = `
    <div class="item-name rarity-${item.rarity}">${item.name}</div>
    <div class="item-meta">${SLOT_LABELS[item.slot]} · ${item.rarity}</div>
    <div class="item-meta">${formatModifiers(item.modifiers)}</div>
  `;

  const equipButton = document.createElement('button');
  equipButton.textContent = selectedHeroId ? '装备到已选英雄' : '请先选择英雄';
  equipButton.disabled = runOver || !selectedHeroId;
  equipButton.addEventListener('click', () => {
    if (!selectedHeroId) {
      return;
    }
    const result = gameManager.tryEquipItem(selectedHeroId, item.instanceId);
    showMessage(result.success ? `已装备：${item.name}` : '装备失败');
    refreshHeroPanel();
    refreshInventoryPanel();
  });
  card.appendChild(equipButton);

  return card;
}

function updateHud(): void {
  hudGold.textContent = String(gameManager.gold);
  hudExp.textContent = String(gameManager.experience);

  const { currentIndex, totalWaveCount } = gameManager.waveManager;
  hudWave.textContent = currentIndex >= 0 ? `Wave ${currentIndex + 1} / ${totalWaveCount}` : '-';

  // Self-healing rather than relying solely on the onGameOver/onVictory
  // callbacks' one-shot cancelBuildMode() - if build mode somehow got
  // re-armed after the run ended (or the callback ordering ever changes),
  // this closes it again on the very next frame regardless.
  if (gameManager.gameState !== GameState.Playing) {
    inputManager.cancelBuildMode();
  }
  refreshBuildPanel();
  refreshHeroPanel();
  refreshInventoryPanel();
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
