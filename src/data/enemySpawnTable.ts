import type { EnemyArchetypeId } from './enemyArchetypes';
import { weightedPick } from './scaling';

export interface SpawnWeightEntry {
  archetypeId: EnemyArchetypeId;
  weight: number;
  minDifficultyScore: number;
}

export const enemySpawnTable: SpawnWeightEntry[] = [
  { archetypeId: 'normal', weight: 10, minDifficultyScore: 0 },
  { archetypeId: 'swarm', weight: 6, minDifficultyScore: 0 },
  { archetypeId: 'fast', weight: 4, minDifficultyScore: 0.3 },
  { archetypeId: 'berserker', weight: 3, minDifficultyScore: 0.3 },
  { archetypeId: 'brute', weight: 3, minDifficultyScore: 0.4 },
  { archetypeId: 'shield', weight: 3, minDifficultyScore: 0.4 },
  { archetypeId: 'tank', weight: 3, minDifficultyScore: 0.6 },
  { archetypeId: 'healer', weight: 2, minDifficultyScore: 0.6 },
  { archetypeId: 'giant', weight: 2, minDifficultyScore: 0.8 },
  { archetypeId: 'elite', weight: 1, minDifficultyScore: 1.2 },
];

export function pickArchetypeForScore(difficultyScore: number): EnemyArchetypeId {
  const eligible = enemySpawnTable.filter((entry) => entry.minDifficultyScore <= difficultyScore);
  return weightedPick(eligible.map((entry) => ({ id: entry.archetypeId, weight: entry.weight })));
}
