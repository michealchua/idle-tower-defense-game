// Step 30's progressive onboarding system - a small, DOM-free state machine
// that decides *which* tutorial step (if any) should be showing right now,
// based on the flags SaveManager already persists (see TutorialFlags there)
// plus whatever gameplay signal each step's own `notify*`/`check*` method is
// called with. Deliberately knows nothing about the DOM, canvas, or
// GameManager - main.ts (the only real caller) is what owns pausing the run,
// building the spotlight overlay, and wiring each step's "the player did the
// real thing" completion back into completeActiveStep(). Kept DOM-free
// specifically so test-run.ts's headless simulation can exercise it directly
// (see this file's step 30 boundary test).
import { getTutorialFlags, setTutorialFlag, save as saveMeta, type TutorialFlags } from './SaveManager';

export enum TutorialStepId {
  PlaceFirstHero = 'place_first_hero',
  UpgradeHero = 'upgrade_hero',
  EquipItem = 'equip_item',
  SeenPrestige = 'seen_prestige',
}

/** Symbolic spotlight target(s) a step wants highlighted - kept as plain string keys (not DOM element references) so this file stays DOM-free; main.ts resolves each key into an actual on-screen rect to cut a hole in the overlay. */
export type TutorialTargetKey = 'build-panel' | 'placed-hero' | 'inventory-panel' | 'hero-equipment-panel' | 'ascension-button';

export interface TutorialStepDefinition {
  id: TutorialStepId;
  /** The SaveManager.TutorialFlags key this step's completion flips - once true, this step never activates again on this save. */
  flag: keyof TutorialFlags;
  message: string;
  targets: TutorialTargetKey[];
}

const TUTORIAL_STEPS: Record<TutorialStepId, TutorialStepDefinition> = {
  [TutorialStepId.PlaceFirstHero]: {
    id: TutorialStepId.PlaceFirstHero,
    flag: 'hasPlacedFirstHero',
    message: '欢迎来到战场！点击这里，放置你的第一位英雄！',
    targets: ['build-panel'],
  },
  [TutorialStepId.UpgradeHero]: {
    id: TutorialStepId.UpgradeHero,
    flag: 'hasUpgradedHero',
    message: '金币已经足够了！点击场上的英雄，将其升级以变得更强吧。',
    // Also spotlights hero-panel (the top-right panel that opens once the
    // hero is selected) - the step's actual completion action is clicking
    // that panel's "升级" button, not the hero sprite itself, so the hole
    // has to cover both or the button stays unreachable behind the blocker.
    targets: ['placed-hero', 'hero-equipment-panel'],
  },
  [TutorialStepId.EquipItem]: {
    id: TutorialStepId.EquipItem,
    flag: 'hasEquippedItem',
    message: '获得了新装备！点击背包中的道具，将它装备到已选中的英雄身上吧。',
    targets: ['inventory-panel', 'hero-equipment-panel'],
  },
  [TutorialStepId.SeenPrestige]: {
    id: TutorialStepId.SeenPrestige,
    flag: 'hasSeenPrestige',
    message: '常规的强化已经无法应对这种强敌，进行转生，获取永恒星火来突破极限吧！',
    targets: ['ascension-button'],
  },
};

/**
 * One step active at a time, in whatever order gameplay naturally triggers
 * them - this class never enforces PlaceFirstHero -> UpgradeHero -> ...
 * ordering itself, it just refuses to activate a new step while one's
 * already showing (see each check-/notify- method's guard), so the real
 * ordering falls out of the fact that e.g. UpgradeHero's own trigger
 * condition can't be true until a hero already exists to upgrade.
 */
export class TutorialManager {
  private activeStepId: TutorialStepId | null = null;

  /** The step currently wanting the screen, or null if nothing's active - main.ts's per-frame render reads this to (re)build the spotlight overlay, and clears it back to nothing once this goes null. */
  get activeStep(): TutorialStepDefinition | null {
    return this.activeStepId ? TUTORIAL_STEPS[this.activeStepId] : null;
  }

  get isActive(): boolean {
    return this.activeStepId !== null;
  }

  private isDone(flag: keyof TutorialFlags): boolean {
    return getTutorialFlags()[flag];
  }

  private activate(stepId: TutorialStepId): void {
    if (this.activeStepId !== null || this.isDone(TUTORIAL_STEPS[stepId].flag)) {
      return;
    }
    this.activeStepId = stepId;
  }

  /** Wave 1 (index 0) just started with no hero on the field yet - main.ts calls this every frame while gameplay's running; the guards above make repeated calls harmless. */
  checkPlaceFirstHeroTrigger(waveIndex: number, heroCount: number): void {
    if (waveIndex === 0 && heroCount === 0) {
      this.activate(TutorialStepId.PlaceFirstHero);
    }
  }

  /** At least one hero exists and current gold already covers `cheapestUpgradeCost` (the cheapest of any placed hero's own getUpgradeCost()) - "玩家金币首次达到升级所需额度". */
  checkUpgradeHeroTrigger(gold: number, cheapestUpgradeCost: number): void {
    if (gold >= cheapestUpgradeCost) {
      this.activate(TutorialStepId.UpgradeHero);
    }
  }

  /** Event-driven (not a per-frame poll, unlike the two check* methods above) - main.ts calls this straight from GameManager's onLootDropped callback, the instant the first piece of equipment ever drops. */
  notifyLootDropped(): void {
    this.activate(TutorialStepId.EquipItem);
  }

  /** Event-driven, called from GameManager's onGameOver callback - `waveReached` is the 1-based wave the run was on when baseHp hit 0 (WaveManager.currentIndex + 1), so a wipe *during* wave 20 (not just after fully clearing it) already counts, matching the spec's "第 20 波以后团灭". */
  notifyGameOver(waveReached: number): void {
    if (waveReached >= 20) {
      this.activate(TutorialStepId.SeenPrestige);
    }
  }

  /**
   * Marks the active step's flag permanently done and persists it right
   * away (same "irreversible progress saves immediately" rule
   * TalentManager.upgradeTalent follows), then clears activeStepId so the
   * overlay comes down. Callable either because the player performed the
   * step's real action (placed a hero, clicked upgrade, equipped an item,
   * clicked Ascension) or dismissed the dialog directly - both count as
   * "seen", and either path uses this exact same method so there's only
   * ever one way a step actually ends. No-op if nothing's active.
   */
  completeActiveStep(): void {
    if (this.activeStepId === null) {
      return;
    }
    setTutorialFlag(TUTORIAL_STEPS[this.activeStepId].flag, true);
    saveMeta();
    this.activeStepId = null;
  }
}
