import { MAX_VISUAL_EFFECTS, screenShakeConfig, effectLifetimes } from '../../data/effectConfig';
import type { GameState, SfxEventId, VisualEffect } from '../types';

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

interface ParticleBurstPreset {
  count: number;
  speed: number;
  color: string;
}

// Generates the burst's particle set once at spawn (evenly spaced angles
// plus a little jitter so a fixed count still reads as an organic radial
// pop, not a perfect pinwheel) and pushes it as a single VisualEffect - see
// VisualEffectKind's 'particleBurst' doc comment for why this is one effect
// object carrying N particles rather than N effect objects.
export function spawnParticleBurst(state: GameState, x: number, y: number, preset: ParticleBurstPreset): void {
  const particles = Array.from({ length: preset.count }, (_, index) => {
    const baseAngle = (index / preset.count) * Math.PI * 2;
    const jitter = (Math.random() - 0.5) * ((Math.PI * 2) / preset.count) * 0.6;
    return {
      angle: baseAngle + jitter,
      speed: preset.speed * (0.7 + Math.random() * 0.6),
    };
  });

  spawnVisualEffect(state, {
    kind: 'particleBurst',
    x,
    y,
    particles,
    color: preset.color,
    lifetime: effectLifetimes.particleBurst,
  });
}

// Short-lived, entity-attributed marker CanvasRenderer uses to flash/squash
// whichever specific hero or enemy sprite was just hit - see VisualEffectKind
// 'hitReaction' doc comment. heavy (reused via isCritical) makes the flash/
// squash read stronger - used for a hero's crit-landed target and for a hero
// actually going down, not just any hit.
export function spawnHitReaction(state: GameState, entityKey: string, x: number, y: number, heavy = false): void {
  spawnVisualEffect(state, {
    kind: 'hitReaction',
    x,
    y,
    entityKey,
    isCritical: heavy,
    lifetime: effectLifetimes.hitReaction,
  });
}

// Queues a one-shot audio cue - see SfxEventId's doc comment for why this is
// the engine's only touchpoint with audio at all (no Web Audio import here).
export function queueSfx(state: GameState, event: SfxEventId): void {
  state.pendingSfxEvents.push(event);
}

// Same "marker only, not drawn" contract as spawnHitReaction - see
// VisualEffectKind's 'castPose' doc comment.
export function spawnCastPose(state: GameState, entityKey: string, x: number, y: number): void {
  spawnVisualEffect(state, {
    kind: 'castPose',
    x,
    y,
    entityKey,
    lifetime: effectLifetimes.castPose,
  });
}

// Pure countdown, no max-semantics needed (only one trigger site) and no
// gameplay-pausing side effect - see GameState.victoryPoseRemaining's doc
// comment for why this ticks unconditionally alongside tickEffects/
// tickScreenShake rather than being gated in GameLoop's pause branches.
export function tickVictoryPose(state: GameState, deltaSeconds: number): void {
  state.victoryPoseRemaining = Math.max(0, state.victoryPoseRemaining - deltaSeconds);
}
