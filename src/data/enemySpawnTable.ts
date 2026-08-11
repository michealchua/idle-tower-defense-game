import type { EnemyArchetypeId } from './enemyArchetypes';
import type { BiomeId } from './biomeConfig';
import { weightedPick } from '../utils/scaling';

export interface SpawnWeightEntry {
  archetypeId: EnemyArchetypeId;
  weight: number;
  minDifficultyScore: number;
  // Plan section 21's "地图拥有专属...敌人池" - a per-biome multiplier on
  // top of the shared base `weight`, so each map leans toward a different
  // handful of archetypes instead of every biome pulling from the exact
  // same table. Biomes absent from this map use the base weight unscaled
  // (1x) - most entries stay "generic filler" everywhere, only a couple of
  // archetypes per biome get called out as that map's signature threat.
  biomeWeights?: Partial<Record<BiomeId, number>>;
}

export const enemySpawnTable: SpawnWeightEntry[] = [
  { archetypeId: 'normal', weight: 10, minDifficultyScore: 0 },
  { archetypeId: 'swarm', weight: 6, minDifficultyScore: 0, biomeWeights: { forest: 1.5, desert: 1.5 } },
  { archetypeId: 'fast', weight: 4, minDifficultyScore: 0.3, biomeWeights: { desert: 2.5, skyRealm: 2 } },
  { archetypeId: 'berserker', weight: 3, minDifficultyScore: 0.3, biomeWeights: { volcano: 3 } },
  { archetypeId: 'brute', weight: 3, minDifficultyScore: 0.4, biomeWeights: { snowMountain: 2 } },
  { archetypeId: 'shield', weight: 3, minDifficultyScore: 0.4, biomeWeights: { ocean: 2.5, darkCave: 1.3 } },
  { archetypeId: 'zombie', weight: 3, minDifficultyScore: 0.5, biomeWeights: { darkCave: 3, poisonSwamp: 1.5 } },
  { archetypeId: 'tank', weight: 3, minDifficultyScore: 0.6, biomeWeights: { snowMountain: 2, ocean: 1.5, ancientRuins: 1.5 } },
  { archetypeId: 'healer', weight: 2, minDifficultyScore: 0.6 },
  { archetypeId: 'witch', weight: 2, minDifficultyScore: 0.7, biomeWeights: { poisonSwamp: 3, demonAbyss: 1.5 } },
  { archetypeId: 'giant', weight: 2, minDifficultyScore: 0.8, biomeWeights: { skyRealm: 1.5, demonAbyss: 2 } },
  { archetypeId: 'elite', weight: 1, minDifficultyScore: 1.2, biomeWeights: { ancientRuins: 2, volcano: 1.5, demonAbyss: 2 } },
];

export function pickArchetypeForScore(difficultyScore: number, biomeId: BiomeId): EnemyArchetypeId {
  const eligible = enemySpawnTable.filter((entry) => entry.minDifficultyScore <= difficultyScore);
  return weightedPick(
    eligible.map((entry) => ({ id: entry.archetypeId, weight: entry.weight * (entry.biomeWeights?.[biomeId] ?? 1) })),
  );
}
