// Level-theme (background + BGM + biome mechanics) configuration and
// rotation for the src/combat/* engine (combat-test.html), independent of
// the older biomeConfig.ts/useGameStore system - this one is driven by
// WaveManager's flat 0-based wave index rather than a store-tracked
// "chapter" field.
import { biomeMechanicsById, biomeHazardTextById } from './biomeMechanicsCatalog';
import { setActiveBiomeMechanics, type BiomeMechanics } from './activeBiome';

export type ThemeId =
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

export interface ThemeDefinition {
  id: ThemeId;
  displayName: string;
  /** Served from public/ - see public/backgrounds. */
  backgroundImage: string;
  /** Served from public/ - see public/audio. Streamed, not preloaded. */
  musicTrack: string;
  /** Drawn behind the scene until backgroundImage finishes loading (or if it fails to load) - echoes the theme's palette so a slow/broken load never looks like a bug. */
  fallbackColor: string;
  /** This theme's global-rule-engine hooks (step 22) - see activeBiome.ts's BiomeMechanics doc comments for what each hook does. */
  mechanics: BiomeMechanics;
  /** HUD hazard-indicator one-liner, e.g. "🌋 火山：全体英雄持续受到灼烧" - see BattleScreen-equivalent HUD wiring in combat/main.ts. */
  hazardText: string;
}

const THEME_IDS: ThemeId[] = [
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

const THEME_BASE_DATA: Record<ThemeId, Omit<ThemeDefinition, 'mechanics' | 'hazardText'>> = {
  forest: {
    id: 'forest',
    displayName: '森林',
    backgroundImage: '/backgrounds/forest.jpg',
    musicTrack: '/audio/forest.wav',
    fallbackColor: '#1b3b2a',
  },
  desert: {
    id: 'desert',
    displayName: '沙漠',
    backgroundImage: '/backgrounds/desert.jpg',
    musicTrack: '/audio/desert.wav',
    fallbackColor: '#7c5a2e',
  },
  ocean: {
    id: 'ocean',
    displayName: '海洋',
    backgroundImage: '/backgrounds/ocean.png',
    musicTrack: '/audio/ocean.wav',
    fallbackColor: '#0d3b52',
  },
  snowMountain: {
    id: 'snowMountain',
    displayName: '雪山',
    backgroundImage: '/backgrounds/snow-mountain.jpg',
    musicTrack: '/audio/snow-mountain.wav',
    fallbackColor: '#4a5a68',
  },
  poisonSwamp: {
    id: 'poisonSwamp',
    displayName: '毒沼',
    backgroundImage: '/backgrounds/poison-swamp.png',
    musicTrack: '/audio/poison-swamp.wav',
    fallbackColor: '#33421f',
  },
  darkCave: {
    id: 'darkCave',
    displayName: '暗洞',
    backgroundImage: '/backgrounds/dark-cave.png',
    musicTrack: '/audio/dark-cave.wav',
    fallbackColor: '#1a1a22',
  },
  ancientRuins: {
    id: 'ancientRuins',
    displayName: '远古遗迹',
    backgroundImage: '/backgrounds/ancient-ruins.jpg',
    musicTrack: '/audio/ancient-ruins.wav',
    fallbackColor: '#5a4a35',
  },
  volcano: {
    id: 'volcano',
    displayName: '火山',
    backgroundImage: '/backgrounds/volcano.jpg',
    musicTrack: '/audio/volcano.wav',
    fallbackColor: '#4a1410',
  },
  skyRealm: {
    id: 'skyRealm',
    displayName: '天空之境',
    backgroundImage: '/backgrounds/sky-realm.jpg',
    musicTrack: '/audio/sky-realm.wav',
    fallbackColor: '#3d5a8a',
  },
  demonAbyss: {
    id: 'demonAbyss',
    displayName: '恶魔深渊',
    backgroundImage: '/backgrounds/demon-abyss.jpg',
    musicTrack: '/audio/demon-abyss.wav',
    fallbackColor: '#2a0f14',
  },
};

export const themeDefinitions: Record<ThemeId, ThemeDefinition> = Object.fromEntries(
  THEME_IDS.map((id) => [
    id,
    { ...THEME_BASE_DATA[id], mechanics: biomeMechanicsById[id], hazardText: biomeHazardTextById[id] },
  ]),
) as Record<ThemeId, ThemeDefinition>;

/** Boss-wave BGM overrides - keyed by the boss "kind" (see WaveConfig.getWaveBossKind), not by theme, since every biome shares the same two dedicated boss tracks. */
export const bossMusicTracks: Record<'miniboss' | 'boss', string> = {
  miniboss: '/audio/miniboss.wav',
  boss: '/audio/boss.wav',
};

/** Every background src across every theme - what GameRenderer preloads up front so a fresh theme switch doesn't pop in from its fallback color for the first few frames. */
export function allThemeBackgroundSrcs(): string[] {
  return Object.values(themeDefinitions).map((theme) => theme.backgroundImage);
}

/**
 * Tracks which ThemeDefinition the run is currently in, rotating to a
 * random theme every `wavesPerStage` waves (a "stage"/"chapter") - default
 * 10, per the spec's "每推进 10 波...自动轮换到下一个随机主题". Also owns
 * pushing the landed theme's BiomeMechanics into activeBiome.ts's global
 * seam (see that module's doc comment) so BattleHero/BattleEnemy/
 * CombatEngine/InventoryManager pick up the new theme's rules immediately,
 * with no separate wiring needed at each of those call sites.
 */
export class ThemeManager {
  private readonly wavesPerStage: number;
  private stageIndex = 0;
  private theme: ThemeDefinition;

  constructor(wavesPerStage = 10) {
    this.wavesPerStage = Math.max(1, wavesPerStage);
    this.theme = themeDefinitions.forest;
    setActiveBiomeMechanics(this.theme.mechanics);
  }

  get currentTheme(): ThemeDefinition {
    return this.theme;
  }

  get currentStageIndex(): number {
    return this.stageIndex;
  }

  /** Random theme id, excluding `excludeId` when more than one theme exists - so a stage advance is guaranteed to actually feel like a change rather than occasionally re-rolling the same biome back to back. */
  private randomThemeId(excludeId: ThemeId): ThemeId {
    const candidates = THEME_IDS.filter((id) => id !== excludeId);
    const pool = candidates.length > 0 ? candidates : THEME_IDS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Recomputes the stage from a 0-based overall wave index and, if that
   * stage has advanced past the last one seen, rolls a new random theme and
   * pushes its mechanics into activeBiome.ts. Returns whether the theme
   * actually changed, so callers (GameManager) only re-trigger BGM/render
   * transitions on a real change, not every wave.
   */
  updateForWave(waveIndex: number): boolean {
    const nextStageIndex = Math.floor(Math.max(0, waveIndex) / this.wavesPerStage);
    if (nextStageIndex === this.stageIndex) {
      return false;
    }
    this.stageIndex = nextStageIndex;
    this.theme = themeDefinitions[this.randomThemeId(this.theme.id)];
    setActiveBiomeMechanics(this.theme.mechanics);
    return true;
  }
}
