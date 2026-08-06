export const effectLifetimes = {
  attackFlash: 0.15,
  deathBurst: 0.3,
  damageNumber: 0.6,
  healNumber: 0.7,
  levelUp: 1,
  milestoneUnlock: 1.5,
  skillImpact: 0.4,
  lightningBolt: 0.2,
  healPulse: 0.4,
  shieldBreak: 0.3,
  revive: 0.5,
  summon: 0.4,
  waveClear: 1.5,
} as const;

// Hard cap on state.visualEffects - a busy horde fight (spawnConfig's late
// tiers put up to 20 enemies on field, batch-spawned) can generate a burst of
// damage numbers/flashes well within one frame. Once over the cap,
// EffectsSystem.spawnVisualEffect evicts the oldest entry per new one instead
// of growing unbounded, keeping CanvasRenderer's per-frame draw cost flat
// regardless of fight size. Comfortably above what a normal fight produces in
// one frame, only actually engages during genuine spam.
export const MAX_VISUAL_EFFECTS = 80;

// Random per-frame canvas offset, in logical px (CanvasRenderer's 400x300
// space) - see CanvasRenderer.renderScene / EffectsSystem.triggerScreenShake.
// bossImpact covers both "a boss/miniboss just spawned" (SpawnSystem) and
// "one just died" (DamageSystem.handleDeath) - same magnitude for both since
// they're the two big-moment beats in a boss wave.
export const screenShakeConfig = {
  criticalIntensity: 2,
  bossImpactIntensity: 9,
  // Linear decay applied every tick (EffectsSystem.tickScreenShake) - at this
  // rate a criticalIntensity shake clears in ~0.1s (barely perceptible jitter)
  // and a bossImpactIntensity one in ~0.45s (a real jolt).
  decayPerSecond: 20,
} as const;

// Freeze-frame durations for GameLoop's hitStopRemaining, in seconds -
// deliberately kept inside the 0.05-0.1s window a freeze frame needs to read
// as "punchy" rather than "the game just stuttered". triggerHitStop takes the
// max of the current value and the new one, so a critical killing blow on a
// boss naturally resolves to bossKillSeconds without needing to sum three
// separate triggers.
export const hitStopConfig = {
  criticalHitSeconds: 0.05,
  killSeconds: 0.06,
  bossKillSeconds: 0.1,
} as const;
