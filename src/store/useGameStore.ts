import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createInitialGameState } from '../engine/core/GameState';
import { GameLoop } from '../engine/core/GameLoop';
import { heroUpgradeConfig, type UpgradeableStat } from '../data/heroConfig';
import { heroRosterConfig } from '../data/heroRosterConfig';
import { petRosterConfig } from '../data/petRosterConfig';
import { applyHeroUpgrade } from '../engine/systems/UpgradeSystem';
import { getDifficultyScore } from '../engine/systems/DifficultySystem';
import { getTeamPower, getRecommendedPowerForStage } from '../engine/systems/PowerSystem';
import { spawnEnemyNow } from '../engine/systems/SpawnSystem';
import { handleDeath } from '../engine/systems/DamageSystem';
import {
  debugForceDropEquipment,
  reforgeEquipment as reforgeEquipmentInEngine,
  salvageEquipment as salvageEquipmentInEngine,
  sellItem as sellItemInEngine,
  starUpEquipment as starUpEquipmentInEngine,
} from '../engine/systems/EquipmentSystem';
import {
  unlockHero as unlockHeroInEngine,
  deployHero as deployHeroInEngine,
  undeployHero as undeployHeroInEngine,
  equipItemToHero as equipItemToHeroInEngine,
  unequipHeroSlot as unequipHeroSlotInEngine,
  equipStrongestForHero as equipStrongestForHeroInEngine,
  unequipAllForHero as unequipAllForHeroInEngine,
  evolveHero as evolveHeroInEngine,
  equipSkill as equipSkillInEngine,
  unequipSkill as unequipSkillInEngine,
} from '../engine/systems/HeroSystem';
import { skillDefinitions } from '../data/skillConfig';
import { unlockPet as unlockPetInEngine, deployPet as deployPetInEngine, undeployPet as undeployPetInEngine } from '../engine/systems/PetSystem';
import { upgradeTalent as upgradeTalentInEngine } from '../engine/systems/TalentSystem';
import { upgradeAscensionShopNode as upgradeAscensionShopNodeInEngine } from '../engine/systems/AscensionShopSystem';
import { ascend as ascendInEngine, canAscend } from '../engine/systems/AscensionSystem';
import {
  hasUnseenSkills,
  hasUnseenPets,
  markSkillsSeen as markSkillsSeenInEngine,
  markPetsSeen as markPetsSeenInEngine,
  markEquipmentSeen as markEquipmentSeenInEngine,
} from '../engine/systems/NotificationSystem';
import { ascensionConfig } from '../data/ascensionConfig';
import { recomputeHeroStats, getDeployedHeroes } from '../engine/systems/HeroStatsSystem';
import { advanceToNextWave, getGlobalWaveNumber, retryCurrentWave, tickWaveProgress } from '../engine/systems/WaveSystem';
import {
  saveGame as saveGameToStorage,
  loadGame as loadGameFromStorage,
  deleteSave as deleteSaveFromStorage,
  type SaveSlot,
} from '../engine/core/SaveSystem';
import { waveConfig } from '../data/waveConfig';
import {
  pullSkill as pullSkillInEngine,
  pullPet as pullPetInEngine,
  pullSkillMulti as pullSkillMultiInEngine,
  pullPetMulti as pullPetMultiInEngine,
  pullSkillPremium as pullSkillPremiumInEngine,
  pullPetPremium as pullPetPremiumInEngine,
  pullSkillPremiumMulti as pullSkillPremiumMultiInEngine,
  pullPetPremiumMulti as pullPetPremiumMultiInEngine,
  exchangeDiamondsForGold as exchangeDiamondsForGoldInEngine,
  type GachaPullResult,
} from '../engine/systems/GachaSystem';
import { starUpHero as starUpHeroInEngine, starUpPet as starUpPetInEngine } from '../engine/systems/StarUpSystem';
import { claimDailyQuest as claimDailyQuestInEngine } from '../engine/systems/DailyQuestSystem';
import { dailyQuestIds, type DailyQuestId } from '../data/dailyQuestConfig';
import {
  unlockHeroByCondition as unlockHeroByConditionInEngine,
  unlockPetByCondition as unlockPetByConditionInEngine,
} from '../engine/systems/UnlockSystem';
import type { EnemyArchetypeId } from '../data/enemyArchetypes';
import type { EquipmentSlot } from '../data/equipmentConfig';
import type { TalentId } from '../data/talentConfig';
import type { AscensionShopId } from '../data/ascensionShopConfig';
import type { PityPoolId } from '../data/pityConfig';
import type { BaseState, EnemyState, EquipmentDropEvent, EquipmentItem, GameState, HeroState, PetState, SfxEventId, VisualEffect, WaveState } from '../engine/types';
import type { WindowMode } from '../utils/windowMode';

// Single mutable simulation state, shared by the GameLoop and by upgrade
// actions. The store below only ever holds read-only snapshots copied from
// it - if the loop and the store each owned their own hero object, an
// upgrade could be silently overwritten by the next tick.
const gameState: GameState = createInitialGameState();

const upgradeableStats = Object.keys(heroUpgradeConfig) as UpgradeableStat[];

// Used for both the store's initial state and every GameLoop tick sync, so
// the two can never drift into different copy semantics. Derived values
// (difficulty score, upgrade costs/maxed, ascension eligibility) are
// computed here too, so the UI only ever reads genuinely reactive store
// fields.
function snapshotGameState(state: GameState) {
  return {
    heroes: state.heroes.map((hero) => ({ ...hero })),
    pets: state.pets.map((pet) => ({ ...pet })),
    unlockedHeroIds: [...state.unlockedHeroIds],
    unlockedPetIds: [...state.unlockedPetIds],
    deployedHeroIds: [...state.deployedHeroIds],
    activePetId: state.activePetId,
    // Pre-filtered read-only view for rendering - only the active hero
    // squad gets drawn, a benched hero's stale position would otherwise
    // render. Every pet is always active, so `pets` above already is that
    // view for pets.
    deployedHeroes: getDeployedHeroes(state).map((hero) => ({ ...hero })),
    skillPoints: state.skillPoints,
    talentLevels: { ...state.talentLevels },
    ascensionLevel: state.ascensionLevel,
    ascensionPoints: state.ascensionPoints,
    ascensionShopLevels: { ...state.ascensionShopLevels },
    diamonds: state.diamonds,
    canAscend: canAscend(state),
    hasUnseenSkills: hasUnseenSkills(state),
    hasUnseenPets: hasUnseenPets(state),
    unseenEquipmentCount: state.unseenEquipmentCount,
    heroShards: { ...state.heroShards },
    heroStars: { ...state.heroStars },
    petShards: { ...state.petShards },
    petStars: { ...state.petStars },
    skillShards: { ...state.skillShards },
    pityCounters: { ...state.pityCounters },
    isFirstTenPullDone: state.isFirstTenPullDone,
    epicSourceStone: state.epicSourceStone,
    legendarySourceStone: state.legendarySourceStone,
    goldSpentTotal: state.goldSpentTotal,
    wave: { ...state.wave },
    enemies: state.enemies.map((enemy) => ({ ...enemy })),
    base: { ...state.base },
    visualEffects: state.visualEffects.map((effect) => ({ ...effect })),
    screenShakeIntensity: state.screenShakeIntensity,
    bossIntroRemaining: state.bossIntroRemaining,
    pendingSfxEvents: [...state.pendingSfxEvents],
    victoryPoseRemaining: state.victoryPoseRemaining,
    gold: state.gold,
    isGameOver: state.isGameOver,
    difficultyScore: getDifficultyScore(state),
    teamPower: getTeamPower(state),
    recommendedPower: getRecommendedPowerForStage(state.wave),
    inventory: state.inventory.map((item) => ({ ...item })),
    equipmentDropFeed: state.equipmentDropFeed.map((event) => ({ ...event })),
    reforgeDust: state.reforgeDust,
    lastLoginDate: state.lastLoginDate,
    pendingStoryId: state.pendingStoryId,
    hasSeenTutorialStory: state.hasSeenTutorialStory,
    completedTutorialStepIds: [...state.completedTutorialStepIds],
    dailyQuestProgress: { ...state.dailyQuestProgress },
    dailyQuestClaimed: { ...state.dailyQuestClaimed },
    highestGlobalWaveReached: state.highestGlobalWaveReached,
    totalBossKills: state.totalBossKills,
  };
}

interface GameStore {
  heroes: HeroState[];
  pets: PetState[];
  unlockedHeroIds: string[];
  unlockedPetIds: string[];
  deployedHeroIds: string[];
  deployedHeroes: HeroState[];
  activePetId: string | null;
  deployPet: (petId: string) => boolean;
  undeployPet: () => boolean;
  skillPoints: number;
  talentLevels: Record<string, number>;
  upgradeTalent: (talentId: TalentId) => void;
  ascensionLevel: number;
  ascensionPoints: number;
  ascensionShopLevels: Record<string, number>;
  upgradeAscensionShopNode: (id: AscensionShopId) => void;
  diamonds: number;
  canAscend: boolean;
  // Nav-tab red-dot flags - see NotificationSystem.ts. markSkillsSeen/
  // markPetsSeen/markEquipmentSeen are called from App.tsx's handleTabClick
  // when the corresponding panel opens.
  hasUnseenSkills: boolean;
  hasUnseenPets: boolean;
  unseenEquipmentCount: number;
  markSkillsSeen: () => void;
  markPetsSeen: () => void;
  markEquipmentSeen: () => void;
  heroShards: Record<string, number>;
  heroStars: Record<string, number>;
  petShards: Record<string, number>;
  petStars: Record<string, number>;
  skillShards: Record<string, number>;
  pityCounters: Record<PityPoolId, number>;
  isFirstTenPullDone: boolean;
  epicSourceStone: number;
  legendarySourceStone: number;
  goldSpentTotal: number;
  wave: WaveState;
  enemies: EnemyState[];
  base: BaseState;
  visualEffects: VisualEffect[];
  screenShakeIntensity: number;
  bossIntroRemaining: number;
  pendingSfxEvents: SfxEventId[];
  victoryPoseRemaining: number;
  gold: number;
  isGameOver: boolean;
  difficultyScore: number;
  teamPower: number;
  recommendedPower: number;
  upgradeHeroStat: (heroId: string, stat: UpgradeableStat, count: number) => void;
  inventory: EquipmentItem[];
  equipmentDropFeed: EquipmentDropEvent[];
  reforgeDust: number;
  lastLoginDate: string | null;
  pendingStoryId: string | null;
  dismissStory: () => void;
  hasSeenTutorialStory: boolean;
  completedTutorialStepIds: string[];
  completeTutorialStep: (stepId: string) => void;
  dailyQuestProgress: Record<DailyQuestId, number>;
  dailyQuestClaimed: Record<DailyQuestId, boolean>;
  highestGlobalWaveReached: number;
  totalBossKills: number;
  claimDailyQuest: (id: DailyQuestId) => void;
  // Which save slot the current session is tied to - null until the player
  // loads or starts a new game from TitleScreen. Drives autosave (see
  // ensureAutosaveStarted below) and the in-HUD manual save button.
  activeSlot: SaveSlot | null;
  saveGame: (slot: SaveSlot) => void;
  loadGame: (slot: SaveSlot) => boolean;
  deleteSave: (slot: SaveSlot) => void;
  startNewGame: (slot: SaveSlot) => void;
  equipItemToHero: (heroId: string, instanceId: number) => void;
  unequipHeroSlot: (heroId: string, slot: EquipmentSlot) => void;
  equipStrongestForHero: (heroId: string) => void;
  unequipAllForHero: (heroId: string) => void;
  sellItem: (instanceId: number) => void;
  salvageEquipment: (instanceId: number) => void;
  starUpEquipment: (instanceId: number) => void;
  reforgeEquipment: (instanceId: number) => void;
  unlockHero: (heroId: string) => void;
  unlockPet: (petId: string) => void;
  deployHero: (heroId: string) => void;
  undeployHero: (heroId: string) => void;
  evolveHero: (heroId: string, branchId: string) => boolean;
  equipSkill: (heroId: string, skillId: string) => boolean;
  unequipSkill: (heroId: string, skillId: string) => boolean;
  unlockHeroByCondition: (heroId: string) => void;
  unlockPetByCondition: (petId: string) => void;
  ascend: () => void;
  pullSkill: () => GachaPullResult | null;
  pullPet: () => GachaPullResult | null;
  pullSkillMulti: (count: number) => GachaPullResult[];
  pullPetMulti: (count: number) => GachaPullResult[];
  pullSkillPremium: () => GachaPullResult | null;
  pullPetPremium: () => GachaPullResult | null;
  pullSkillPremiumMulti: (count: number) => GachaPullResult[];
  pullPetPremiumMulti: (count: number) => GachaPullResult[];
  exchangeDiamondsForGold: () => void;
  starUpHero: (heroId: string) => void;
  starUpPet: (petId: string) => void;
  isPaused: boolean;
  speedMultiplier: number;
  // Player-facing speed control (see BattleScreen.tsx's speed buttons) -
  // separate from debugSetSpeed, which is debug-only and skips the
  // wave-gate check SPEED_TIERS enforces in the UI.
  setSpeedMultiplier: (multiplier: number) => void;
  // UI-only, not part of gameState/saved - see App.tsx's window-mode toggle
  // buttons. Never persisted; every launch starts back at 'default'.
  windowMode: WindowMode;
  setWindowMode: (mode: WindowMode) => void;
}

// subscribeWithSelector adds the selector-form store.subscribe(selector, cb,
// {equalityFn, fireImmediately}) used below by ensureAutosaveStarted -
// doesn't change anything about how components read the store (useGameStore
// selector hooks work exactly as before), purely additive.
export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set) => ({
  ...snapshotGameState(gameState),
  upgradeHeroStat: (heroId, stat, count) => {
    if (applyHeroUpgrade(gameState, heroId, stat, count)) {
      set(snapshotGameState(gameState));
    }
  },
  equipItemToHero: (heroId, instanceId) => {
    if (equipItemToHeroInEngine(gameState, heroId, instanceId)) {
      set(snapshotGameState(gameState));
    }
  },
  unequipHeroSlot: (heroId, slot) => {
    if (unequipHeroSlotInEngine(gameState, heroId, slot)) {
      set(snapshotGameState(gameState));
    }
  },
  equipStrongestForHero: (heroId) => {
    if (equipStrongestForHeroInEngine(gameState, heroId)) {
      set(snapshotGameState(gameState));
    }
  },
  unequipAllForHero: (heroId) => {
    if (unequipAllForHeroInEngine(gameState, heroId)) {
      set(snapshotGameState(gameState));
    }
  },
  sellItem: (instanceId) => {
    if (sellItemInEngine(gameState, instanceId)) {
      set(snapshotGameState(gameState));
    }
  },
  salvageEquipment: (instanceId) => {
    if (salvageEquipmentInEngine(gameState, instanceId)) {
      set(snapshotGameState(gameState));
    }
  },
  starUpEquipment: (instanceId) => {
    if (starUpEquipmentInEngine(gameState, instanceId)) {
      set(snapshotGameState(gameState));
    }
  },
  reforgeEquipment: (instanceId) => {
    if (reforgeEquipmentInEngine(gameState, instanceId)) {
      set(snapshotGameState(gameState));
    }
  },
  unlockHero: (heroId) => {
    if (unlockHeroInEngine(gameState, heroId)) {
      set(snapshotGameState(gameState));
    }
  },
  unlockPet: (petId) => {
    if (unlockPetInEngine(gameState, petId)) {
      set(snapshotGameState(gameState));
    }
  },
  markSkillsSeen: () => {
    markSkillsSeenInEngine(gameState);
    set(snapshotGameState(gameState));
  },
  markPetsSeen: () => {
    markPetsSeenInEngine(gameState);
    set(snapshotGameState(gameState));
  },
  markEquipmentSeen: () => {
    markEquipmentSeenInEngine(gameState);
    set(snapshotGameState(gameState));
  },
  deployPet: (petId) => {
    const didDeploy = deployPetInEngine(gameState, petId);
    if (didDeploy) {
      set(snapshotGameState(gameState));
    }
    return didDeploy;
  },
  undeployPet: () => {
    const didUndeploy = undeployPetInEngine(gameState);
    if (didUndeploy) {
      set(snapshotGameState(gameState));
    }
    return didUndeploy;
  },
  deployHero: (heroId) => {
    if (deployHeroInEngine(gameState, heroId)) {
      set(snapshotGameState(gameState));
    }
  },
  undeployHero: (heroId) => {
    if (undeployHeroInEngine(gameState, heroId)) {
      set(snapshotGameState(gameState));
    }
  },
  evolveHero: (heroId, branchId) => {
    const didEvolve = evolveHeroInEngine(gameState, heroId, branchId);
    if (didEvolve) {
      set(snapshotGameState(gameState));
    }
    return didEvolve;
  },
  equipSkill: (heroId, skillId) => {
    const didEquip = equipSkillInEngine(gameState, heroId, skillId);
    if (didEquip) {
      set(snapshotGameState(gameState));
    }
    return didEquip;
  },
  unequipSkill: (heroId, skillId) => {
    const didUnequip = unequipSkillInEngine(gameState, heroId, skillId);
    if (didUnequip) {
      set(snapshotGameState(gameState));
    }
    return didUnequip;
  },
  upgradeTalent: (talentId) => {
    if (upgradeTalentInEngine(gameState, talentId)) {
      set(snapshotGameState(gameState));
    }
  },
  upgradeAscensionShopNode: (id) => {
    if (upgradeAscensionShopNodeInEngine(gameState, id)) {
      set(snapshotGameState(gameState));
    }
  },
  unlockHeroByCondition: (heroId) => {
    if (unlockHeroByConditionInEngine(gameState, heroId)) {
      set(snapshotGameState(gameState));
    }
  },
  unlockPetByCondition: (petId) => {
    if (unlockPetByConditionInEngine(gameState, petId)) {
      set(snapshotGameState(gameState));
    }
  },
  ascend: () => {
    if (ascendInEngine(gameState)) {
      set(snapshotGameState(gameState));
    }
  },
  pullSkill: () => {
    const result = pullSkillInEngine(gameState);
    if (result) {
      set(snapshotGameState(gameState));
    }
    return result;
  },
  pullPet: () => {
    const result = pullPetInEngine(gameState);
    if (result) {
      set(snapshotGameState(gameState));
    }
    return result;
  },
  pullSkillMulti: (count) => {
    const results = pullSkillMultiInEngine(gameState, count);
    if (results.length > 0) {
      set(snapshotGameState(gameState));
    }
    return results;
  },
  pullPetMulti: (count) => {
    const results = pullPetMultiInEngine(gameState, count);
    if (results.length > 0) {
      set(snapshotGameState(gameState));
    }
    return results;
  },
  pullSkillPremium: () => {
    const result = pullSkillPremiumInEngine(gameState);
    if (result) {
      set(snapshotGameState(gameState));
    }
    return result;
  },
  pullPetPremium: () => {
    const result = pullPetPremiumInEngine(gameState);
    if (result) {
      set(snapshotGameState(gameState));
    }
    return result;
  },
  pullSkillPremiumMulti: (count) => {
    const results = pullSkillPremiumMultiInEngine(gameState, count);
    if (results.length > 0) {
      set(snapshotGameState(gameState));
    }
    return results;
  },
  pullPetPremiumMulti: (count) => {
    const results = pullPetPremiumMultiInEngine(gameState, count);
    if (results.length > 0) {
      set(snapshotGameState(gameState));
    }
    return results;
  },
  exchangeDiamondsForGold: () => {
    if (exchangeDiamondsForGoldInEngine(gameState)) {
      set(snapshotGameState(gameState));
    }
  },
  starUpHero: (heroId) => {
    if (starUpHeroInEngine(gameState, heroId)) {
      set(snapshotGameState(gameState));
    }
  },
  starUpPet: (petId) => {
    if (starUpPetInEngine(gameState, petId)) {
      set(snapshotGameState(gameState));
    }
  },
  isPaused: false,
  speedMultiplier: 1,
  setSpeedMultiplier: (multiplier) => {
    gameLoop?.setSpeedMultiplier(multiplier);
    set({ speedMultiplier: multiplier });
  },
  windowMode: 'default',
  setWindowMode: (mode) => set({ windowMode: mode }),
  dismissStory: () => {
    gameState.pendingStoryId = null;
    set({ pendingStoryId: null });
  },
  completeTutorialStep: (stepId) => {
    if (gameState.completedTutorialStepIds.includes(stepId)) {
      return;
    }
    gameState.completedTutorialStepIds = [...gameState.completedTutorialStepIds, stepId];
    set({ completedTutorialStepIds: [...gameState.completedTutorialStepIds] });
  },
  claimDailyQuest: (id) => {
    if (claimDailyQuestInEngine(gameState, id)) {
      set(snapshotGameState(gameState));
    }
  },
  activeSlot: null,
  saveGame: (slot) => {
    saveGameToStorage(slot, gameState);
    set({ activeSlot: slot });
  },
  loadGame: (slot) => {
    const loaded = loadGameFromStorage(slot);
    if (!loaded) {
      return false;
    }
    Object.assign(gameState, loaded);
    // Saves written before completedTutorialStepIds existed won't have the
    // field at all - default it so tutorialConfig.getActiveTutorialStep's
    // .includes() call never sees undefined.
    gameState.completedTutorialStepIds = gameState.completedTutorialStepIds ?? [];
    // Same migration guard, for saves written before the daily-quest/records
    // fields existed.
    gameState.dailyQuestProgress = gameState.dailyQuestProgress ?? Object.fromEntries(dailyQuestIds.map((id) => [id, 0]));
    gameState.dailyQuestClaimed = gameState.dailyQuestClaimed ?? Object.fromEntries(dailyQuestIds.map((id) => [id, false]));
    gameState.highestGlobalWaveReached = gameState.highestGlobalWaveReached ?? getGlobalWaveNumber(gameState.wave);
    gameState.totalBossKills = gameState.totalBossKills ?? 0;
    gameState.seenChapterStoryIds = gameState.seenChapterStoryIds ?? [];
    // Saves written before hero movement existed won't have these two fields
    // on any hero at all - default homePosition to wherever position already
    // was (exactly what it meant before the split) and leave no pursuit
    // target set.
    // Saves written before persistent slot indices existed won't have
    // deployedSlotIndex on any hero - default every deployed hero to its
    // current position-in-deployedHeroIds (exactly what its slot was under
    // the old array-order layout) so the fixed grid it now reads from lines
    // up with where that save already had it. relayoutDeployedHeroes (called
    // via retryCurrentWave below) also self-heals a missing/invalid index,
    // this just makes the specific slot assignment match the old layout
    // instead of an arbitrary "first free" one.
    gameState.deployedHeroIds.forEach((heroId, index) => {
      const hero = gameState.heroes.find((candidate) => candidate.id === heroId);
      if (hero && (hero.deployedSlotIndex === undefined || hero.deployedSlotIndex === null)) {
        hero.deployedSlotIndex = index;
      }
    });
    for (const hero of gameState.heroes) {
      hero.homePosition = hero.homePosition ?? { ...hero.position };
      hero.moveTargetEnemyInstanceId = hero.moveTargetEnemyInstanceId ?? null;
      hero.deployedSlotIndex = hero.deployedSlotIndex ?? null;
      // Saves written before the base-HP-removal squad-wipe mechanic won't
      // have this field - retryCurrentWave below clears it too, this just
      // covers any code that might read it before that runs.
      hero.isDowned = hero.isDowned ?? false;
    }
    // A save is never resumed mid-combat - heal the battlefield and
    // re-derive the current wave's shape (same as retrying a failed wave),
    // then clear the purely cosmetic/transient fields retryCurrentWave
    // doesn't touch. hasSeenTutorialStory/pendingStoryId round-trip through
    // Object.assign above, so a save already past wave 1 correctly never
    // re-triggers the tutorial dialog.
    retryCurrentWave(gameState);
    gameState.visualEffects = [];
    gameState.nextVisualEffectId = 1;
    gameState.equipmentDropFeed = [];
    gameState.nextEquipmentDropEventId = gameState.nextEquipmentDropEventId ?? 1;
    gameState.screenShakeIntensity = 0;
    gameState.hitStopRemaining = 0;
    gameState.bossIntroRemaining = 0;
    gameState.pendingSfxEvents = [];
    gameState.victoryPoseRemaining = 0;
    gameState.isGameOver = false;
    gameState.pendingStoryId = null;
    recomputeHeroStats(gameState);
    set({ ...snapshotGameState(gameState), activeSlot: slot });
    return true;
  },
  deleteSave: (slot) => {
    deleteSaveFromStorage(slot);
  },
  startNewGame: (slot) => {
    Object.assign(gameState, createInitialGameState());
    set({ ...snapshotGameState(gameState), activeSlot: slot });
    saveGameToStorage(slot, gameState);
  },
  })),
);

export { upgradeableStats };

let gameLoop: GameLoop | null = null;
let loopStarted = false;

export function ensureGameLoopStarted(): void {
  if (loopStarted) {
    return;
  }
  loopStarted = true;

  gameLoop = new GameLoop(gameState, (state) => {
    useGameStore.setState(snapshotGameState(state));
  });

  gameLoop.start();
}

const AUTOSAVE_INTERVAL_MS = 20_000;
let autosaveStarted = false;

// Periodically (and on tab close) persists to whichever slot the current
// session is tied to - a no-op until the player has loaded/started a game
// from TitleScreen (activeSlot is still null). Idempotent like
// ensureGameLoopStarted, so BattleScreen can call it unconditionally on
// mount.
export function ensureAutosaveStarted(): void {
  if (autosaveStarted) {
    return;
  }
  autosaveStarted = true;

  const persistIfActive = () => {
    const { activeSlot } = useGameStore.getState();
    if (activeSlot !== null) {
      saveGameToStorage(activeSlot, gameState);
    }
  };

  setInterval(persistIfActive, AUTOSAVE_INTERVAL_MS);
  window.addEventListener('beforeunload', persistIfActive);

  // Closes the "just loaded/started a game, tab crashes before the first
  // 20s interval tick" gap - an immediate save the moment activeSlot first
  // becomes non-null. subscribeWithSelector's selector form only re-invokes
  // this listener when the *selected* value (activeSlot) actually changes,
  // not on every one of GameLoop's 10Hz store updates the way a plain
  // useGameStore.subscribe(fullStateListener) would - activeSlot flips maybe
  // once or twice a session, so this listener runs about that often too.
  useGameStore.subscribe(
    (state) => state.activeSlot,
    (activeSlot) => {
      if (activeSlot !== null) {
        saveGameToStorage(activeSlot, gameState);
      }
    },
  );
}

// --- Debug-only actions below. Not part of core gameplay - for fast
// iteration/testing during development, mirroring the same "engine function
// + sync store" shape everything else here already uses. ---

export function debugSpawnEnemy(): void {
  spawnEnemyNow(gameState);
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugSpawnArchetype(archetypeId: EnemyArchetypeId): void {
  spawnEnemyNow(gameState, archetypeId);
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugSpawnMany(count: number): void {
  for (let i = 0; i < count; i += 1) {
    spawnEnemyNow(gameState);
  }
  useGameStore.setState(snapshotGameState(gameState));
}

// Grants every skillConfig.ts skill straight into ownedSkillIds (bypassing
// the gacha entirely) - a dev convenience for testing the skill bag/equip
// UI without grinding pulls. Doesn't auto-equip any of them - equipping is
// still a manual choice, same as a real gacha-drawn skill.
export function debugUnlockAllSkills(): void {
  for (const hero of gameState.heroes) {
    for (const skillId of Object.keys(skillDefinitions)) {
      if (!hero.ownedSkillIds.includes(skillId)) {
        hero.ownedSkillIds.push(skillId);
      }
    }
  }
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugSpawnEquipment(): void {
  debugForceDropEquipment(gameState);
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugUnlockAllHeroes(): void {
  for (const definition of heroRosterConfig) {
    unlockHeroInEngine(gameState, definition.id);
  }
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugUnlockAllPets(): void {
  for (const definition of petRosterConfig) {
    unlockPetInEngine(gameState, definition.id);
  }
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugGrantGold(amount: number): void {
  gameState.gold += amount;
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugGrantMaterials(): void {
  gameState.epicSourceStone += 20;
  gameState.legendarySourceStone += 20;
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugPullSkillMany(count: number): void {
  for (let i = 0; i < count; i += 1) {
    pullSkillInEngine(gameState);
  }
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugPullPetMany(count: number): void {
  for (let i = 0; i < count; i += 1) {
    pullPetInEngine(gameState);
  }
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugForceAscend(): void {
  for (const hero of gameState.heroes) {
    hero.level = Math.max(hero.level, ascensionConfig.unlockHeroLevel);
  }
  if (getGlobalWaveNumber(gameState.wave) < ascensionConfig.requiredWave) {
    gameState.wave.chapter = Math.ceil(ascensionConfig.requiredWave / waveConfig.wavesPerChapter);
    gameState.wave.waveInChapter = ascensionConfig.requiredWave - (gameState.wave.chapter - 1) * waveConfig.wavesPerChapter;
  }
  recomputeHeroStats(gameState);
  ascendInEngine(gameState);
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugKillAllEnemies(): void {
  for (const enemy of [...gameState.enemies]) {
    handleDeath(gameState, enemy);
  }
  // debugKillAllEnemies bypasses the game loop entirely, so a wave-clearing
  // kill needs an explicit progress check here - otherwise it'd silently
  // wait for the next real loop tick, which doesn't reliably happen in this
  // dev environment.
  tickWaveProgress(gameState, 0);
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugForceClearWave(): void {
  advanceToNextWave(gameState);
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugForceFailWave(): void {
  retryCurrentWave(gameState);
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugGrantSkillPoints(amount: number): void {
  gameState.skillPoints += amount;
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugGrantAscensionPoints(amount: number): void {
  gameState.ascensionPoints += amount;
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugGrantDiamonds(amount: number): void {
  gameState.diamonds += amount;
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugGrantReforgeDust(amount: number): void {
  gameState.reforgeDust += amount;
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugPause(): void {
  gameLoop?.stop();
  useGameStore.setState({ isPaused: true });
}

export function debugResume(): void {
  gameLoop?.start();
  useGameStore.setState({ isPaused: false });
}

export function debugSetSpeed(multiplier: number): void {
  gameLoop?.setSpeedMultiplier(multiplier);
  useGameStore.setState({ speedMultiplier: multiplier });
}
