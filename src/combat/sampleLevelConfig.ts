import type { LevelConfig } from './WaveConfig';

/**
 * Small 2-wave level shared by test-run.ts and combat-test.html's main.ts -
 * one source of truth rather than each entry point hardcoding its own copy.
 * Wave 1 is all weak trash (goblins); wave 2 mixes in tougher orcs and a
 * boss, demonstrating a WaveConfig whose spawns array has multiple
 * independently-paced SpawnConfig groups (goblins arrive faster than the
 * orcs/boss that follow them).
 */
export const sampleLevelConfig: LevelConfig = {
  waves: [
    {
      waveId: 'wave-1-goblins',
      delayBeforeStart: 1,
      spawns: [{ enemyType: 'goblin', count: 5, interval: 0.6 }],
    },
    {
      waveId: 'wave-2-mixed',
      delayBeforeStart: 2,
      spawns: [
        { enemyType: 'goblin', count: 3, interval: 0.5 },
        { enemyType: 'orc', count: 2, interval: 1 },
        { enemyType: 'boss_demon', count: 1, interval: 1 },
      ],
    },
  ],
};
