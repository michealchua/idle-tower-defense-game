import type { StatusEffectConfig } from '../data/skills/skillTypes';
import type { BattleHero } from './BattleHero';
import type { BattleEnemy } from './BattleEnemy';
import type { SkillAction } from './SkillAction';

export interface ProjectileConfig {
  instanceId: string;
  /** Live reference, not just an id - CombatEngine.updateProjectiles reads caster.x/y isn't needed after launch, but resolveDamageAgainst needs the actual BattleHero for its LifeSteal/heal-back path. */
  caster: BattleHero;
  /** Live reference the projectile homes in on every tick, tracking wherever the target has actually moved to - not a snapshot of its position at launch. */
  target: BattleEnemy;
  /** Pixels/second this projectile closes distance at. */
  speed: number;
  /** What CombatEngine.resolveDamageAgainst applies once this projectile actually reaches its target - same payload shape a melee hit resolves, just delivered over time instead of instantly. */
  skillAction: SkillAction;
  /** Applied to the target alongside damage, once this projectile lands - omitted for a plain damage-only bolt. */
  statusEffect?: StatusEffectConfig;
  startPosition: { x: number; y: number };
}

/**
 * Pure geometry + payload data for one in-flight ranged attack - owns no
 * combat-resolution logic itself (CombatEngine.resolveProjectileHit does
 * that, the same way BattleHero.executeSkill only *describes* a melee hit
 * and CombatEngine.resolveDamageAgainst is what actually applies it).
 * update() only ever moves the projectile toward its live target position;
 * CombatEngine is solely responsible for noticing hasReachedTarget and
 * triggering the actual damage/status resolution.
 */
export class Projectile {
  readonly instanceId: string;
  readonly caster: BattleHero;
  readonly target: BattleEnemy;
  readonly speed: number;
  readonly skillAction: SkillAction;
  readonly statusEffect?: StatusEffectConfig;

  x: number;
  y: number;
  private reachedTarget = false;

  constructor(config: ProjectileConfig) {
    this.instanceId = config.instanceId;
    this.caster = config.caster;
    this.target = config.target;
    this.speed = config.speed;
    this.skillAction = config.skillAction;
    this.statusEffect = config.statusEffect;
    this.x = config.startPosition.x;
    this.y = config.startPosition.y;
  }

  /** True the instant this projectile's position reaches (or passes) its target this tick - CombatEngine resolves the hit and removes it from the engine the same tick this flips. */
  get hasReachedTarget(): boolean {
    return this.reachedTarget;
  }

  /**
   * Steps straight toward the target's *current* live position (homing,
   * not a fixed launch-time heading) by up to speed*deltaTime pixels. A
   * large deltaTime spike (or a very close target) can only ever land
   * exactly on the target, never overshoot past it and miss.
   */
  update(deltaTime: number): void {
    if (this.reachedTarget) {
      return;
    }

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const distance = Math.hypot(dx, dy);
    const step = this.speed * deltaTime;

    if (step >= distance) {
      this.x = this.target.x;
      this.y = this.target.y;
      this.reachedTarget = true;
      return;
    }

    this.x += (dx / distance) * step;
    this.y += (dy / distance) * step;
  }
}
