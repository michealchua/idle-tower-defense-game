import { StatusEffectType, type StatusEffectConfig } from '../data/skills/skillTypes';
import { ENEMY_PATH, CELL_SIZE, gridCellCenter } from './gridConfig';

/** A StatusEffectConfig plus its own live countdown - what applyStatus actually pushes onto activeStatuses. */
export interface ActiveStatusEffect extends StatusEffectConfig {
  /** Seconds remaining before this status expires and is removed. */
  remaining: number;
}

export interface BattleEnemyConfig {
  instanceId: string;
  archetypeId: string;
  maxHp: number;
  defense: number;
  /** Cells per second along ENEMY_PATH - converted to px/sec (see move()) via CELL_SIZE. */
  speed: number;
  goldReward: number;
  expReward: number;
  /** How much GameManager's baseHp drops if this enemy walks past ENEMY_PATH's final waypoint uncontested. */
  baseDamage: number;
}

/** Once the distance to the current target waypoint drops below this, the enemy is considered to have arrived and advances to the next one - small enough that "close enough" never reads as a visible stutter. */
const WAYPOINT_ARRIVAL_THRESHOLD_PX = 2;

/** Upper bound on how much stacked Slow effects can reduce speed by - keeps an enemy hit by several slows at once crawling rather than freezing solid (0 speed would never reach a waypoint, so hasReachedEnd/isWaveComplete could never fire for it). */
const MAX_SLOW_FRACTION = 0.9;

/**
 * Battlefield-scoped enemy model, sibling to BattleHero - owns everything a
 * live encounter needs: position along ENEMY_PATH, HP, defense, and
 * activeStatuses (Slow/DOT effects applied by hero skills/projectiles).
 * Archetype/scaling data is resolved by the caller into a
 * BattleEnemyConfig before construction so this class stays independent of
 * any specific enemy-data source.
 */
export class BattleEnemy {
  readonly instanceId: string;
  readonly archetypeId: string;
  readonly maxHp: number;
  currentHp: number;
  defense: number;
  readonly speed: number;
  readonly goldReward: number;
  readonly expReward: number;
  readonly baseDamage: number;
  /** Live Slow/DOT effects currently applied - see applyStatus. Ticked down and resolved (DOT damage, expiry) every update() call. */
  readonly activeStatuses: ActiveStatusEffect[] = [];

  /** World-space position, advanced each update() tick toward ENEMY_PATH[currentWaypointIndex]. */
  x: number;
  y: number;
  /** Index into ENEMY_PATH of the waypoint this enemy is currently walking toward. */
  currentWaypointIndex = 0;
  private reachedEnd = false;

  constructor(config: BattleEnemyConfig) {
    this.instanceId = config.instanceId;
    this.archetypeId = config.archetypeId;
    this.maxHp = config.maxHp;
    this.currentHp = config.maxHp;
    this.defense = config.defense;
    this.speed = config.speed;
    this.goldReward = config.goldReward;
    this.expReward = config.expReward;
    this.baseDamage = config.baseDamage;

    const start = gridCellCenter(ENEMY_PATH[0].col, ENEMY_PATH[0].row);
    this.x = start.x;
    this.y = start.y;
  }

  get isAlive(): boolean {
    return this.currentHp > 0;
  }

  /** True once this enemy has walked past ENEMY_PATH's final waypoint - CombatEngine drops it from the encounter without treating it as a kill (no gold/exp reward; GameManager's baseHp system reacts here instead). */
  get hasReachedEnd(): boolean {
    return this.reachedEnd;
  }

  /** Pushes a fresh, independently-timed status effect onto activeStatuses - stacks with any existing ones of the same type rather than replacing/refreshing them (two Slow hits add their magnitudes, up to MAX_SLOW_FRACTION; two DOTs both tick simultaneously). */
  applyStatus(config: StatusEffectConfig): void {
    this.activeStatuses.push({ ...config, remaining: config.duration });
  }

  /** Combined Slow magnitude across every active Slow effect, clamped to MAX_SLOW_FRACTION so movement never fully stops. */
  private get totalSlowFraction(): number {
    const sum = this.activeStatuses
      .filter((status) => status.type === StatusEffectType.Slow)
      .reduce((total, status) => total + status.magnitude, 0);
    return Math.min(sum, MAX_SLOW_FRACTION);
  }

  /** Combined damage/second across every active DOT effect. */
  private get totalDotDamagePerSecond(): number {
    return this.activeStatuses
      .filter((status) => status.type === StatusEffectType.Dot)
      .reduce((total, status) => total + status.magnitude, 0);
  }

  /**
   * Resolves DOT damage and Slow's movement penalty, decays every active
   * status's remaining duration, drops whatever just expired, and advances
   * this enemy one step along ENEMY_PATH at its Slow-adjusted speed. DOT
   * damage lands here regardless of whether any hero is still in range or
   * even alive - the effect is already "in" the enemy, not something a
   * caster keeps sustaining.
   */
  update(deltaTime: number): void {
    this.tickStatuses(deltaTime);
    this.moveAlongPath(deltaTime);
  }

  private tickStatuses(deltaTime: number): void {
    const dotDamage = this.totalDotDamagePerSecond * deltaTime;
    if (dotDamage > 0) {
      this.currentHp = Math.max(0, this.currentHp - dotDamage);
    }

    for (let i = this.activeStatuses.length - 1; i >= 0; i -= 1) {
      this.activeStatuses[i].remaining -= deltaTime;
      if (this.activeStatuses[i].remaining <= 0) {
        this.activeStatuses.splice(i, 1);
      }
    }
  }

  /**
   * Steps straight toward the center of ENEMY_PATH[currentWaypointIndex].
   * Recomputing the direction fresh from the enemy's *current* position
   * every tick (rather than caching a heading) is what makes corners turn
   * cleanly: the moment a waypoint is reached, the very next tick already
   * aims at the next one, with no separate "rotate in place" step.
   */
  private moveAlongPath(deltaTime: number): void {
    if (this.reachedEnd) {
      return;
    }

    const target = ENEMY_PATH[this.currentWaypointIndex];
    const targetPosition = gridCellCenter(target.col, target.row);
    const dx = targetPosition.x - this.x;
    const dy = targetPosition.y - this.y;
    const distance = Math.hypot(dx, dy);

    if (distance < WAYPOINT_ARRIVAL_THRESHOLD_PX) {
      if (this.currentWaypointIndex >= ENEMY_PATH.length - 1) {
        this.reachedEnd = true;
      } else {
        this.currentWaypointIndex += 1;
      }
      return;
    }

    const pixelsPerSecond = this.speed * (1 - this.totalSlowFraction) * CELL_SIZE;
    const step = Math.min(pixelsPerSecond * deltaTime, distance);
    this.x += (dx / distance) * step;
    this.y += (dy / distance) * step;
  }
}
