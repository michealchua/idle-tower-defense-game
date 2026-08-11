import type { BossKind } from './waveConfig';

export type BiomeId =
  | 'forest'
  | 'desert'
  | 'ocean'
  | 'snowMountain'
  | 'poisonSwamp'
  | 'darkCave'
  | 'ancientRuins'
  | 'volcano'
  | 'skyRealm'
  | 'demonAbyss';

export interface BiomeDefinition {
  id: BiomeId;
  labelKey: string;
  // Served from public/ - see public/backgrounds and public/audio. Relative
  // (no leading "/") on purpose - see assetLoader.ts's getHeroSpriteSrc doc
  // comment for why a root-absolute path breaks these under the packaged
  // desktop app's file:// loading.
  backgroundImage: string;
  musicTrack: string;
  // Shown behind the scene until backgroundImage finishes loading (or if it
  // fails to load at all) - each one echoes its biome's palette so a broken
  // load never looks like an actual bug, just a plain background.
  fallbackColor: string;
}

// Cycle order for getBiomeForChapter, a loose "journey" arc from
// peaceful/low-level (forest) to the final-chapter theme (demonAbyss) -
// chapter 11 wraps back around to forest, etc.
const BIOME_CYCLE: BiomeId[] = [
  'forest',
  'desert',
  'ocean',
  'snowMountain',
  'poisonSwamp',
  'darkCave',
  'ancientRuins',
  'volcano',
  'skyRealm',
  'demonAbyss',
];

export const biomeDefinitions: Record<BiomeId, BiomeDefinition> = {
  forest: {
    id: 'forest',
    labelKey: 'biome.forest',
    backgroundImage: 'backgrounds/forest.png',
    musicTrack: 'audio/forest.wav',
    fallbackColor: '#1b3b2a',
  },
  desert: {
    id: 'desert',
    labelKey: 'biome.desert',
    backgroundImage: 'backgrounds/desert.png',
    musicTrack: 'audio/desert.wav',
    fallbackColor: '#7c5a2e',
  },
  ocean: {
    id: 'ocean',
    labelKey: 'biome.ocean',
    backgroundImage: 'backgrounds/ocean.png',
    musicTrack: 'audio/ocean.wav',
    fallbackColor: '#0d3b52',
  },
  snowMountain: {
    id: 'snowMountain',
    labelKey: 'biome.snowMountain',
    backgroundImage: 'backgrounds/snow-mountain.png',
    musicTrack: 'audio/snow-mountain.wav',
    fallbackColor: '#4a5a68',
  },
  poisonSwamp: {
    id: 'poisonSwamp',
    labelKey: 'biome.poisonSwamp',
    backgroundImage: 'backgrounds/poison-swamp.png',
    musicTrack: 'audio/poison-swamp.wav',
    fallbackColor: '#33421f',
  },
  darkCave: {
    id: 'darkCave',
    labelKey: 'biome.darkCave',
    backgroundImage: 'backgrounds/dark-cave.png',
    musicTrack: 'audio/dark-cave.wav',
    fallbackColor: '#1a1a22',
  },
  ancientRuins: {
    id: 'ancientRuins',
    labelKey: 'biome.ancientRuins',
    backgroundImage: 'backgrounds/ancient-ruins.png',
    musicTrack: 'audio/ancient-ruins.wav',
    fallbackColor: '#5a4a35',
  },
  volcano: {
    id: 'volcano',
    labelKey: 'biome.volcano',
    backgroundImage: 'backgrounds/volcano.png',
    musicTrack: 'audio/volcano.wav',
    fallbackColor: '#4a1410',
  },
  skyRealm: {
    id: 'skyRealm',
    labelKey: 'biome.skyRealm',
    backgroundImage: 'backgrounds/sky-realm.png',
    musicTrack: 'audio/sky-realm.wav',
    fallbackColor: '#3d5a8a',
  },
  demonAbyss: {
    id: 'demonAbyss',
    labelKey: 'biome.demonAbyss',
    backgroundImage: 'backgrounds/demon-abyss.png',
    musicTrack: 'audio/demon-abyss.wav',
    fallbackColor: '#2a0f14',
  },
};

// Pure function of chapter, same "derive don't store" precedent as the
// kill-progress bar - no engine/state changes needed to add or reorder
// biomes.
export function getBiomeForChapter(chapter: number): BiomeDefinition {
  const index = (Math.max(1, chapter) - 1) % BIOME_CYCLE.length;
  return biomeDefinitions[BIOME_CYCLE[index]];
}

// Boss waves (wave.isBossWave) override the biome track with a dedicated
// theme instead - see BattleScreen's music-track effect, which picks
// between this and getBiomeForChapter(...).musicTrack based on
// wave.isBossWave/bossKind.
export const bossMusicTracks: Record<BossKind, string> = {
  miniboss: 'audio/miniboss.wav',
  boss: 'audio/boss.wav',
};
