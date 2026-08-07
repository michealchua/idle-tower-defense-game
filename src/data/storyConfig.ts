// Visual-novel-style dialog scripts for StoryDialog.tsx. Keyed by the id
// stored in GameState.pendingStoryId (see WaveSystem.tickTutorialStoryTrigger
// for the only trigger that exists today). Each line's text lives in
// zh-CN.ts under the `story` namespace, same as every other UI string.
export interface StoryLine {
  speakerNameKey: string;
  avatar: string;
  textKey: string;
}

export const storyScripts: Record<string, StoryLine[]> = {
  tutorial: [
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.tutorial1' },
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.tutorial2' },
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.tutorial3' },
    { speakerNameKey: 'story.steward', avatar: '🧙', textKey: 'story.tutorial4' },
  ],
};
