import { MAX_VISUAL_EFFECTS, screenShakeConfig } from '../../data/effectConfig';
import type { GameState, VisualEffect } from '../types';

export function tickEffects(state: GameState, deltaSeconds: number): void {
  for (const effect of state.visualEffects) {
    effect.age += deltaSeconds;
  }
  state.visualEffects = state.visualEffects.filter((effect) => effect.age < effect.lifetime);
}

export function spawnVisualEffect(state: GameState, effect: Omit<VisualEffect, 'id' | 'age'>): void {
  // FIFO eviction once over the cap - see MAX_VISUAL_EFFECTS's doc comment.
  // Oldest first since it's the one closest to expiring/least visible anyway.
  if (state.visualEffects.length >= MAX_VISUAL_EFFECTS) {
    state.visualEffects.shift();
  }
  state.visualEffects.push({ ...effect, id: state.nextVisualEffectId, age: 0 });
  state.nextVisualEffectId += 1;
}

// Takes the max rather than adding - overlapping triggers (e.g. a crit
// landing while a boss-impact shake is still decaying) should read as "one
// jolt, whichever is stronger", not stack into an ever-growing wobble.
export function triggerScreenShake(state: GameState, intensity: number): void {
  state.screenShakeIntensity = Math.max(state.screenShakeIntensity, intensity);
}

export function tickScreenShake(state: GameState, deltaSeconds: number): void {
  state.screenShakeIntensity = Math.max(0, state.screenShakeIntensity - screenShakeConfig.decayPerSecond * deltaSeconds);
}

// Same max-not-add semantics as triggerScreenShake, and for the same reason -
// GameLoop.step counts hitStopRemaining down on its own, this only ever
// raises it.
export function triggerHitStop(state: GameState, durationSeconds: number): void {
  state.hitStopRemaining = Math.max(state.hitStopRemaining, durationSeconds);
}
