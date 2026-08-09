// Step 26's offline-reward "loot burst" particle system - a standalone
// physics/animation layer independent of CombatEngine (particles aren't
// game entities, they never affect combat state) so it can run before
// GameManager.start() is even called (the offline-claim burst happens
// while the player is still looking at the Welcome Back panel) and keeps
// GameRenderer's own render() a pure read layer over it, same as every
// other entity type that renderer draws.

/** What a particle visually represents - drives both its fallback color (see PARTICLE_COLORS) and which of ParticleBurstTargets it seeks toward. */
export enum ParticleType {
  Gold = 'gold',
  Fragment = 'fragment',
  Equipment = 'equipment',
}

export enum ParticleState {
  /** Freshly spawned: gravity-affected, frictioned ballistic arc away from the burst origin - the "fountain" look. */
  Scatter = 'scatter',
  /** After scatterDuration elapses: gravity is ignored, velocity eases (lerps) toward a direct line at the target, accelerating in. */
  Seek = 'seek',
}

export interface Particle {
  readonly id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly type: ParticleType;
  /** Fallback fill color GameRenderer draws this particle as - a real per-type sprite path could replace this later without changing the physics/state machine below at all. */
  readonly sprite: string;
  /** Seconds this particle has existed, counted up (not down) each update() - compared against scatterDuration to decide the Scatter -> Seek transition. */
  lifeTime: number;
  /** Randomized 0.8-1.2s per particle (spec) - independent per particle so a whole burst doesn't visibly snap into Seek on the same frame. */
  readonly scatterDuration: number;
  readonly targetX: number;
  readonly targetY: number;
  state: ParticleState;
  /** Fraction of the total reward this single particle represents - added to the running total once it arrives (see ParticleArrivedEvent), not divided evenly by particle *count* alone (the last particle of a type absorbs any remainder so the sum across a whole burst is always exactly the reward total). */
  readonly value: number;
  rotation: number;
  rotationSpeed: number;
  scale: number;
}

export interface ParticleArrivedEvent {
  type: ParticleType;
  value: number;
}

export interface ParticleBurstRewards {
  gold: number;
  memoryFragments: number;
  /** Item *count*, not the items themselves - ParticleManager only deals in numbers; the caller (main.ts) is what maps "an Equipment particle arrived" events back onto actual EquipmentItem instances to add to the inventory, since this module has no reason to know about Equipment.ts at all. */
  equipmentCount: number;
}

export interface ParticleBurstTargets {
  gold: { x: number; y: number };
  fragments: { x: number; y: number };
  equipment: { x: number; y: number };
}

/** Downward acceleration during Scatter, px/s^2. */
const GRAVITY = 900;
/** Per-tick velocity damping during Scatter (applied as a per-second rate, not a flat per-frame multiplier - see the deltaTime-aware application in update()) - keeps the ballistic arc from feeling like it's flying in a vacuum. */
const FRICTION_PER_SECOND = 0.6;
/** Once a Seek particle is within this many px of its target, it's considered arrived and removed. */
const SEEK_ARRIVAL_RADIUS_PX = 10;
/** How hard a Seek particle accelerates toward its target, px/s^2. */
const SEEK_ACCELERATION = 1600;
/** How quickly a Seek particle's velocity eases toward the "ideal" straight-line-at-target velocity, as a per-second rate - lower reads as a lazier curve in, higher as an almost-instant snap to a straight line. */
const SEEK_STEERING_RATE = 5;
/** Upper bound on how many particles a single reward type spawns, regardless of the underlying total - "为防止卡顿，大量资源可按比例缩减为几十个具有代表性的粒子". */
const MAX_PARTICLES_PER_TYPE = 24;

const PARTICLE_COLORS: Record<ParticleType, string> = {
  [ParticleType.Gold]: '#facc15',
  [ParticleType.Fragment]: '#a78bfa',
  [ParticleType.Equipment]: '#60a5fa',
};

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Owns every currently-flying particle and steps them forward each frame.
 * No rendering of its own (GameRenderer.drawParticles reads getParticles()
 * and draws them) and no audio of its own (main.ts's onArrived handler
 * calls AudioManager.playChime() itself) - this class is purely the
 * physics/state-machine seam between "a burst was requested" and "these
 * many reward units have now visually arrived at their HUD target".
 */
export class ParticleManager {
  private particles: Particle[] = [];
  private nextId = 0;
  private onArrivedHandler: ((event: ParticleArrivedEvent) => void) | undefined;

  /** Registers the single callback fired once per particle that reaches its target - main.ts uses this to actually mutate gold/fragments/inventory and play the chime, keeping this class itself free of any GameManager/AudioManager dependency. */
  setOnArrived(handler: (event: ParticleArrivedEvent) => void): void {
    this.onArrivedHandler = handler;
  }

  getParticles(): readonly Particle[] {
    return this.particles;
  }

  hasActiveParticles(): boolean {
    return this.particles.length > 0;
  }

  /** Spawns a representative burst for all three reward types at once - a no-op per type whose reward total is <= 0, so a burst with e.g. no equipment simply never creates any Equipment particles. */
  spawnBurst(originX: number, originY: number, rewards: ParticleBurstRewards, targets: ParticleBurstTargets): void {
    this.spawnType(ParticleType.Gold, rewards.gold, originX, originY, targets.gold);
    this.spawnType(ParticleType.Fragment, rewards.memoryFragments, originX, originY, targets.fragments);
    this.spawnType(ParticleType.Equipment, rewards.equipmentCount, originX, originY, targets.equipment);
  }

  private spawnType(type: ParticleType, total: number, originX: number, originY: number, target: { x: number; y: number }): void {
    const roundedTotal = Math.round(total);
    if (roundedTotal <= 0) {
      return;
    }

    const count = Math.max(1, Math.min(MAX_PARTICLES_PER_TYPE, roundedTotal));
    const baseValue = Math.floor(roundedTotal / count);
    // Remainder distributed one-per-particle across the first N particles
    // rather than dumped entirely onto the last one - keeps individual
    // particle values from looking lopsided (e.g. 23 particles of 1 and a
    // final particle of 24) while still summing to exactly roundedTotal.
    let remainder = roundedTotal - baseValue * count;

    for (let i = 0; i < count; i += 1) {
      const value = baseValue + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);

      const angle = randomRange(0, Math.PI * 2);
      const speed = randomRange(180, 420);
      this.particles.push({
        id: this.nextId,
        x: originX,
        y: originY,
        // Slight upward bias (-120) on top of the random radial direction -
        // what makes the burst read as an upward "fountain" rather than a
        // perfectly even sphere of directions, per the spec's own framing.
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 120,
        type,
        sprite: PARTICLE_COLORS[type],
        lifeTime: 0,
        scatterDuration: randomRange(0.8, 1.2),
        targetX: target.x,
        targetY: target.y,
        state: ParticleState.Scatter,
        value,
        rotation: randomRange(0, Math.PI * 2),
        rotationSpeed: randomRange(-3, 3),
        scale: randomRange(0.8, 1.2),
      });
      this.nextId += 1;
    }
  }

  /**
   * Advances every particle by deltaTime seconds: Scatter particles fall
   * under gravity with friction-damped velocity until scatterDuration
   * elapses, at which point they flip to Seek and start easing their
   * velocity toward a direct line at their target, accelerating in: once a
   * Seek particle is within SEEK_ARRIVAL_RADIUS_PX of its target it's
   * removed from the pool and onArrivedHandler fires for it. Iterates
   * backward so mid-loop removal (splice) never skips the next entry.
   */
  update(deltaTime: number): void {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i];
      particle.lifeTime += deltaTime;
      particle.rotation += particle.rotationSpeed * deltaTime;

      if (particle.state === ParticleState.Scatter) {
        particle.vy += GRAVITY * deltaTime;
        const frictionFactor = Math.max(0, 1 - FRICTION_PER_SECOND * deltaTime);
        particle.vx *= frictionFactor;
        particle.vy *= frictionFactor;
        particle.x += particle.vx * deltaTime;
        particle.y += particle.vy * deltaTime;

        if (particle.lifeTime >= particle.scatterDuration) {
          particle.state = ParticleState.Seek;
        }
        continue;
      }

      const dx = particle.targetX - particle.x;
      const dy = particle.targetY - particle.y;
      const distance = Math.hypot(dx, dy);

      if (distance <= SEEK_ARRIVAL_RADIUS_PX) {
        this.particles.splice(i, 1);
        this.onArrivedHandler?.({ type: particle.type, value: particle.value });
        continue;
      }

      const desiredVx = (dx / distance) * SEEK_ACCELERATION;
      const desiredVy = (dy / distance) * SEEK_ACCELERATION;
      const steer = Math.min(1, deltaTime * SEEK_STEERING_RATE);
      particle.vx += (desiredVx - particle.vx) * steer;
      particle.vy += (desiredVy - particle.vy) * steer;
      particle.x += particle.vx * deltaTime;
      particle.y += particle.vy * deltaTime;
      particle.scale = Math.max(0.35, particle.scale - deltaTime * 0.4);
    }
  }

  /** Drops every in-flight particle without firing onArrivedHandler for any of them - a hard stop, not a fast-forward-to-completion. Not currently called by any production path (a burst is short enough to just let finish); kept for symmetry/future use (e.g. leaving combat-test.html mid-burst). */
  clear(): void {
    this.particles = [];
  }
}
