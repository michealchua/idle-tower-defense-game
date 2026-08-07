import { createHero } from '../entities/Hero';
import { createBase } from '../entities/Base';
import { heroRosterConfig } from '../../data/heroRosterConfig';
import { petRosterConfig } from '../../data/petRosterConfig';
import { layoutHeroPositions } from '../../data/mapConfig';
import { talentConfig, type TalentId } from '../../data/talentConfig';
import { ascensionShopConfig, type AscensionShopId } from '../../data/ascensionShopConfig';
import { gachaPityConfig, type PityPoolId } from '../../data/pityConfig';
import { defaultCastleTypeId } from '../../data/castleTypeConfig';
import { recomputeHeroStats } from '../systems/HeroStatsSystem';
import { createInitialWaveState } from '../systems/WaveSystem';
import type { GameState } from '../types';

function createInitialTalentLevels(): Record<TalentId, number> {
  return Object.fromEntries(Object.keys(talentConfig).map((id) => [id, 0])) as Record<TalentId, number>;
}

function createInitialAscensionShopLevels(): Record<AscensionShopId, number> {
  return Object.fromEntries(Object.keys(ascensionShopConfig).map((id) => [id, 0])) as Record<AscensionShopId, number>;
}

function createInitialPityCounters(): Record<PityPoolId, number> {
  return Object.fromEntries(Object.keys(gachaPityConfig).map((id) => [id, 0])) as Record<PityPoolId, number>;
}

// Pre-seeds every roster entry (locked or not) at 0 so reads never need a
// fallback - a pull can grant shards to any roster id, so the record has to
// cover the whole roster from the start, not just currently-unlocked ones.
function createInitialCounters(ids: string[]): Record<string, number> {
  return Object.fromEntries(ids.map((id) => [id, 0]));
}

export function createInitialGameState(): GameState {
  const starterHeroId = heroRosterConfig[0].id;
  const [starterPosition] = layoutHeroPositions(1);

  const state: GameState = {
    heroes: [createHero(starterHeroId, starterPosition)],
    pets: [],
    unlockedHeroIds: [starterHeroId],
    unlockedPetIds: [],
    deployedHeroIds: [starterHeroId],
    castleLevel: 1,
    castleType: defaultCastleTypeId,
    skillPoints: 0,
    talentLevels: createInitialTalentLevels(),
    ascensionLevel: 0,
    ascensionPoints: 0,
    ascensionShopLevels: createInitialAscensionShopLevels(),
    diamonds: 0,
    heroShards: createInitialCounters(heroRosterConfig.map((hero) => hero.id)),
    heroStars: createInitialCounters(heroRosterConfig.map((hero) => hero.id)),
    petShards: createInitialCounters(petRosterConfig.map((pet) => pet.id)),
    petStars: createInitialCounters(petRosterConfig.map((pet) => pet.id)),
    pityCounters: createInitialPityCounters(),
    isFirstTenPullDone: false,
    hasGrantedFirstGachaBonus: false,
    epicSourceStone: 0,
    legendarySourceStone: 0,
    goldSpentTotal: 0,
    wave: createInitialWaveState(),
    enemies: [],
    base: createBase(),
    gold: 0,
    buildMaterials: 0,
    nextEnemyInstanceId: 1,
    isGameOver: false,
    visualEffects: [],
    nextVisualEffectId: 1,
    spawnCooldownRemaining: 0,
    screenShakeIntensity: 0,
    hitStopRemaining: 0,
    inventory: [],
    nextEquipmentInstanceId: 1,
    reforgeDust: 0,
    lastLoginDate: null,
    hasSeenTutorialStory: false,
    pendingStoryId: null,
  };

  recomputeHeroStats(state);
  return state;
}
