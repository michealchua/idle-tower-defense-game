import { tickCombat, tickEnemyAttacksOnHeroes } from '../systems/CombatSystem';
import { tickSpawn } from '../systems/SpawnSystem';
import { tickMovement } from '../systems/MovementSystem';
import { tickEnemyAbilities } from '../systems/EnemyAbilitySystem';
import { tickSkills } from '../systems/SkillSystem';
import { tickLevelUp } from '../systems/LevelSystem';
import { tickEffects, tickScreenShake } from '../systems/EffectsSystem';
import { tickEquipmentDropFeed } from '../systems/EquipmentSystem';
import { tickWaveProgress, tickTutorialStoryTrigger } from '../systems/WaveSystem';
import { tickGachaWelcomeBonus, tickDailyLoginReward } from '../systems/GachaSystem';
import { tickDailyQuestReset } from '../systems/DailyQuestSystem';
import type { GameState } from '../types';

const FIXED_TIMESTEP_SECONDS = 0.1;

export class GameLoop {
  private accumulatorSeconds = 0;
  private lastTimestampMs: number | null = null;
  private rafHandle: number | null = null;
  private speedMultiplier = 1;

  constructor(
    private readonly state: GameState,
    private readonly onTick: (state: GameState) => void,
  ) {}

  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = multiplier;
  }

  start(): void {
    if (this.rafHandle !== null) {
      return;
    }
    this.lastTimestampMs = null;
    this.rafHandle = requestAnimationFrame(this.step);
  }

  stop(): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  private step = (timestampMs: number): void => {
    if (this.lastTimestampMs === null) {
      this.lastTimestampMs = timestampMs;
    }

    this.accumulatorSeconds += ((timestampMs - this.lastTimestampMs) / 1000) * this.speedMultiplier;
    this.lastTimestampMs = timestampMs;

    while (!this.state.isGameOver && this.accumulatorSeconds >= FIXED_TIMESTEP_SECONDS) {
      tickTutorialStoryTrigger(this.state);

      // Hit-stop freezes gameplay (movement/combat/spawning/etc.) for a few
      // fixed steps on a punchy hit - see DamageSystem.applyDamage/handleDeath
      // and effectConfig.hitStopConfig for what triggers it and for how long.
      // tickEffects/tickScreenShake still run every step regardless, so
      // floating damage numbers and the shake itself keep animating smoothly
      // through the freeze instead of visibly hitching too. A pending
      // StoryDialog (see WaveSystem.tickTutorialStoryTrigger) pauses
      // gameplay the same way, so combat can't progress behind the dialog.
      if (this.state.hitStopRemaining > 0) {
        this.state.hitStopRemaining = Math.max(0, this.state.hitStopRemaining - FIXED_TIMESTEP_SECONDS);
      } else if (this.state.pendingStoryId !== null) {
        // Paused for StoryDialog - only the cosmetic ticks below still run.
      } else {
        tickSpawn(this.state, FIXED_TIMESTEP_SECONDS);
        tickMovement(this.state, FIXED_TIMESTEP_SECONDS);
        tickEnemyAbilities(this.state, FIXED_TIMESTEP_SECONDS);
        tickCombat(this.state, FIXED_TIMESTEP_SECONDS);
        tickEnemyAttacksOnHeroes(this.state, FIXED_TIMESTEP_SECONDS);
        tickSkills(this.state, FIXED_TIMESTEP_SECONDS);
        tickLevelUp(this.state);
        tickWaveProgress(this.state, FIXED_TIMESTEP_SECONDS);
        tickGachaWelcomeBonus(this.state);
        tickDailyLoginReward(this.state);
        tickDailyQuestReset(this.state);
      }
      tickEffects(this.state, FIXED_TIMESTEP_SECONDS);
      tickScreenShake(this.state, FIXED_TIMESTEP_SECONDS);
      tickEquipmentDropFeed(this.state, FIXED_TIMESTEP_SECONDS);
      this.accumulatorSeconds -= FIXED_TIMESTEP_SECONDS;
    }

    this.onTick(this.state);

    if (!this.state.isGameOver) {
      this.rafHandle = requestAnimationFrame(this.step);
    } else {
      this.rafHandle = null;
    }
  };
}
