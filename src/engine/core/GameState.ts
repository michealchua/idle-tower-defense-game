import { createHero } from '../entities/Hero';
import { createBase } from '../entities/Base';
import { heroRosterConfig } from '../../data/heroRosterConfig';
import { petRosterConfig } from '../../data/petRosterConfig';
import { heroUpgradeConfig, type UpgradeableStat } from '../../data/heroConfig';
import { layoutHeroPositions } from '../../data/mapConfig';
import { talentConfig, type TalentId } from '../../data/talentConfig';
import { recomputeHeroStats } from '../systems/HeroStatsSystem';
import { createInitialWaveState } from '../systems/WaveSystem';
import type { GameState } from '../types';

function createInitialGlobalUpgrades(): Record<UpgradeableStat, number> {
  return Object.fromEntries(
    Object.keys(heroUpgradeConfig).map((stat) => [stat, 0]),
  ) as Record<UpgradeableStat, number>;
}

function createInitialTalentLevels(): Record<TalentId, number> {
  return Object.fromEntries(Object.keys(talentConfig).map((id) => [id, 0])) as Record<TalentId, number>;
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
    towers: [],
    unlockedHeroIds: [starterHeroId],
    unlockedPetIds: [],
    unlockedTowerIds: [],
    deployedHeroIds: [starterHeroId],
    deployedPetIds: [],
    deployedTowerIds: [],
    castleLevel: 1,
    skillPoints: 0,
    skillPointAccumulator: 0,
    talentLevels: createInitialTalentLevels(),
    globalUpgrades: createInitialGlobalUpgrades(),
    ascensionLevel: 0,
    heroShards: createInitialCounters(heroRosterConfig.map((hero) => hero.id)),
    heroStars: createInitialCounters(heroRosterConfig.map((hero) => hero.id)),
    petShards: createInitialCounters(petRosterConfig.map((pet) => pet.id)),
    petStars: createInitialCounters(petRosterConfig.map((pet) => pet.id)),
    epicSourceStone: 0,
    legendarySourceStone: 0,
    goldSpentTotal: 0,
    wave: createInitialWaveState(),
    enemies: [],
    base: createBase(),
    gold: 0,
    nextEnemyInstanceId: 1,
    isGameOver: false,
    visualEffects: [],
    nextVisualEffectId: 1,
    spawnCooldownRemaining: 0,
    inventory: [],
    equipped: { weapon: null, armor: null, trinket: null },
    nextEquipmentInstanceId: 1,
  };

  recomputeHeroStats(state);
  return state;
}
