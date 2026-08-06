import { create } from 'zustand';
import { createInitialGameState } from '../engine/core/GameState';
import { GameLoop } from '../engine/core/GameLoop';
import { heroUpgradeConfig, type UpgradeableStat } from '../data/heroConfig';
import { heroRosterConfig, getHeroDefinition } from '../data/heroRosterConfig';
import { petRosterConfig } from '../data/petRosterConfig';
import { applyHeroUpgrade } from '../engine/systems/UpgradeSystem';
import { getDifficultyScore } from '../engine/systems/DifficultySystem';
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
  swapDeployedHeroes as swapDeployedHeroesInEngine,
  equipItemToHero as equipItemToHeroInEngine,
  unequipHeroSlot as unequipHeroSlotInEngine,
  evolveHero as evolveHeroInEngine,
} from '../engine/systems/HeroSystem';
import { unlockPet as unlockPetInEngine } from '../engine/systems/PetSystem';
import { upgradeCastle as upgradeCastleInEngine, setCastleType as setCastleTypeInEngine } from '../engine/systems/CastleSystem';
import { upgradeTalent as upgradeTalentInEngine } from '../engine/systems/TalentSystem';
import { upgradeAscensionShopNode as upgradeAscensionShopNodeInEngine } from '../engine/systems/AscensionShopSystem';
import { ascend as ascendInEngine, canAscend } from '../engine/systems/AscensionSystem';
import { ascensionConfig } from '../data/ascensionConfig';
import { recomputeHeroStats, getDeployedHeroes } from '../engine/systems/HeroStatsSystem';
import { advanceToNextWave, getGlobalWaveNumber, retryCurrentWave, tickWaveProgress } from '../engine/systems/WaveSystem';
import { waveConfig } from '../data/waveConfig';
import {
  pullHero as pullHeroInEngine,
  pullPet as pullPetInEngine,
  pullHeroMulti as pullHeroMultiInEngine,
  pullPetMulti as pullPetMultiInEngine,
  pullHeroPremium as pullHeroPremiumInEngine,
  pullPetPremium as pullPetPremiumInEngine,
  pullHeroPremiumMulti as pullHeroPremiumMultiInEngine,
  pullPetPremiumMulti as pullPetPremiumMultiInEngine,
  exchangeDiamondsForGold as exchangeDiamondsForGoldInEngine,
  type GachaPullResult,
} from '../engine/systems/GachaSystem';
import { starUpHero as starUpHeroInEngine, starUpPet as starUpPetInEngine } from '../engine/systems/StarUpSystem';
import {
  unlockHeroByCondition as unlockHeroByConditionInEngine,
  unlockPetByCondition as unlockPetByConditionInEngine,
} from '../engine/systems/UnlockSystem';
import type { EnemyArchetypeId } from '../data/enemyArchetypes';
import type { EquipmentSlot } from '../data/equipmentConfig';
import type { TalentId } from '../data/talentConfig';
import type { AscensionShopId } from '../data/ascensionShopConfig';
import type { CastleTypeId } from '../data/castleTypeConfig';
import type { PityPoolId } from '../data/pityConfig';
import type { BaseState, EnemyState, EquipmentItem, GameState, HeroState, PetState, VisualEffect, WaveState } from '../engine/types';

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
    // Pre-filtered read-only view for rendering - only the active hero
    // squad gets drawn, a benched hero's stale position would otherwise
    // render. Every pet is always active, so `pets` above already is that
    // view for pets.
    deployedHeroes: getDeployedHeroes(state).map((hero) => ({ ...hero })),
    castleLevel: state.castleLevel,
    castleType: state.castleType,
    skillPoints: state.skillPoints,
    talentLevels: { ...state.talentLevels },
    ascensionLevel: state.ascensionLevel,
    ascensionPoints: state.ascensionPoints,
    ascensionShopLevels: { ...state.ascensionShopLevels },
    diamonds: state.diamonds,
    canAscend: canAscend(state),
    heroShards: { ...state.heroShards },
    heroStars: { ...state.heroStars },
    petShards: { ...state.petShards },
    petStars: { ...state.petStars },
    pityCounters: { ...state.pityCounters },
    isFirstTenPullDone: state.isFirstTenPullDone,
    epicSourceStone: state.epicSourceStone,
    legendarySourceStone: state.legendarySourceStone,
    goldSpentTotal: state.goldSpentTotal,
    wave: { ...state.wave },
    enemies: state.enemies.map((enemy) => ({ ...enemy })),
    base: { ...state.base },
    visualEffects: state.visualEffects.map((effect) => ({ ...effect })),
    gold: state.gold,
    buildMaterials: state.buildMaterials,
    isGameOver: state.isGameOver,
    difficultyScore: getDifficultyScore(state),
    inventory: state.inventory.map((item) => ({ ...item })),
    reforgeDust: state.reforgeDust,
    lastLoginDate: state.lastLoginDate,
  };
}

interface GameStore {
  heroes: HeroState[];
  pets: PetState[];
  unlockedHeroIds: string[];
  unlockedPetIds: string[];
  deployedHeroIds: string[];
  deployedHeroes: HeroState[];
  castleLevel: number;
  castleType: CastleTypeId;
  skillPoints: number;
  talentLevels: Record<string, number>;
  upgradeCastle: () => void;
  setCastleType: (castleType: CastleTypeId) => void;
  upgradeTalent: (talentId: TalentId) => void;
  ascensionLevel: number;
  ascensionPoints: number;
  ascensionShopLevels: Record<string, number>;
  upgradeAscensionShopNode: (id: AscensionShopId) => void;
  diamonds: number;
  canAscend: boolean;
  heroShards: Record<string, number>;
  heroStars: Record<string, number>;
  petShards: Record<string, number>;
  petStars: Record<string, number>;
  pityCounters: Record<PityPoolId, number>;
  isFirstTenPullDone: boolean;
  epicSourceStone: number;
  legendarySourceStone: number;
  goldSpentTotal: number;
  wave: WaveState;
  enemies: EnemyState[];
  base: BaseState;
  visualEffects: VisualEffect[];
  gold: number;
  buildMaterials: number;
  isGameOver: boolean;
  difficultyScore: number;
  upgradeHeroStat: (heroId: string, stat: UpgradeableStat, count: number) => void;
  inventory: EquipmentItem[];
  reforgeDust: number;
  lastLoginDate: string | null;
  equipItemToHero: (heroId: string, instanceId: number) => void;
  unequipHeroSlot: (heroId: string, slot: EquipmentSlot) => void;
  sellItem: (instanceId: number) => void;
  salvageEquipment: (instanceId: number) => void;
  starUpEquipment: (instanceId: number) => void;
  reforgeEquipment: (instanceId: number) => void;
  unlockHero: (heroId: string) => void;
  unlockPet: (petId: string) => void;
  deployHero: (heroId: string) => void;
  undeployHero: (heroId: string) => void;
  swapDeployedHeroes: (heroIdA: string, heroIdB: string) => void;
  evolveHero: (heroId: string, branchId: string) => boolean;
  unlockHeroByCondition: (heroId: string) => void;
  unlockPetByCondition: (petId: string) => void;
  ascend: () => void;
  pullHero: () => GachaPullResult | null;
  pullPet: () => GachaPullResult | null;
  pullHeroMulti: (count: number) => GachaPullResult[];
  pullPetMulti: (count: number) => GachaPullResult[];
  pullHeroPremium: () => GachaPullResult | null;
  pullPetPremium: () => GachaPullResult | null;
  pullHeroPremiumMulti: (count: number) => GachaPullResult[];
  pullPetPremiumMulti: (count: number) => GachaPullResult[];
  exchangeDiamondsForGold: () => void;
  starUpHero: (heroId: string) => void;
  starUpPet: (petId: string) => void;
  isPaused: boolean;
  speedMultiplier: number;
  // UI-only, not part of gameState - whether a hero roster card is mid-drag
  // over the battle canvas, so BattleScreen knows whether to overlay the
  // deploy-slot grid. Null whenever nothing is being dragged. Pets have no
  // deploy-drag interaction anymore (see PetSystem.ts), so this is
  // hero-only now.
  dragPreviewKind: 'hero' | null;
  setDragPreviewKind: (kind: 'hero' | null) => void;
}

export const useGameStore = create<GameStore>((set) => ({
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
  swapDeployedHeroes: (heroIdA, heroIdB) => {
    if (swapDeployedHeroesInEngine(gameState, heroIdA, heroIdB)) {
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
  upgradeCastle: () => {
    if (upgradeCastleInEngine(gameState)) {
      set(snapshotGameState(gameState));
    }
  },
  setCastleType: (castleType) => {
    if (setCastleTypeInEngine(gameState, castleType)) {
      set(snapshotGameState(gameState));
    }
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
  pullHero: () => {
    const result = pullHeroInEngine(gameState);
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
  pullHeroMulti: (count) => {
    const results = pullHeroMultiInEngine(gameState, count);
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
  pullHeroPremium: () => {
    const result = pullHeroPremiumInEngine(gameState);
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
  pullHeroPremiumMulti: (count) => {
    const results = pullHeroPremiumMultiInEngine(gameState, count);
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
  dragPreviewKind: null,
  setDragPreviewKind: (kind) => set({ dragPreviewKind: kind }),
}));

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

export function debugUnlockAllSkills(): void {
  for (const hero of gameState.heroes) {
    for (const unlock of getHeroDefinition(hero.id).skillUnlocks) {
      if (!hero.unlockedSkillIds.includes(unlock.skillId)) {
        hero.unlockedSkillIds.push(unlock.skillId);
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

export function debugGrantBuildMaterials(amount: number): void {
  gameState.buildMaterials += amount;
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugGrantMaterials(): void {
  gameState.epicSourceStone += 20;
  gameState.legendarySourceStone += 20;
  useGameStore.setState(snapshotGameState(gameState));
}

export function debugPullHeroMany(count: number): void {
  for (let i = 0; i < count; i += 1) {
    pullHeroInEngine(gameState);
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
