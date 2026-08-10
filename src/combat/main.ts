// Step 32's V1.0 entry point - boots the full src/combat/* engine
// (combat-test.html's <script> tag points here). This is the shipped game:
// the older React app under src/main.tsx/src/store is a separate, unrelated
// system this module never touches.

import { GameManager, GameState } from './GameManager';
import { WaveState } from './WaveManager';
import { heroCatalog } from './heroCatalog';
import { heroEvolutions } from './heroEvolution';
import { sampleLevelConfig } from './sampleLevelConfig';
import { CELL_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT } from './gridConfig';
import { GameRenderer } from '../render/GameRenderer';
import { InputManager } from '../input/InputManager';
import {
  EquipmentSlot,
  RARITY_MAX_LEVEL,
  applyEnhancementExp,
  equipmentLevelMultiplier,
  expThresholdForLevel,
  type EquipmentItem,
  type StatModifierValue,
  type StatModifiers,
} from './Equipment';
import { talentManager } from './TalentManager';
import { addMemoryFragments, getMemoryFragments } from './MetaProgression';
import { load as loadSave, getLastSaveTime, getHighestStageCleared, recordSaveNow } from './SaveManager';
import { OfflineManager, type OfflineRewards } from './OfflineManager';
import { ParticleManager, ParticleType, type ParticleArrivedEvent } from './ParticleManager';
import { PrestigeManager, SPARK_BONUS_PER_POINT } from './PrestigeManager';
import { formatNumber } from './utils';
import { TutorialManager, TutorialStepId, type TutorialTargetKey } from './TutorialManager';

// Step 24: "在游戏初始化时，最优先调用 SaveManager.load()" - the very first
// thing this module does, before GameManager is even constructed, so every
// later read of talent levels/Memory Fragments/highestStageCleared already
// reflects whatever was actually persisted rather than briefly reading
// SaveManager's in-memory defaults.
loadSave();

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

/** Same style as formatModifiers, but every flat/percent number is first scaled by equipmentLevelMultiplier(level) - what the enhancement modal's "强化后属性" preview uses to show what an item's bonuses will actually be at a hypothetical post-enhancement level, not just its unscaled base numbers. */
function formatModifiersScaled(modifiers: StatModifiers, level: number): string {
  const multiplier = equipmentLevelMultiplier(level);
  const parts: string[] = [];
  (Object.keys(modifiers) as (keyof StatModifiers)[]).forEach((key) => {
    const modifier: StatModifierValue | undefined = modifiers[key];
    if (!modifier) {
      return;
    }
    const label = STAT_LABELS[key];
    if (modifier.flat) {
      const scaled = modifier.flat * multiplier;
      const displayValue = key === 'crit' || key === 'attackSpeed' ? scaled.toFixed(2) : scaled.toFixed(0);
      parts.push(`${label}+${displayValue}`);
    }
    if (modifier.percent) {
      parts.push(`${label}+${(modifier.percent * multiplier * 100).toFixed(0)}%`);
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
/** Where a loot burst (step 26) originates from - dead center of the game canvas, matching the spec's "在屏幕中心生成对应数量的粒子". */
const CANVAS_CENTER_X = CANVAS_WIDTH / 2;
const CANVAS_CENTER_Y = CANVAS_HEIGHT / 2;

// Step 30's onboarding state machine - constructed ahead of gameManager
// since the constructor's own onGameOver/onLootDropped callbacks below
// already need to notify it.
const tutorialManager = new TutorialManager();

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
      // Step 30: "玩家首次在第 20 波以后团灭" - currentIndex is still
      // whatever wave was in progress the instant baseHp hit 0 (WaveManager
      // never advances past a wave that hasn't cleared), so +1 is the
      // 1-based "which wave did I just get wiped on" the spec means.
      tutorialManager.notifyGameOver(gameManager.waveManager.currentIndex + 1);
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
      // Step 30: "第一次掉落装备时" - event-driven (not a per-frame poll
      // like the place-hero/upgrade-hero triggers), since there's no
      // standing gameplay condition to keep checking, just a one-off event.
      tutorialManager.notifyLootDropped();
    },
    onMemoryFragmentsGained: (amount, total) => {
      showMessage(`获得记忆碎片 +${amount}（共 ${total}）`);
    },
  },
  { startingGold: STARTING_GOLD, maxBaseHp: BASE_MAX_HP },
);

// Step 25: run start is gated on the Welcome Back panel (see
// showWelcomeBackIfNeeded below, called once the rest of this module has
// finished wiring up canvas/DOM) rather than fired immediately here - a
// player with real offline rewards waiting should see and claim them
// before the first wave's countdown starts eating into their prep time.
// `hasStarted` guards against a stray double-call (there's only one call
// site today, but this keeps beginRun() itself safe to call more than
// once if that ever changes).
let hasStarted = false;
function beginRun(): void {
  if (hasStarted) {
    return;
  }
  hasStarted = true;
  gameManager.start();
}

// Browsers block audio.play() before any user gesture on the page -
// gameManager.audioManager already has a track queued from its constructor/
// first onWaveStart, this just retries it once real input happens. `once`
// so it never re-attaches after firing.
window.addEventListener('pointerdown', () => gameManager.audioManager.unlock(), { once: true });

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

const hudGold = document.getElementById('hud-gold') as HTMLSpanElement;
const hudExp = document.getElementById('hud-exp') as HTMLSpanElement;
const hudWave = document.getElementById('hud-wave') as HTMLSpanElement;
const hudTheme = document.getElementById('hud-theme') as HTMLSpanElement;
const hudHazard = document.getElementById('hud-hazard') as HTMLDivElement;
const hudFragments = document.getElementById('hud-fragments') as HTMLSpanElement;
const hudMessage = document.getElementById('hud-message') as HTMLDivElement;
const buildPanel = document.getElementById('build-panel') as HTMLDivElement;
const heroPanel = document.getElementById('hero-panel') as HTMLDivElement;
const inventoryItemsContainer = document.getElementById('inventory-items') as HTMLDivElement;
const talentsButton = document.getElementById('talents-button') as HTMLButtonElement;
const talentsOverlay = document.getElementById('talents-overlay') as HTMLDivElement;
const talentsPanel = document.getElementById('talents-panel') as HTMLDivElement;
const talentConfirmOverlay = document.getElementById('talent-confirm-overlay') as HTMLDivElement;
const talentConfirmDialog = document.getElementById('talent-confirm-dialog') as HTMLDivElement;
const enhanceModalOverlay = document.getElementById('enhance-modal-overlay') as HTMLDivElement;
const enhanceModal = document.getElementById('enhance-modal') as HTMLDivElement;
const welcomeBackOverlay = document.getElementById('welcome-back-overlay') as HTMLDivElement;
const welcomeBackPanel = document.getElementById('welcome-back-panel') as HTMLDivElement;
const backpackAnchor = document.getElementById('hud-backpack-anchor') as HTMLDivElement;
const hudSparks = document.getElementById('hud-sparks') as HTMLSpanElement;
const ascensionButton = document.getElementById('ascension-button') as HTMLButtonElement;
const ascensionConfirmOverlay = document.getElementById('ascension-confirm-overlay') as HTMLDivElement;
const ascensionConfirmDialog = document.getElementById('ascension-confirm-dialog') as HTMLDivElement;
const pauseButton = document.getElementById('pause-button') as HTMLButtonElement;
const settingsButton = document.getElementById('settings-button') as HTMLButtonElement;
const settingsOverlay = document.getElementById('settings-overlay') as HTMLDivElement;
const settingsPanel = document.getElementById('settings-panel') as HTMLDivElement;
const tutorialLayer = document.getElementById('tutorial-layer') as HTMLDivElement;

let messageTimeoutId: number | undefined;
function showMessage(text: string): void {
  hudMessage.textContent = text;
  window.clearTimeout(messageTimeoutId);
  messageTimeoutId = window.setTimeout(() => {
    hudMessage.textContent = '';
  }, BUILD_MESSAGE_DURATION_MS);
}

/** Restarts `.hud-bump`'s pulse animation (step 26's "让对应的 HUD 数值...跳动增加") - removing then re-adding the class (with a forced reflow in between, via reading offsetWidth) is what lets this retrigger even if particles of the same type land in quick succession, rather than the second bump silently no-oping because the class was already present. */
function bumpHudElement(element: HTMLElement): void {
  element.classList.remove('hud-bump');
  void element.offsetWidth;
  element.classList.add('hud-bump');
}

/** Canvas-local (not viewport) center point of `element` - both rects come from getBoundingClientRect() in the same viewport space, so subtracting the canvas's own origin converts straight into the coordinate space GameRenderer/ParticleManager already draw/simulate in (this canvas has no devicePixelRatio/letterbox scaling - see combat-test.html's fixed 960x540 width/height attributes matching its CSS size exactly). */
function canvasLocalCenter(element: HTMLElement): { x: number; y: number } {
  const canvasRect = canvas.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  return {
    x: elementRect.left + elementRect.width / 2 - canvasRect.left,
    y: elementRect.top + elementRect.height / 2 - canvasRect.top,
  };
}

const inputManager = new InputManager(canvas, {
  onPlaceHero: (heroTypeId, cell) => {
    const result = gameManager.tryPlaceHero(heroTypeId, cell);
    if (result.success) {
      showMessage(`已放置：${heroCatalog[heroTypeId].displayName}`);
      // Step 30: the real "place a hero" action this step's spotlight was
      // waiting on - only actually completes the step if it's the one
      // currently active, so a placement that happens to occur while some
      // other step is showing (e.g. re-placing after a wipe) doesn't
      // wrongly consume PlaceFirstHero's flag.
      if (tutorialManager.activeStep?.id === TutorialStepId.PlaceFirstHero) {
        tutorialManager.completeActiveStep();
        gameManager.isPaused = false;
      }
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

// Step 26's loot-burst particle system - constructed here (not inside
// GameRenderer) since main.ts is also what needs to mutate real game state
// (gold/fragments/inventory) and play chimes once a particle arrives; see
// particleManager.setOnArrived below.
const particleManager = new ParticleManager();
const renderer = new GameRenderer(canvas, gameManager, inputManager, particleManager);

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

      const enhanceButton = document.createElement('button');
      enhanceButton.textContent = '强化';
      enhanceButton.disabled = runOver || item.level >= RARITY_MAX_LEVEL[item.rarity];
      enhanceButton.addEventListener('click', () => openEnhanceModal(item));
      slotDiv.appendChild(enhanceButton);
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
    if (result.success && tutorialManager.activeStep?.id === TutorialStepId.UpgradeHero) {
      tutorialManager.completeActiveStep();
      gameManager.isPaused = false;
    }
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
  const maxLevel = RARITY_MAX_LEVEL[item.rarity];
  card.innerHTML = `
    <div class="item-name rarity-${item.rarity}">${item.name} · Lv.${item.level}/${maxLevel}</div>
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
    if (result.success && tutorialManager.activeStep?.id === TutorialStepId.EquipItem) {
      tutorialManager.completeActiveStep();
      gameManager.isPaused = false;
    }
    refreshHeroPanel();
    refreshInventoryPanel();
  });
  card.appendChild(equipButton);

  const enhanceButton = document.createElement('button');
  enhanceButton.textContent = '强化';
  enhanceButton.disabled = runOver || item.level >= maxLevel;
  enhanceButton.addEventListener('click', () => openEnhanceModal(item));
  card.appendChild(enhanceButton);

  return card;
}

/**
 * Simple, single-purpose "强化模式" modal (step 20): opened against one
 * `target` item (either sitting in the bag or currently equipped - either
 * works, since GameManager.tryEnhanceEquipment resolves the target from
 * wherever it actually is), lets the player multi-select any number of
 * *other* unequipped bag items as fodder, live-previews the exp/level-up
 * that selection would produce, and on confirm actually spends it via
 * gameManager.tryEnhanceEquipment.
 *
 * The preview is computed by cloning `target` (structuredClone, so the
 * real item is never touched) and running it through the exact same
 * applyEnhancementExp the real confirm click uses - what you see in the
 * preview is guaranteed to be what you'd actually get, not a
 * hand-rolled approximation of the formula that could drift from it.
 */
function openEnhanceModal(target: EquipmentItem): void {
  const selectedFoodIds = new Set<string>();

  function render(): void {
    const maxLevel = RARITY_MAX_LEVEL[target.rarity];
    // Bag items only (fodder can't itself be equipped elsewhere), and
    // never the target itself even if it happens to also be sitting in
    // the bag (defensive - GameManager already rejects that combination).
    const candidateFood = gameManager.inventory.getItems().filter((item) => item.instanceId !== target.instanceId);

    const totalExp = [...selectedFoodIds].reduce((sum, id) => {
      const food = candidateFood.find((item) => item.instanceId === id);
      return sum + (food?.baseExpValue ?? 0);
    }, 0);

    const preview = structuredClone(target);
    const levelsGained = totalExp > 0 ? applyEnhancementExp(preview, totalExp) : 0;

    enhanceModal.innerHTML = `
      <div class="enhance-title">强化装备</div>
      <div class="enhance-target">
        <div class="rarity-${target.rarity}">${target.name} · Lv.${target.level}/${maxLevel}</div>
        <div>当前经验: ${target.currentExp} / ${target.level < maxLevel ? expThresholdForLevel(target.level) : '已满级'}</div>
        <div>${formatModifiersScaled(target.modifiers, target.level)}</div>
      </div>
      <div>选择要消耗的狗粮（其他未装备道具）：</div>
    `;

    const foodList = document.createElement('div');
    foodList.className = 'enhance-food-list';
    if (candidateFood.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = '（背包中没有其他可用的道具）';
      empty.style.opacity = '0.6';
      foodList.appendChild(empty);
    }
    for (const food of candidateFood) {
      const row = document.createElement('label');
      row.className = 'enhance-food-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedFoodIds.has(food.instanceId);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          selectedFoodIds.add(food.instanceId);
        } else {
          selectedFoodIds.delete(food.instanceId);
        }
        render();
      });

      const label = document.createElement('span');
      label.className = `rarity-${food.rarity}`;
      label.textContent = `${food.name} (Lv.${food.level}, 经验值 ${food.baseExpValue})`;

      row.appendChild(checkbox);
      row.appendChild(label);
      foodList.appendChild(row);
    }
    enhanceModal.appendChild(foodList);

    const previewDiv = document.createElement('div');
    previewDiv.className = 'enhance-preview';
    previewDiv.innerHTML =
      target.level >= maxLevel
        ? '该装备已达到最高等级，无法继续强化。'
        : `预计可获得经验: ${totalExp}<br>` +
          `预计等级: Lv.${target.level} → Lv.${preview.level}${levelsGained > 0 ? `（+${levelsGained}）` : ''}<br>` +
          `预计强化后属性: ${formatModifiersScaled(preview.modifiers, preview.level)}`;
    enhanceModal.appendChild(previewDiv);

    const actions = document.createElement('div');
    actions.className = 'enhance-actions';

    const cancelButton = document.createElement('button');
    cancelButton.textContent = '取消';
    cancelButton.addEventListener('click', closeEnhanceModal);

    const confirmButton = document.createElement('button');
    confirmButton.className = 'confirm';
    confirmButton.textContent = '确认强化';
    confirmButton.disabled = target.level >= maxLevel || selectedFoodIds.size === 0 || gameManager.gameState !== GameState.Playing;
    confirmButton.addEventListener('click', () => {
      const result = gameManager.tryEnhanceEquipment(target.instanceId, [...selectedFoodIds]);
      showMessage(result.success ? `强化成功：${target.name} 提升至 Lv.${target.level}` : '强化失败');
      closeEnhanceModal();
      refreshHeroPanel();
      refreshInventoryPanel();
    });

    actions.appendChild(cancelButton);
    actions.appendChild(confirmButton);
    enhanceModal.appendChild(actions);
  }

  render();
  pushPauseForOverlay();
  enhanceModalOverlay.classList.add('open');
}

function closeEnhanceModal(): void {
  enhanceModalOverlay.classList.remove('open');
  enhanceModal.innerHTML = '';
  popPauseForOverlay();
}

enhanceModalOverlay.addEventListener('click', (event) => {
  if (event.target === enhanceModalOverlay) {
    closeEnhanceModal();
  }
});

function updateHud(): void {
  hudGold.textContent = formatNumber(gameManager.gold);
  hudExp.textContent = formatNumber(gameManager.experience);

  const { currentIndex, totalWaveCount } = gameManager.waveManager;
  hudWave.textContent = currentIndex >= 0 ? `Wave ${currentIndex + 1} / ${totalWaveCount}` : '-';
  hudTheme.textContent = gameManager.themeManager.currentTheme.displayName;
  hudHazard.textContent = gameManager.themeManager.currentTheme.hazardText;
  hudFragments.textContent = formatNumber(gameManager.memoryFragments);
  hudSparks.textContent = formatNumber(PrestigeManager.getEternitySparks());
  updatePauseButtonLabel();
  pauseButton.disabled = gameManager.gameState !== GameState.Playing;
  // Step 27: only re-evaluates eligibility (highestStageCleared changes at
  // most once per wave clear, via SaveManager.recordStageCleared) rather
  // than assuming a fixed disabled/enabled state for the whole session -
  // the button flips live from disabled to enabled the instant a run
  // crosses PRESTIGE_UNLOCK_STAGE, without needing a page reload.
  ascensionButton.disabled = !PrestigeManager.canPrestige(getHighestStageCleared());

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
  // Live-refreshes button enabled/disabled state (fragment balance can
  // change mid-run from an elite/boss kill) whenever the panel's actually
  // open - skipped while closed so this isn't rebuilding hidden DOM every
  // frame for nothing.
  if (talentsOverlay.classList.contains('open')) {
    refreshTalentsPanel();
  }

  // Step 30: evaluated every frame (cheap boolean checks, same convention
  // every other per-frame refresh* call above already follows), then the
  // overlay itself is rebuilt to match whatever's active right now.
  evaluateTutorialTriggers();
  if (tutorialManager.isActive) {
    // Forced every frame, not just on activation - keeps the run frozen
    // even if something else (a stray settings-panel close, etc.) would
    // otherwise have cleared isPaused this same tick.
    gameManager.isPaused = true;
  }
  renderTutorialOverlay();
}

/** Step 30: per-frame poll for the two "standing condition" tutorial triggers - the other two (loot drop, game over) are event-driven and notified straight from GameManager's own callbacks above instead. Both check* calls are no-ops once TutorialManager already has a step active or that step's flag is already set, so calling this unconditionally every frame is cheap and safe. */
function evaluateTutorialTriggers(): void {
  const heroes = gameManager.combatEngine.getHeroes();
  tutorialManager.checkPlaceFirstHeroTrigger(gameManager.waveManager.currentIndex, heroes.length);
  if (heroes.length > 0) {
    const cheapestUpgradeCost = Math.min(...heroes.map((hero) => hero.getUpgradeCost()));
    tutorialManager.checkUpgradeHeroTrigger(gameManager.gold, cheapestUpgradeCost);
  }
}

/**
 * Resolves a tutorial step's symbolic TutorialTargetKey list into actual
 * on-screen rects, in viewport (client) coordinates - the same space
 * getBoundingClientRect() and the tutorial-hole/tutorial-blocker CSS below
 * both work in. 'placed-hero' is the one target with no backing DOM element
 * of its own: its "rect" is computed from the first placed hero's world x/y
 * (BattleHero.x/y are canvas-local pixel coordinates) mapped through the
 * canvas's own client rect and CSS scale factor, same math InputManager.
 * toWorldPosition already uses in reverse. Its returned `element` is the
 * canvas itself (there's nothing else to bump z-index on) - clicking
 * anywhere on the canvas during this step is a looser gate than "only the
 * hero", but InputManager's own hit-testing already only resolves an actual
 * hero-upgrade action from a click that lands on one.
 */
function resolveTutorialTargets(targets: TutorialTargetKey[]): { element: HTMLElement; rect: DOMRect }[] {
  const resolved: { element: HTMLElement; rect: DOMRect }[] = [];

  for (const target of targets) {
    if (target === 'build-panel') {
      resolved.push({ element: buildPanel, rect: buildPanel.getBoundingClientRect() });
    } else if (target === 'inventory-panel') {
      const panel = document.getElementById('inventory-panel') as HTMLDivElement;
      resolved.push({ element: panel, rect: panel.getBoundingClientRect() });
    } else if (target === 'hero-equipment-panel') {
      // Only spotlighted once a hero's actually selected (heroPanel is
      // display:none otherwise) - the equip step's message still makes
      // sense with just the inventory-panel hole showing until the player
      // selects one.
      if (heroPanel.style.display !== 'none') {
        resolved.push({ element: heroPanel, rect: heroPanel.getBoundingClientRect() });
      }
    } else if (target === 'ascension-button') {
      resolved.push({ element: ascensionButton, rect: ascensionButton.getBoundingClientRect() });
    } else if (target === 'placed-hero') {
      const hero = gameManager.combatEngine.getHeroes()[0];
      if (hero) {
        const canvasRect = canvas.getBoundingClientRect();
        const scaleX = canvasRect.width / canvas.width;
        const scaleY = canvasRect.height / canvas.height;
        const heroSize = CELL_SIZE * 0.85;
        resolved.push({
          element: canvas,
          rect: new DOMRect(
            canvasRect.left + (hero.x - heroSize / 2) * scaleX,
            canvasRect.top + (hero.y - heroSize / 2) * scaleY,
            heroSize * scaleX,
            heroSize * scaleY,
          ),
        });
      }
    }
  }

  return resolved;
}

/** Every real DOM element currently wearing `.tutorial-highlighted-target` (the CSS class that bumps it above the click-blocker) - tracked so the next render can strip it back off before deciding what needs it this frame, rather than the class silently accumulating on stale elements. */
let tutorialHighlightedElements: HTMLElement[] = [];

/**
 * Rebuilds #tutorial-layer from scratch every call (same "cheap enough to
 * fully rebuild, never diffed" convention every other refresh* function in
 * this file already follows) - a full-screen click-blocker (step 30's
 * "拦截所有与当前引导步骤无关的点击事件"), one CSS box-shadow "hole" per
 * resolved target rect (the spotlight - box-shadow's 9999px spread darkens
 * everything *outside* its own box, which reads as a cutout without any
 * canvas globalCompositeOperation/mix-blend-mode trickery), and a dialog
 * bubble with the step's message plus a "知道了" dismiss button - the
 * safety valve that keeps a step whose real target happens to be disabled
 * (e.g. Ascension before eligibility) from ever soft-locking the game, per
 * the spec's own "防止玩家误触导致引导流程卡死" concern. Each target's real
 * DOM element gets `.tutorial-highlighted-target` (position:relative +
 * z-index above the blocker in CSS) so it - and only it - stays genuinely
 * clickable through the overlay.
 */
function renderTutorialOverlay(): void {
  for (const element of tutorialHighlightedElements) {
    element.classList.remove('tutorial-highlighted-target');
  }
  tutorialHighlightedElements = [];
  tutorialLayer.innerHTML = '';

  const step = tutorialManager.activeStep;
  if (!step) {
    return;
  }

  const blocker = document.createElement('div');
  blocker.className = 'tutorial-blocker';
  tutorialLayer.appendChild(blocker);

  for (const { element, rect } of resolveTutorialTargets(step.targets)) {
    const hole = document.createElement('div');
    hole.className = 'tutorial-hole';
    hole.style.left = `${rect.left - 6}px`;
    hole.style.top = `${rect.top - 6}px`;
    hole.style.width = `${rect.width + 12}px`;
    hole.style.height = `${rect.height + 12}px`;
    tutorialLayer.appendChild(hole);

    element.classList.add('tutorial-highlighted-target');
    tutorialHighlightedElements.push(element);
  }

  const dialog = document.createElement('div');
  dialog.className = 'tutorial-dialog';
  const messageEl = document.createElement('div');
  messageEl.className = 'tutorial-dialog-message';
  messageEl.textContent = step.message;
  dialog.appendChild(messageEl);

  const dismissButton = document.createElement('button');
  dismissButton.className = 'tutorial-dialog-dismiss';
  dismissButton.textContent = '知道了';
  dismissButton.addEventListener('click', () => {
    tutorialManager.completeActiveStep();
    gameManager.isPaused = false;
    renderTutorialOverlay();
  });
  dialog.appendChild(dismissButton);

  tutorialLayer.appendChild(dialog);
}

/**
 * Full-screen talent tree panel (step 23/24) - rebuilt from scratch on
 * every open/upgrade (same "cheap enough to fully rebuild, never diffed"
 * convention refreshHeroPanel/refreshInventoryPanel already use). Each node
 * shows name/description/level/next-level cost (talentManager.
 * getNextLevelCost - step 24's dynamic costFormula, not a flat fee) and an
 * upgrade button disabled when already maxed, dependencies aren't met, or
 * fragments are insufficient - locked nodes (dependencies not met)
 * additionally get the `.locked` CSS class. Clicking "升级" never upgrades
 * directly - it opens openTalentConfirmDialog, since every level here is
 * permanent (see TalentManager's own "落子无悔" doc comment).
 */
function refreshTalentsPanel(): void {
  const fragments = getMemoryFragments();
  talentsPanel.innerHTML = `
    <div class="talents-header">
      <div class="talents-title">🌟 天赋树 (Talents)</div>
      <div class="talents-fragments">记忆碎片: ${fragments}</div>
      <button class="talents-close" id="talents-close-button">关闭</button>
    </div>
  `;

  for (const node of talentManager.getAllNodes()) {
    const level = talentManager.getLevel(node.id);
    const unlocked = node.dependencies.every((dependency) => talentManager.getLevel(dependency.nodeId) >= dependency.requiredLevel);
    const maxed = level >= node.maxLevel;
    const nextCost = talentManager.getNextLevelCost(node.id);

    const nodeDiv = document.createElement('div');
    nodeDiv.className = unlocked ? 'talent-node' : 'talent-node locked';

    const dependencyText =
      node.dependencies.length > 0
        ? `前置: ${node.dependencies.map((dependency) => `${talentManager.getNode(dependency.nodeId)?.name ?? dependency.nodeId} Lv.${dependency.requiredLevel}+`).join(', ')}`
        : '无前置';

    nodeDiv.innerHTML = `
      <div class="talent-node-name">${node.name} · Lv.${level}/${node.maxLevel}</div>
      <div class="talent-node-desc">${node.description}</div>
      <div class="talent-node-desc">${dependencyText}</div>
    `;

    const row = document.createElement('div');
    row.className = 'talent-node-row';

    const status = document.createElement('span');
    status.textContent = maxed ? '已满级' : `升级消耗: ${nextCost} 碎片`;
    row.appendChild(status);

    const upgradeButton = document.createElement('button');
    upgradeButton.textContent = '升级';
    upgradeButton.disabled = maxed || !unlocked || fragments < nextCost;
    upgradeButton.addEventListener('click', () => openTalentConfirmDialog(node.id, node.name, nextCost));
    row.appendChild(upgradeButton);

    nodeDiv.appendChild(row);
    talentsPanel.appendChild(nodeDiv);
  }

  const closeButton = document.getElementById('talents-close-button');
  closeButton?.addEventListener('click', closeTalentsPanel);
}

function closeTalentsPanel(): void {
  talentsOverlay.classList.remove('open');
  popPauseForOverlay();
}

/**
 * Step 24's mandatory second confirmation before any talent upgrade - the
 * spec's "落子无悔" design means every level bought here is permanent, so
 * this dialog exists specifically to make that unmistakable before the
 * fragments are actually spent: it quotes the exact cost and a bold red
 * "此操作不可撤销" warning. Only "确认升级" actually calls
 * talentManager.upgradeTalent; "取消" (or clicking the overlay backdrop)
 * closes the dialog with nothing spent.
 */
function openTalentConfirmDialog(nodeId: string, nodeName: string, cost: number): void {
  talentConfirmDialog.innerHTML = `
    <div class="talent-confirm-title">升级「${nodeName}」？</div>
    <div class="talent-confirm-cost">将消耗 <b>${cost}</b> 记忆碎片</div>
    <div class="talent-confirm-warning">⚠️ 此操作不可撤销 - 天赋一经投入，无法重置或返还。</div>
    <div class="talent-confirm-actions">
      <button id="talent-confirm-cancel">取消</button>
      <button id="talent-confirm-commit">确认升级</button>
    </div>
  `;

  document.getElementById('talent-confirm-cancel')?.addEventListener('click', closeTalentConfirmDialog);
  document.getElementById('talent-confirm-commit')?.addEventListener('click', () => {
    const result = talentManager.upgradeTalent(nodeId);
    showMessage(result.success ? `${nodeName} 升级至 Lv.${result.newLevel}！（已永久生效）` : '升级失败');
    closeTalentConfirmDialog();
    refreshTalentsPanel();
  });

  pushPauseForOverlay();
  talentConfirmOverlay.classList.add('open');
}

function closeTalentConfirmDialog(): void {
  talentConfirmOverlay.classList.remove('open');
  talentConfirmDialog.innerHTML = '';
  popPauseForOverlay();
}

talentConfirmOverlay.addEventListener('click', (event) => {
  if (event.target === talentConfirmOverlay) {
    closeTalentConfirmDialog();
  }
});

// --- Step 27: prestige/rebirth ("转生仪式") --------------------------------

/**
 * Second confirmation before a prestige - same "irreversible action needs
 * an explicit, informative gate" reasoning the talent confirm dialog
 * follows, laid out here as the spec's own two-column "您即将失去/您将
 * 获得" comparison instead of a single warning line. Sparks are computed
 * fresh from the current highestStageCleared every time this opens (not
 * cached), so the quoted number is always exactly what executePrestige
 * would actually grant if confirmed right now.
 */
function openAscensionConfirmDialog(): void {
  const highestStage = getHighestStageCleared();
  const sparksGain = PrestigeManager.calculateSparks(highestStage);
  const bonusPercent = Math.round(sparksGain * SPARK_BONUS_PER_POINT * 100);

  ascensionConfirmDialog.innerHTML = `
    <div class="ascension-title">✨ 转生仪式 ✨</div>
    <div class="ascension-section lose">
      <div class="ascension-section-title">您即将失去：</div>
      <div>波次进度、金币、英雄等级</div>
    </div>
    <div class="ascension-section gain">
      <div class="ascension-section-title">您将获得：</div>
      <div>${sparksGain} 枚永恒星火（全局伤害与生命 +${bonusPercent}%）</div>
    </div>
    <div class="ascension-actions">
      <button id="ascension-confirm-cancel">取消</button>
      <button id="ascension-confirm-commit">确认转生</button>
    </div>
  `;

  document.getElementById('ascension-confirm-cancel')?.addEventListener('click', closeAscensionConfirmDialog);
  document.getElementById('ascension-confirm-commit')?.addEventListener('click', () => {
    closeAscensionConfirmDialog();

    // Step 27's "白屏闪烁" + "空灵的音效" - triggered together right as the
    // reset itself happens, so the flash's ~0.75s peak roughly coincides
    // with the run actually resetting underneath it. No explicit revert
    // for the BGM: resetForPrestige() restarts WaveManager and immediately
    // calls start(), which fires onWaveStart -> updateEnvironmentForWave
    // on its own very next tick, naturally crossfading away from
    // sky-realm.wav into whatever theme wave 1 actually landed on.
    renderer.triggerPrestigeFlash();
    gameManager.audioManager.playTrack('/audio/sky-realm.wav');

    const sparksGained = PrestigeManager.executePrestige(gameManager);
    showMessage(`转生完成！获得永恒星火 +${sparksGained}`);
  });

  pushPauseForOverlay();
  ascensionConfirmOverlay.classList.add('open');
}

function closeAscensionConfirmDialog(): void {
  ascensionConfirmOverlay.classList.remove('open');
  ascensionConfirmDialog.innerHTML = '';
  popPauseForOverlay();
}

ascensionConfirmOverlay.addEventListener('click', (event) => {
  if (event.target === ascensionConfirmOverlay) {
    closeAscensionConfirmDialog();
  }
});

ascensionButton.addEventListener('click', () => {
  if (ascensionButton.disabled) {
    return;
  }
  // Step 30: clicking the highlighted button is "seen" this step's own
  // completion condition, regardless of whether the confirm dialog that
  // follows actually gets committed or cancelled - the tutorial is about
  // pointing at Ascension, not about forcing a prestige.
  if (tutorialManager.activeStep?.id === TutorialStepId.SeenPrestige) {
    tutorialManager.completeActiveStep();
    gameManager.isPaused = false;
  }
  openAscensionConfirmDialog();
});

// --- Step 29/32: pause/resume + a shared "any full-screen/interactive panel
// pauses the run" stack ------------------------------------------------------

function updatePauseButtonLabel(): void {
  pauseButton.textContent = gameManager.isPaused ? '▶️' : '⏸️';
}

pauseButton.addEventListener('click', () => {
  gameManager.togglePause();
  updatePauseButtonLabel();
});

/**
 * Step 32's UI-state-machine audit: every overlay/modal in this file (talent
 * tree, talent confirm, equipment enhance modal, ascension confirm, settings,
 * welcome-back) now opens/closes through this pair instead of each hand-
 * rolling its own "remember whether we were already paused" snapshot the way
 * openSettingsPanel/closeSettingsPanel used to. A simple depth counter
 * (rather than a single "was it paused before" boolean) is what makes nested
 * overlays behave correctly - e.g. opening the talent-confirm dialog *on top
 * of* the already-open talent tree, then cancelling just that confirm
 * dialog, must leave the run paused (the talent tree is still up), not
 * resume it early. Only once the outermost pushPauseForOverlay's matching
 * pop brings the depth back to 0 does isPaused actually revert to whatever
 * it was before the very first overlay in the stack opened (respects a
 * manual ⏸️ press that predates any of this).
 */
let overlayPauseDepth = 0;
let pauseStateBeforeOverlays = false;

function pushPauseForOverlay(): void {
  if (overlayPauseDepth === 0) {
    pauseStateBeforeOverlays = gameManager.isPaused;
  }
  overlayPauseDepth += 1;
  gameManager.isPaused = true;
  updatePauseButtonLabel();
}

function popPauseForOverlay(): void {
  overlayPauseDepth = Math.max(0, overlayPauseDepth - 1);
  if (overlayPauseDepth === 0) {
    gameManager.isPaused = pauseStateBeforeOverlays;
    updatePauseButtonLabel();
  }
}

function openSettingsPanel(): void {
  pushPauseForOverlay();
  renderSettingsPanel();
  settingsOverlay.classList.add('open');
}

function closeSettingsPanel(): void {
  settingsOverlay.classList.remove('open');
  popPauseForOverlay();
}

function renderSettingsPanel(): void {
  const bgmPercent = Math.round(gameManager.audioManager.getVolume() * 100);
  const sfxPercent = Math.round(gameManager.audioManager.getSfxVolume() * 100);

  settingsPanel.innerHTML = `
    <div class="settings-title">⚙️ 设置 (Settings)</div>
    <div class="settings-row">
      <label for="bgm-volume-slider">BGM 音量</label>
      <input type="range" id="bgm-volume-slider" min="0" max="100" value="${bgmPercent}">
      <span id="bgm-volume-value">${bgmPercent}%</span>
    </div>
    <div class="settings-row">
      <label for="sfx-volume-slider">SFX 音量</label>
      <input type="range" id="sfx-volume-slider" min="0" max="100" value="${sfxPercent}">
      <span id="sfx-volume-value">${sfxPercent}%</span>
    </div>
    <div class="settings-danger">
      <div class="settings-danger-title">⚠️ 重置存档 (Hard Reset)</div>
      <div class="settings-danger-desc">将清空本地保存的所有数据并刷新页面，此操作不可撤销。请输入 "RESET" 以确认。</div>
      <input type="text" id="reset-confirm-input" placeholder="输入 RESET 以确认" autocomplete="off">
      <button id="reset-confirm-button" disabled>重置存档</button>
    </div>
    <button id="settings-close-button">关闭</button>
  `;

  const bgmSlider = document.getElementById('bgm-volume-slider') as HTMLInputElement;
  const bgmValue = document.getElementById('bgm-volume-value') as HTMLSpanElement;
  bgmSlider.addEventListener('input', () => {
    gameManager.audioManager.setVolume(Number(bgmSlider.value) / 100);
    bgmValue.textContent = `${bgmSlider.value}%`;
  });

  const sfxSlider = document.getElementById('sfx-volume-slider') as HTMLInputElement;
  const sfxValue = document.getElementById('sfx-volume-value') as HTMLSpanElement;
  sfxSlider.addEventListener('input', () => {
    gameManager.audioManager.setSfxVolume(Number(sfxSlider.value) / 100);
    sfxValue.textContent = `${sfxSlider.value}%`;
  });

  const resetInput = document.getElementById('reset-confirm-input') as HTMLInputElement;
  const resetButton = document.getElementById('reset-confirm-button') as HTMLButtonElement;
  resetInput.addEventListener('input', () => {
    resetButton.disabled = resetInput.value !== 'RESET';
  });
  resetButton.addEventListener('click', () => {
    if (resetInput.value !== 'RESET') {
      return;
    }
    localStorage.clear();
    window.location.reload();
  });

  document.getElementById('settings-close-button')?.addEventListener('click', closeSettingsPanel);
}

settingsButton.addEventListener('click', openSettingsPanel);
settingsOverlay.addEventListener('click', (event) => {
  if (event.target === settingsOverlay) {
    closeSettingsPanel();
  }
});

talentsButton.addEventListener('click', () => {
  pushPauseForOverlay();
  refreshTalentsPanel();
  talentsOverlay.classList.add('open');
});

talentsOverlay.addEventListener('click', (event) => {
  if (event.target === talentsOverlay) {
    closeTalentsPanel();
  }
});

/** Below this many offline seconds, the Welcome Back panel is skipped entirely (run starts immediately) - a page refresh a few seconds after the last one shouldn't interrupt the player with an empty-looking reward popup. */
const MIN_OFFLINE_SECONDS_TO_SHOW = 60;

function formatOfflineDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours <= 0) {
    return `${minutes} 分钟`;
  }
  return `${hours} 小时 ${minutes} 分钟`;
}

// --- Step 26: loot-burst particle wiring ---------------------------------

/** Items still waiting to be added to the inventory as their Equipment particle arrives (see particleManager.setOnArrived below) - populated by triggerLootBurst. Only one burst is ever in flight at a time in this UI, so a single shared FIFO queue (not one per burst) is enough: equipment particles always resolve in the same order they were queued. */
let pendingEquipmentQueue: EquipmentItem[] = [];

particleManager.setOnArrived((event: ParticleArrivedEvent) => {
  gameManager.audioManager.playChime();

  if (event.type === ParticleType.Gold) {
    gameManager.gold += event.value;
    bumpHudElement(hudGold);
  } else if (event.type === ParticleType.Fragment) {
    addMemoryFragments(event.value);
    bumpHudElement(hudFragments);
  } else {
    for (let i = 0; i < event.value; i += 1) {
      const item = pendingEquipmentQueue.shift();
      if (item) {
        gameManager.inventory.addItem(item);
      }
    }
    bumpHudElement(backpackAnchor);
    refreshInventoryPanel();
  }
});

/**
 * Step 26's "大爆开" trigger: spawns a representative particle burst from
 * (originX, originY) toward the gold/fragments/backpack HUD anchors.
 * Deliberately does NOT touch gameManager.gold/inventory or
 * addMemoryFragments here - per the spec's "隐藏面板，但不立即更新玩家的
 * 实际资源数值", every reward only actually lands once its own particle
 * physically arrives (see particleManager.setOnArrived above), which is
 * also what keeps the visible HUD number's final total exactly right
 * regardless of how the burst's particle count was scaled down.
 */
function triggerLootBurst(originX: number, originY: number, gold: number, memoryFragments: number, equipment: EquipmentItem[]): void {
  pendingEquipmentQueue.push(...equipment);
  particleManager.spawnBurst(
    originX,
    originY,
    { gold, memoryFragments, equipmentCount: equipment.length },
    {
      gold: canvasLocalCenter(hudGold),
      fragments: canvasLocalCenter(hudFragments),
      equipment: canvasLocalCenter(backpackAnchor),
    },
  );
}

/**
 * Step 25's "上线狂欢" panel - rendered once, on load, from a single
 * already-computed OfflineRewards snapshot (not recomputed on click,
 * so what's displayed is guaranteed to be exactly what gets claimed).
 * "全部领取" hides the panel and fires triggerLootBurst from the canvas
 * center - the actual gold/fragments/inventory mutation happens
 * particle-by-particle as step 26 requires, not synchronously here.
 * Still stamps SaveManager's lastSaveTime to now (so the *next* offline
 * window starts counting from this claim) and calls beginRun() right
 * away - the run's first wave never starts spawning while the panel is
 * still open, but it doesn't wait for the burst animation to finish
 * either (nothing about the burst is combat-relevant).
 */
function showWelcomeBackPanel(rewards: OfflineRewards): void {
  const equipmentIcons = rewards.equipment
    .map((item) => `<div class="welcome-equipment-icon rarity-${item.rarity}">${item.name.slice(0, 2)}</div>`)
    .join('');

  welcomeBackPanel.innerHTML = `
    <div class="welcome-title">🎉 欢迎回来！</div>
    <div class="welcome-duration">离线时间：${formatOfflineDuration(rewards.offlineSeconds)}</div>
    <div class="welcome-rewards-row">
      <div class="welcome-reward-stat">
        <div class="welcome-reward-value">+${rewards.gold}</div>
        <div class="welcome-reward-label">金币</div>
      </div>
      <div class="welcome-reward-stat">
        <div class="welcome-reward-value fragments">+${rewards.memoryFragments}</div>
        <div class="welcome-reward-label">记忆碎片</div>
      </div>
    </div>
    ${
      rewards.equipment.length > 0
        ? `<div class="welcome-equipment-title">获得装备 x${rewards.equipment.length}</div>
           <div class="welcome-equipment-grid">${equipmentIcons}</div>`
        : ''
    }
    <button id="claim-all-button">全部领取 (Claim All)</button>
  `;

  const claimButton = document.getElementById('claim-all-button') as HTMLButtonElement;
  claimButton.addEventListener('click', () => {
    // Hide first, mutate later (per particle) - see triggerLootBurst's doc
    // comment for why gold/fragments/inventory are deliberately untouched
    // right here.
    welcomeBackOverlay.classList.remove('open');
    popPauseForOverlay();
    triggerLootBurst(CANVAS_CENTER_X, CANVAS_CENTER_Y, rewards.gold, rewards.memoryFragments, rewards.equipment);
    recordSaveNow();
    beginRun();
  });

  pushPauseForOverlay();
  welcomeBackOverlay.classList.add('open');
}

/** Computes this session's offline rewards from SaveManager's persisted lastSaveTime/highestStageCleared and either shows showWelcomeBackPanel or, below MIN_OFFLINE_SECONDS_TO_SHOW, starts the run immediately with nothing to claim. */
function showWelcomeBackIfNeeded(): void {
  const elapsedSeconds = Math.max(0, (Date.now() - getLastSaveTime()) / 1000);
  if (elapsedSeconds < MIN_OFFLINE_SECONDS_TO_SHOW) {
    beginRun();
    return;
  }

  const rewards = OfflineManager.calculateRewards(getHighestStageCleared(), elapsedSeconds);
  showWelcomeBackPanel(rewards);
}

// Same "record on unload" convention any local-first save system needs -
// without this, lastSaveTime would only ever move forward via a claimed
// Welcome Back panel, so a session that's never away long enough to trigger
// one would never advance the offline clock at all.
window.addEventListener('beforeunload', () => recordSaveNow());

// --- Step 32: the module's full boot sequence, in the exact required order -
// 1. SaveManager.load() - the very first line of this module (see the top
//    of the file), so every read below (talent levels, Memory Fragments,
//    highestStageCleared, TutorialFlags) already reflects whatever was
//    actually persisted.
// 2. OfflineManager settlement - showWelcomeBackIfNeeded() reads the
//    lastSaveTime SaveManager.load() just restored, computes any offline
//    reward package, and shows the Welcome Back panel if there's something
//    worth claiming (skipped, going straight to beginRun(), below
//    MIN_OFFLINE_SECONDS_TO_SHOW - see that function).
// 3. TutorialManager's onboarding - not a separate explicit call here: a
//    genuinely fresh save has every TutorialFlags entry false, so the very
//    first updateHud() tick after beginRun() actually starts wave 1 (once
//    the Welcome Back panel, if any, is dismissed) already has
//    evaluateTutorialTriggers() detect "wave 0, zero heroes placed" and
//    activate PlaceFirstHero on its own - TutorialManager's own flag-gating
//    is what guarantees this can only ever happen on a save's first
//    playthrough, with no extra "is this fresh?" check needed here.
showWelcomeBackIfNeeded();

let lastTimestamp: number | null = null;

/**
 * The one requestAnimationFrame loop everything in this module runs off:
 * GameManager (combat/wave physics), ParticleManager (loot-burst particle
 * motion), and GameRenderer (the actual draw call) each get ticked here
 * every frame, all gated the same way on isPaused so "pause" genuinely means
 * every moving part freezes together, not just combat. AudioManager
 * deliberately has no per-frame call of its own - its BGM crossfades/SFX
 * chimes (see AudioManager.ts) run on their own setInterval/Web Audio
 * scheduling entirely independent of this loop, so there's nothing here for
 * it to bind to; it only ever reacts to explicit playTrack/playChime calls
 * elsewhere in this file (theme changes, particle arrivals, etc).
 */
function gameLoop(timestamp: number): void {
  if (lastTimestamp === null) {
    lastTimestamp = timestamp;
  }

  const rawDeltaSeconds = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;
  const deltaSeconds = Math.min(rawDeltaSeconds, MAX_DELTA_SECONDS);

  gameManager.update(deltaSeconds);
  // Runs regardless of hasStarted/beginRun() - a loot burst from the
  // Welcome Back panel can be mid-flight before the run itself has begun.
  // Step 29: skipped while paused, same "physics freezes, rendering
  // doesn't" rule GameManager.update() itself follows for combat/waves.
  if (!gameManager.isPaused) {
    particleManager.update(deltaSeconds);
  }
  renderer.render();
  updateHud();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
