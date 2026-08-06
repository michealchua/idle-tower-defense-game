export type BiomeId = 'forest' | 'desert' | 'deepSea' | 'volcano';

export interface BiomeDefinition {
  id: BiomeId;
  labelKey: string;
  // Served from public/ - see public/backgrounds/README.md for the exact
  // filenames the loader looks for.
  backgroundImage: string;
  musicTrack: string;
  // Shown behind the scene until backgroundImage finishes loading (or if it
  // never gets dropped in at all) - each one echoes its biome's palette so
  // the placeholder never looks broken, just "art not loaded yet".
  fallbackColor: string;
}

// Cycle order for getBiomeForChapter - chapter 1 is forest, 2 desert, 3
// deepSea, 4 volcano, 5 back to forest, and so on.
const BIOME_CYCLE: BiomeId[] = ['forest', 'desert', 'deepSea', 'volcano'];

export const biomeDefinitions: Record<BiomeId, BiomeDefinition> = {
  forest: {
    id: 'forest',
    labelKey: 'biome.forest',
    backgroundImage: '/backgrounds/forest.png',
    musicTrack: '/audio/forest.mp3',
    fallbackColor: '#1b3b2a',
  },
  desert: {
    id: 'desert',
    labelKey: 'biome.desert',
    backgroundImage: '/backgrounds/desert.png',
    musicTrack: '/audio/desert.mp3',
    fallbackColor: '#7c5a2e',
  },
  deepSea: {
    id: 'deepSea',
    labelKey: 'biome.deepSea',
    backgroundImage: '/backgrounds/deep-sea.png',
    musicTrack: '/audio/deep-sea.mp3',
    fallbackColor: '#0d3b52',
  },
  volcano: {
    id: 'volcano',
    labelKey: 'biome.volcano',
    backgroundImage: '/backgrounds/volcano.png',
    musicTrack: '/audio/volcano.mp3',
    fallbackColor: '#4a1410',
  },
};

// Pure function of chapter, same "derive don't store" precedent as the
// kill-progress bar - no engine/state changes needed to add or reorder
// biomes.
export function getBiomeForChapter(chapter: number): BiomeDefinition {
  const index = (Math.max(1, chapter) - 1) % BIOME_CYCLE.length;
  return biomeDefinitions[BIOME_CYCLE[index]];
}
