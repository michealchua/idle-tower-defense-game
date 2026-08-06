import { tickCombat } from '../systems/CombatSystem';
import { tickSpawn } from '../systems/SpawnSystem';
import { tickMovement } from '../systems/MovementSystem';
import { tickEnemyAbilities } from '../systems/EnemyAbilitySystem';
import { tickSkills } from '../systems/SkillSystem';
import { tickLevelUp } from '../systems/LevelSystem';
import { tickEffects } from '../systems/EffectsSystem';
import { tickWaveProgress } from '../systems/WaveSystem';
import { tickTowerCombat } from '../systems/TowerSystem';
import { tickSkillPointGain } from '../systems/TalentSystem';
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
      tickSpawn(this.state, FIXED_TIMESTEP_SECONDS);
      tickMovement(this.state, FIXED_TIMESTEP_SECONDS);
      tickEnemyAbilities(this.state, FIXED_TIMESTEP_SECONDS);
      tickCombat(this.state, FIXED_TIMESTEP_SECONDS);
      tickTowerCombat(this.state, FIXED_TIMESTEP_SECONDS);
      tickSkills(this.state, FIXED_TIMESTEP_SECONDS);
      tickLevelUp(this.state);
      tickWaveProgress(this.state, FIXED_TIMESTEP_SECONDS);
      tickSkillPointGain(this.state, FIXED_TIMESTEP_SECONDS);
      tickEffects(this.state, FIXED_TIMESTEP_SECONDS);
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
