import { StatusEffectType, type StatusEffectConfig } from '../data/skills/skillTypes';
import { ENEMY_PATH, CELL_SIZE, gridCellCenter } from './gridConfig';
import type { BattleHero } from './BattleHero';

/** A StatusEffectConfig plus its own live countdown - what applyStatus actually pushes onto activeStatuses. */
export interface ActiveStatusEffect extends StatusEffectConfig {
  /** Seconds remaining before this status expires and is removed. */
  remaining: number;
}

/** Boss-only periodic AoE pulse - see BattleEnemy.aoePulse doc comment. */
export interface AoePulseConfig {
  /** Damage dealt to every alive hero within `radius` px of this enemy each time the pulse fires. */
  damage: number;
  /** Pixel radius of the pulse, centered on this enemy's current position. */
  radius: number;
  /** Seconds between pulses. */
  interval: number;
}

/** Boss-only enrage threshold - see BattleEnemy.enrage doc comment. */
export interface EnrageConfig {
  /** Once currentHp / maxHp drops to/below this fraction, effectiveAttackDamage starts applying `damageMultiplier`. */
  hpThreshold: number;
  /** Multiplier applied to attackDamage while enraged (e.g. 1.8 = 80% harder-hitting). */
  damageMultiplier: number;
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
  /** Damage dealt to a single engaged hero each time this enemy's attack lands - see effectiveAttackDamage for the enraged variant. */
  attackDamage: number;
  /** Pixel distance within which this enemy stops moving and engages the nearest alive hero instead. */
  attackRange: number;
  /** Attacks per second against an engaged hero - converted to a cooldown of 1/attackSpeed seconds between hits. */
  attackSpeed: number;
  /** Boss-only: periodic AoE pulse hitting every alive hero in radius, independent of the single-target attack. Omitted for regular enemies. */
  aoePulse?: AoePulseConfig;
  /** Boss-only: attack-damage buff once low on HP. Omitted for regular enemies. */
  enrage?: EnrageConfig;
  /** True for boss/elite enemies - what InventoryManager.rollLootFor gates a random equipment drop on when this enemy is defeated. Defaults to false. */
  isElite?: boolean;
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
  readonly attackDamage: number;
  readonly attackRange: number;
  readonly attackSpeed: number;
  readonly aoePulse?: AoePulseConfig;
  readonly enrage?: EnrageConfig;
  readonly isElite: boolean;
  /** Live Slow/DOT effects currently applied - see applyStatus. Ticked down and resolved (DOT damage, expiry) every update() call. */
  readonly activeStatuses: ActiveStatusEffect[] = [];

  /** World-space position, advanced each update() tick toward ENEMY_PATH[currentWaypointIndex]. */
  x: number;
  y: number;
  /** Index into ENEMY_PATH of the waypoint this enemy is currently walking toward. */
  currentWaypointIndex = 0;
  private reachedEnd = false;
  /** Seconds until this enemy's next single-target attack is ready - starts at 0 so the very first hero it engages gets hit immediately, no idle wind-up. */
  private attackCooldownRemaining = 0;
  /** Seconds until this enemy's next AoE pulse is ready - starts at the pulse's own interval (not 0) so a boss doesn't detonate the instant it spawns, before it's even reached a hero. */
  private aoePulseCooldownRemaining: number;

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
    this.attackDamage = config.attackDamage;
    this.attackRange = config.attackRange;
    this.attackSpeed = config.attackSpeed;
    this.aoePulse = config.aoePulse;
    this.enrage = config.enrage;
    this.isElite = config.isElite ?? false;
    this.aoePulseCooldownRemaining = config.aoePulse?.interval ?? 0;

    const start = gridCellCenter(ENEMY_PATH[0].col, ENEMY_PATH[0].row);
    this.x = start.x;
    this.y = start.y;
  }

  get isAlive(): boolean {
    return this.currentHp > 0;
  }

  /** True once currentHp/maxHp drops to/below enrage.hpThreshold - drives effectiveAttackDamage. Always false for enemies with no enrage config. Computed live off currentHp rather than latched, so it also reflects HP changes CombatEngine applies directly (resolveDamageAgainst mutates currentHp outside this class). */
  private get isEnraged(): boolean {
    return this.enrage !== undefined && this.currentHp / this.maxHp <= this.enrage.hpThreshold;
  }

  /** attackDamage, boosted by enrage.damageMultiplier once isEnraged - what CombatEngine.resolveEnemyAttack actually applies, instead of the raw base stat. */
  get effectiveAttackDamage(): number {
    return this.isEnraged ? this.attackDamage * this.enrage!.damageMultiplier : this.attackDamage;
  }

  /** True once attackCooldownRemaining has counted down to 0 - CombatEngine only resolves a hit while this is true, then calls commitAttack to reset it. */
  get isAttackReady(): boolean {
    return this.attackCooldownRemaining <= 0;
  }

  /** True once aoePulseCooldownRemaining has counted down to 0 - always false for an enemy with no aoePulse config, since that field stays undefined. */
  get isAoePulseReady(): boolean {
    return this.aoePulse !== undefined && this.aoePulseCooldownRemaining <= 0;
  }

  /** Resets the attack cooldown to 1/attackSpeed seconds - called by CombatEngine immediately after it resolves a hit. */
  commitAttack(): void {
    this.attackCooldownRemaining = 1 / this.attackSpeed;
  }

  /** Resets the AoE pulse cooldown to aoePulse.interval seconds - called by CombatEngine immediately after it resolves a pulse. No-op if this enemy has no aoePulse config. */
  commitAoePulse(): void {
    if (this.aoePulse) {
      this.aoePulseCooldownRemaining = this.aoePulse.interval;
    }
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
   * status's remaining duration, drops whatever just expired, ticks the
   * attack/AoE-pulse cooldowns, and - unless `engagedHero` names a live
   * hero this tick (CombatEngine's job to find, via range/distance against
   * every hero's real position, the same way findTargetsInRange works the
   * other direction) - advances this enemy one step along ENEMY_PATH at
   * its Slow-adjusted speed. While engaged the enemy holds its ground
   * instead of moving; CombatEngine is what actually resolves the attack
   * once isAttackReady flips true, this method only manages cooldown state
   * and the move/stand decision. DOT damage lands here regardless of
   * whether any hero is still in range or even alive - the effect is
   * already "in" the enemy, not something a caster keeps sustaining.
   */
  update(deltaTime: number, engagedHero: BattleHero | null = null): void {
    this.tickStatuses(deltaTime);
    this.tickCombatCooldowns(deltaTime);

    if (engagedHero) {
      return;
    }

    this.moveAlongPath(deltaTime);
  }

  private tickCombatCooldowns(deltaTime: number): void {
    if (this.attackCooldownRemaining > 0) {
      this.attackCooldownRemaining = Math.max(0, this.attackCooldownRemaining - deltaTime);
    }
    if (this.aoePulseCooldownRemaining > 0) {
      this.aoePulseCooldownRemaining = Math.max(0, this.aoePulseCooldownRemaining - deltaTime);
    }
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
