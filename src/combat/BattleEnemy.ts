import { MechanicTag } from '../data/skills/skillTypes';
import { ENEMY_PATH, CELL_SIZE, gridCellCenter } from './gridConfig';

/** A timed status effect currently active on an enemy. */
export interface EnemyDebuff {
  tag: MechanicTag;
  /** Seconds remaining before this debuff expires and is removed. */
  remaining: number;
  /** Effect-specific strength (e.g. slow %, bleed damage/sec) - unused by the mechanics implemented so far. */
  magnitude?: number;
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

/**
 * Battlefield-scoped enemy model, sibling to BattleHero - owns only what a
 * live encounter needs (position along ENEMY_PATH, HP, defense, active
 * debuffs). Archetype/scaling data is resolved by the caller into a
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
  readonly debuffs: EnemyDebuff[] = [];

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

  /** True once this enemy has walked past ENEMY_PATH's final waypoint - CombatEngine drops it from the encounter without treating it as a kill (no gold/exp reward; a future base-HP system hooks in here instead). */
  get hasReachedEnd(): boolean {
    return this.reachedEnd;
  }

  applyDebuff(debuff: EnemyDebuff): void {
    this.debuffs.push(debuff);
  }

  hasDebuff(tag: MechanicTag): boolean {
    return this.debuffs.some((debuff) => debuff.tag === tag);
  }

  /** Ticks debuff durations down by deltaTime (seconds), drops any expired ones, and advances this enemy one step along ENEMY_PATH. */
  update(deltaTime: number): void {
    for (let i = this.debuffs.length - 1; i >= 0; i -= 1) {
      this.debuffs[i].remaining -= deltaTime;
      if (this.debuffs[i].remaining <= 0) {
        this.debuffs.splice(i, 1);
      }
    }

    this.moveAlongPath(deltaTime);
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

    const pixelsPerSecond = this.speed * CELL_SIZE;
    const step = Math.min(pixelsPerSecond * deltaTime, distance);
    this.x += (dx / distance) * step;
    this.y += (dy / distance) * step;
  }
}
