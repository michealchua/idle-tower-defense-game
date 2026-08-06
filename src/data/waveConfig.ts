export type BossKind = 'miniboss' | 'boss';

// Placeholder sizing/timers, same "tune later" precedent as every other
// number introduced this session.
export const waveConfig = {
  wavesPerChapter: 10,
  miniBossWave: 5,
  bigBossWave: 10,
  baseEnemiesPerWave: 8,
  enemiesPerWaveGrowthPerChapter: 2,
  miniBossTimeLimitSeconds: 45,
  bigBossTimeLimitSeconds: 90,
};

export function getNormalWaveEnemyCount(chapter: number): number {
  return waveConfig.baseEnemiesPerWave + (chapter - 1) * waveConfig.enemiesPerWaveGrowthPerChapter;
}

export function getBossTimeLimit(bossKind: BossKind): number {
  return bossKind === 'miniboss' ? waveConfig.miniBossTimeLimitSeconds : waveConfig.bigBossTimeLimitSeconds;
}

export function getBossKindForWave(waveInChapter: number): BossKind | undefined {
  if (waveInChapter === waveConfig.miniBossWave) {
    return 'miniboss';
  }
  if (waveInChapter === waveConfig.bigBossWave) {
    return 'boss';
  }
  return undefined;
}
