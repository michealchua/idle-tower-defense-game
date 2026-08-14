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
  hitReaction: 0.18,
  particleBurst: 0.55,
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
  // Enemy-on-hero chip damage (CombatSystem.tickEnemyAttacksOnHeroes) - much
  // lighter than a hero's own crit shake so a long fight's steady trickle of
  // enemy hits reads as an ambient rumble, not a constant jolt.
  heroHitIntensity: 1,
  // A hero actually going down (HeroState.isDowned flipping true) - the
  // squad-wipe lose condition is creeping closer, so this is the second-
  // strongest shake in the game after a boss impact.
  heroDownIntensity: 7,
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
  heroDownSeconds: 0.12,
} as const;

// Per-preset particle counts/speed/color for EffectsSystem.spawnParticleBurst
// - speed is logical px/sec (particles travel outward in a straight line
// from spawn point, see CanvasRenderer's 'particleBurst' draw case), count is
// deliberately small (one VisualEffect slot holds the whole burst, but a
// dense multi-fight scene still redraws every particle every frame).
export const particleBurstConfig = {
  crit: { count: 6, speed: 90, color: '#ffd54f' },
  kill: { count: 8, speed: 70, color: '#e0e0e0' },
  bossKill: { count: 16, speed: 130, color: '#ff6d00' },
  skillImpact: { count: 5, speed: 60, color: '#ff8a65' },
  heroDown: { count: 10, speed: 65, color: '#ff5252' },
} as const;

// How long the "a boss/miniboss just appeared" dramatic pause lasts (see
// GameState.bossIntroRemaining) - long enough for BattleScreen's banner to
// actually be readable, short enough not to feel like the game hung.
export const bossIntroConfig = {
  seconds: 1.4,
} as const;
