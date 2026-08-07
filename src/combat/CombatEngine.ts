import { MechanicTag, type StatusEffectConfig } from '../data/skills/skillTypes';
import { BattleHero } from './BattleHero';
import { BattleEnemy } from './BattleEnemy';
import type { SkillAction } from './SkillAction';
import { Projectile } from './Projectile';
import { cellKey, isPathCell, type GridCell } from './gridConfig';

/** Armor-formula constant: actualDamage = rawDamage * (ARMOR_CONSTANT / (ARMOR_CONSTANT + defense)). */
const ARMOR_CONSTANT = 100;
/** Execute triggers once a target's HP falls at or below this fraction of its max HP. */
const EXECUTE_HP_THRESHOLD_RATIO = 0.2;
/** Fraction of total damage dealt by a LifeSteal skill that's returned to the caster as healing. */
const LIFESTEAL_RATIO = 0.3;

export interface DamageDealtEvent {
  source: BattleHero;
  target: BattleEnemy;
  skillAction: SkillAction;
  amount: number;
  wasExecuted: boolean;
}

export interface CombatEngineCallbacks {
  onDamageDealt?: (event: DamageDealtEvent) => void;
  /** Fired once per enemy the instant its HP hits 0, before it's dropped from the engine. */
  onEnemyDefeated?: (enemy: BattleEnemy) => void;
  /** Fired once per enemy that walks past ENEMY_PATH's final waypoint - not a kill (no reward), just "it got through". A future base-HP system reacts here instead of anything in this engine. */
  onEnemyReachedEnd?: (enemy: BattleEnemy) => void;
}

/**
 * Owns a single encounter's BattleHero/BattleEnemy instances and steps them
 * forward together. Each CombatEngine instance is a fully isolated battle -
 * nothing here reads or writes shared/global state; rewards and other
 * side effects flow out only through the callbacks passed at construction.
 * Targeting is fully positional: a hero's ready skill only actually fires
 * once findTargetsInRange confirms a live enemy is within that skill's
 * range of the hero's real x/y (see BattleHero/BattleEnemy, both grid-
 * placed since step 9/11) - a skill with nothing in range simply stays
 * ready and is re-checked next tick, never wasted on an empty swing.
 */
export class CombatEngine {
  private readonly heroes = new Map<string, BattleHero>();
  private readonly enemies = new Map<string, BattleEnemy>();
  private readonly projectiles = new Map<string, Projectile>();
  private nextProjectileId = 0;
  private readonly callbacks: CombatEngineCallbacks;
  /** Grid occupancy: cellKey(col, row) -> the hero instanceId placed there. Only cells populated via addHeroAtCell are tracked - addHero alone (e.g. test-run.ts's headless setup) never touches this. */
  private readonly occupiedCells = new Map<string, string>();

  constructor(callbacks: CombatEngineCallbacks = {}) {
    this.callbacks = callbacks;
  }

  addHero(hero: BattleHero): void {
    this.heroes.set(hero.instanceId, hero);
  }

  /**
   * Registers `hero` as occupying grid cell `cell` and adds it to the
   * engine. Callers (GameManager.tryPlaceHero) are expected to have already
   * checked isCellOccupied - this throws instead of silently overwriting if
   * that invariant's ever violated, rather than letting two heroes stack
   * unnoticed.
   */
  addHeroAtCell(hero: BattleHero, cell: GridCell): void {
    const key = cellKey(cell.col, cell.row);
    if (this.occupiedCells.has(key)) {
      throw new Error(`CombatEngine: grid cell (${cell.col}, ${cell.row}) is already occupied`);
    }
    this.occupiedCells.set(key, hero.instanceId);
    this.addHero(hero);
  }

  /** True if a hero already sits at (col, row), or the cell lies on ENEMY_PATH - the enemy route counts as permanently occupied so it can never be built on. */
  isCellOccupied(col: number, row: number): boolean {
    return isPathCell(col, row) || this.occupiedCells.has(cellKey(col, row));
  }

  addEnemy(enemy: BattleEnemy): void {
    this.enemies.set(enemy.instanceId, enemy);
  }

  getHeroes(): BattleHero[] {
    return [...this.heroes.values()];
  }

  /** Single-hero lookup by instanceId - what GameManager.tryUpgradeHero/tryEvolveHero use, so callers don't have to filter getHeroes() themselves. */
  getHero(instanceId: string): BattleHero | undefined {
    return this.heroes.get(instanceId);
  }

  getAliveEnemies(): BattleEnemy[] {
    return [...this.enemies.values()].filter((enemy) => enemy.isAlive);
  }

  getProjectiles(): Projectile[] {
    return [...this.projectiles.values()];
  }

  /**
   * Advances the whole encounter by deltaTime seconds: ticks enemy status
   * effects/movement, lets each hero's cooldowns tick down and fire
   * whatever skill comes up ready (instantly for a melee skill, via a
   * homing Projectile for a ranged one), advances in-flight projectiles
   * and resolves any that just landed, then sweeps up anything that died
   * or escaped this tick.
   */
  update(deltaTime: number): void {
    for (const enemy of this.enemies.values()) {
      enemy.update(deltaTime);
    }

    for (const hero of this.heroes.values()) {
      const readySkillId = hero.update(deltaTime);
      if (!readySkillId) {
        continue;
      }

      const definition = hero.getSkillDefinition(readySkillId);
      if (!definition) {
        continue;
      }

      const isAoE = definition.mechanicTags.includes(MechanicTag.AoE);
      const targets = this.findTargetsInRange(hero, definition.range, isAoE);
      if (targets.length === 0) {
        // Nothing's walked into range yet - skip the cast entirely so the
        // cooldown isn't spent on an empty swing; isSkillReady stays true
        // and this same skill gets re-checked again next tick.
        continue;
      }

      const action = hero.executeSkill(readySkillId);

      if (definition.projectileSpeed !== undefined) {
        // Ranged skills are always single-target in this engine (one
        // projectile, one homing target) regardless of the AoE tag -
        // targets[0] is the nearest in-range enemy either way, since
        // findTargetsInRange only returns more than one entry for AoE.
        this.spawnProjectile(hero, targets[0], definition.projectileSpeed, action, definition.statusEffectOnHit);
      } else {
        this.resolveSkillAction(hero, action, targets);
      }
    }

    this.updateProjectiles(deltaTime);
    this.cleanupRemovedEnemies();
  }

  private spawnProjectile(
    caster: BattleHero,
    target: BattleEnemy,
    speed: number,
    skillAction: SkillAction,
    statusEffect: StatusEffectConfig | undefined,
  ): void {
    this.nextProjectileId += 1;
    const projectile = new Projectile({
      instanceId: `projectile-${this.nextProjectileId}`,
      caster,
      target,
      speed,
      skillAction,
      statusEffect,
      startPosition: { x: caster.x, y: caster.y },
    });
    this.projectiles.set(projectile.instanceId, projectile);
  }

  /**
   * Advances every in-flight projectile, resolving (and removing) any that
   * reached their target this tick. A projectile whose target has died or
   * escaped since launch is dropped without resolving anything - it homes
   * on a live reference, so the object stays readable even after
   * cleanupRemovedEnemies drops it from `enemies`, but there's nothing
   * meaningful left to hit.
   */
  private updateProjectiles(deltaTime: number): void {
    for (const [id, projectile] of this.projectiles) {
      if (!this.enemies.has(projectile.target.instanceId) || !projectile.target.isAlive) {
        this.projectiles.delete(id);
        continue;
      }

      projectile.update(deltaTime);

      if (projectile.hasReachedTarget) {
        this.resolveProjectileHit(projectile);
        this.projectiles.delete(id);
      }
    }
  }

  /** Reuses resolveDamageAgainst (same armor/execute math and onDamageDealt event a melee hit gets) for the projectile's damage, then applies its statusEffect (if any) on top. */
  private resolveProjectileHit(projectile: Projectile): void {
    this.resolveDamageAgainst(projectile.caster, projectile.skillAction, projectile.target);
    if (projectile.statusEffect) {
      projectile.target.applyStatus(projectile.statusEffect);
    }
  }

  /**
   * Live enemies within `range` pixels of `hero`'s position, nearest
   * first. A single-target skill only ever gets the closest one; an AoE
   * skill gets every enemy the range circle reaches.
   */
  private findTargetsInRange(hero: BattleHero, range: number, isAoE: boolean): BattleEnemy[] {
    const inRange = this.getAliveEnemies()
      .map((enemy) => ({ enemy, distance: Math.hypot(enemy.x - hero.x, enemy.y - hero.y) }))
      .filter((entry) => entry.distance <= range)
      .sort((a, b) => a.distance - b.distance);

    if (inRange.length === 0) {
      return [];
    }
    return isAoE ? inRange.map((entry) => entry.enemy) : [inRange[0].enemy];
  }

  /** `targets` is already the exact set findTargetsInRange picked (single nearest, or every in-range enemy for AoE) - no further filtering happens here. */
  private resolveSkillAction(caster: BattleHero, action: SkillAction, targets: BattleEnemy[]): void {
    let totalDamageDealt = 0;
    for (const target of targets) {
      totalDamageDealt += this.resolveDamageAgainst(caster, action, target);
    }

    if (action.mechanicTags.includes(MechanicTag.LifeSteal) && totalDamageDealt > 0) {
      const healAmount = totalDamageDealt * LIFESTEAL_RATIO;
      caster.stats.currentHp = Math.min(caster.stats.maxHp, caster.stats.currentHp + healAmount);
    }
  }

  /** Applies one skill's damage to a single target and returns the actual HP lost. */
  private resolveDamageAgainst(caster: BattleHero, action: SkillAction, target: BattleEnemy): number {
    const isExecute =
      action.mechanicTags.includes(MechanicTag.Execute) && target.currentHp / target.maxHp <= EXECUTE_HP_THRESHOLD_RATIO;

    let actualDamage: number;
    if (isExecute) {
      // Ignores armor entirely - the whole point of Execute is bypassing mitigation on a near-dead target.
      actualDamage = target.currentHp;
    } else {
      const rawDamage = action.sourceAttack * action.damageMultiplier;
      actualDamage = rawDamage * (ARMOR_CONSTANT / (ARMOR_CONSTANT + target.defense));
    }

    target.currentHp = Math.max(0, target.currentHp - actualDamage);

    this.callbacks.onDamageDealt?.({
      source: caster,
      target,
      skillAction: action,
      amount: actualDamage,
      wasExecuted: isExecute,
    });

    return actualDamage;
  }

  /** Drops both enemies that died to damage this tick (onEnemyDefeated, with reward) and enemies that walked past the path's end (onEnemyReachedEnd, no reward) - the two are mutually exclusive per enemy since reaching the end doesn't zero its HP. */
  private cleanupRemovedEnemies(): void {
    for (const [instanceId, enemy] of this.enemies) {
      if (!enemy.isAlive) {
        this.enemies.delete(instanceId);
        this.callbacks.onEnemyDefeated?.(enemy);
      } else if (enemy.hasReachedEnd) {
        this.enemies.delete(instanceId);
        this.callbacks.onEnemyReachedEnd?.(enemy);
      }
    }
  }
}
