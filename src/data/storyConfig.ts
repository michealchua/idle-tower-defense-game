// Visual-novel-style dialog scripts for StoryDialog.tsx. Keyed by the id
// stored in GameState.pendingStoryId (see WaveSystem.tickTutorialStoryTrigger
// for the only trigger that exists today). Each line's text lives in
// zh-CN.ts under the `story` namespace, same as every other UI string.
export interface StoryLine {
  speakerNameKey: string;
  avatar: string;
  textKey: string;
}

// Plan section 21's "每张主要地图拥有独立主题...剧情以短对话→战斗→Boss→
// 奖励→新地图为主" - one short 2-line beat per biome (biomeConfig.ts),
// keyed by BiomeId so WaveSystem.advanceToNextWave can look it up directly
// off getBiomeForChapter. forest has no entry here - chapter 1 is already
// covered by the tutorial script above, so a second "welcome to the forest"
// beat right after it would be redundant. See GameState.seenChapterStoryIds
// for the "once per biome, ever" guard (the biome cycle repeats every 10
// chapters, these should not).
export const storyScripts: Record<string, StoryLine[]> = {
  tutorial: [
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.tutorial1' },
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.tutorial2' },
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.tutorial3' },
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.tutorial4' },
  ],
  desert: [
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.desert1' },
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.desert2' },
  ],
  ocean: [
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.ocean1' },
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.ocean2' },
  ],
  snowMountain: [
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.snowMountain1' },
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.snowMountain2' },
  ],
  poisonSwamp: [
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.poisonSwamp1' },
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.poisonSwamp2' },
  ],
  darkCave: [
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.darkCave1' },
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.darkCave2' },
  ],
  ancientRuins: [
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.ancientRuins1' },
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.ancientRuins2' },
  ],
  volcano: [
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.volcano1' },
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.volcano2' },
  ],
  skyRealm: [
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.skyRealm1' },
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.skyRealm2' },
  ],
  demonAbyss: [
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.demonAbyss1' },
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.demonAbyss2' },
  ],
};
