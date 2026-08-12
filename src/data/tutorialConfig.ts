import { waveConfig } from './waveConfig';
import { panelUnlockWave } from './unlockConditionConfig';
import { heroEvolutionConfig } from './heroConfig';
import type { EquipmentSlot } from './equipmentConfig';

// Minimal duck-typed view of the store's state - only the fields a step's
// isEligible actually reads. Deliberately not GameState/GameStore itself
// (this file lives in data/, which never imports engine/ or store/) - any
// object with these fields (the live Zustand store state, most obviously)
// satisfies it structurally.
export interface TutorialContext {
  hasSeenTutorialStory: boolean;
  pendingStoryId: string | null;
  completedTutorialStepIds: string[];
  unlockedHeroIds: string[];
  unlockedPetIds: string[];
  inventory: unknown[];
  heroes: { level: number; evolutionBranchId: string | null; equipment: Partial<Record<EquipmentSlot, unknown | null>> }[];
  wave: { chapter: number; waveInChapter: number; isBossWave: boolean; bossKind?: string };
}

function globalWaveOf(wave: TutorialContext['wave']): number {
  return (wave.chapter - 1) * waveConfig.wavesPerChapter + wave.waveInChapter;
}

export interface TutorialStep {
  id: string;
  messageKey: string;
  // data-tutorial attribute value of the DOM element to spotlight (see
  // App.tsx's nav buttons) - TutorialOverlay renders nothing if the element
  // isn't currently mounted (e.g. its panel tab isn't visible yet), so a
  // step whose isEligible races ahead of the panel actually unlocking just
  // silently waits rather than pointing at nothing.
  targetSelector: string;
  isEligible: (ctx: TutorialContext) => boolean;
}

// Real "实际操作引导" steps (plan section 20) - each spotlights one live UI
// element instead of dumping a wall of text. Deliberately non-blocking (see
// TutorialOverlay) so the player can act on the spotlighted element directly
// while it's showing, and one-shot forever once dismissed (see
// GameState.completedTutorialStepIds / useGameStore.completeTutorialStep).
// Order matters only as tie-break priority when multiple steps are eligible
// on the same render - wave-gated conditions mostly keep them naturally
// sequential anyway.
export const tutorialSteps: TutorialStep[] = [
  {
    id: 'battlefieldOverview',
    messageKey: 'tutorialStep.battlefieldOverview',
    targetSelector: 'battle-hud',
    // First real step of the opening walkthrough - waits for the intro story
    // dialog (WaveSystem.tickTutorialStoryTrigger) to finish so the two never
    // overlap, same gate as every other step below.
    isEligible: (ctx) => ctx.hasSeenTutorialStory && ctx.pendingStoryId === null,
  },
  {
    id: 'saveReminder',
    messageKey: 'tutorialStep.saveReminder',
    targetSelector: 'save-button',
    isEligible: (ctx) => ctx.hasSeenTutorialStory && ctx.pendingStoryId === null,
  },
  {
    id: 'openHeroPanel',
    messageKey: 'tutorialStep.openHeroPanel',
    targetSelector: 'nav-hero',
    // Waits for the intro story dialog (WaveSystem.tickTutorialStoryTrigger)
    // to finish so the two never overlap.
    isEligible: (ctx) => ctx.hasSeenTutorialStory && ctx.pendingStoryId === null,
  },
  {
    id: 'firstGacha',
    messageKey: 'tutorialStep.firstGacha',
    targetSelector: 'nav-gacha',
    isEligible: (ctx) => globalWaveOf(ctx.wave) >= (panelUnlockWave.gacha ?? Infinity) && ctx.unlockedHeroIds.length <= 1,
  },
  {
    id: 'firstEquipment',
    messageKey: 'tutorialStep.firstEquipment',
    targetSelector: 'nav-equipment',
    isEligible: (ctx) =>
      globalWaveOf(ctx.wave) >= (panelUnlockWave.equipment ?? Infinity) &&
      ctx.inventory.length > 0 &&
      ctx.heroes.every((hero) => Object.values(hero.equipment).every((item) => !item)),
  },
  {
    id: 'bossPrep',
    messageKey: 'tutorialStep.bossPrep',
    targetSelector: 'nav-hero',
    isEligible: (ctx) => ctx.wave.isBossWave && ctx.wave.bossKind === 'boss',
  },
  {
    id: 'evolutionReady',
    messageKey: 'tutorialStep.evolutionReady',
    targetSelector: 'nav-hero',
    isEligible: (ctx) => ctx.heroes.some((hero) => hero.level >= heroEvolutionConfig.unlockLevel && hero.evolutionBranchId === null),
  },
  {
    id: 'petUnlocked',
    messageKey: 'tutorialStep.petUnlocked',
    targetSelector: 'nav-pet',
    isEligible: (ctx) => globalWaveOf(ctx.wave) >= (panelUnlockWave.pet ?? Infinity) && ctx.unlockedPetIds.length === 0,
  },
];

export function getActiveTutorialStep(ctx: TutorialContext): TutorialStep | null {
  if (ctx.pendingStoryId !== null) {
    return null;
  }
  for (const step of tutorialSteps) {
    if (!ctx.completedTutorialStepIds.includes(step.id) && step.isEligible(ctx)) {
      return step;
    }
  }
  return null;
}
