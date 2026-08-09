import { MechanicTag, type SkillDefinition, type StatusEffectConfig } from '../data/skills/skillTypes';
import { BattleHero } from './BattleHero';
import { BattleEnemy } from './BattleEnemy';
import type { SkillAction } from './SkillAction';
import { Projectile } from './Projectile';
import { cellKey, isPathCell, type GridCell } from './gridConfig';
import { getActiveBiomeMechanics } from './activeBiome';
import { talentManager } from './TalentManager';
import { AffixId, VAMPIRIC_LIFESTEAL_RATIO } from './AffixManager';

/** Armor-formula constant: actualDamage = rawDamage * (ARMOR_CONSTANT / (ARMOR_CONSTANT + defense)). */
const ARMOR_CONSTANT = 100;
/** Execute triggers once a target's HP falls at or below this fraction of its max HP. */
const EXECUTE_HP_THRESHOLD_RATIO = 0.2;
/** Fraction of total damage dealt by a LifeSteal skill that's returned to the caster as healing. */
const LIFESTEAL_RATIO = 0.3;
/** Damage multiplier a crit hit deals before any biome modifier (see activeBiome.ts's modifyCrit - Dark Cave adds on top of this) - a crit roll happens on every hero->enemy hit, not just skills carrying a dedicated mechanic tag, since BattleHeroStats.currentCrit is otherwise never consulted anywhere in this engine. */
const BASE_CRIT_DAMAGE_MULTIPLIER = 1.5;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export interface DamageDealtEvent {
  source: BattleHero;
  target: BattleEnemy;
  skillAction: SkillAction;
  amount: number;
  wasExecuted: boolean;
}

/** Mirrors DamageDealtEvent for the reverse direction (enemy -> hero): a single-target attack or one hero's share of a boss's AoE pulse. */
export interface HeroDamagedEvent {
  source: BattleEnemy;
  target: BattleHero;
  amount: number;
  /** True if this hit is what just dropped the target's HP to 0 (i.e. target.isDead is now true) - same "wasExecuted"-style derived flag DamageDealtEvent carries for the hero->enemy direction. */
  wasLethal: boolean;
}

/** Fired by resolveHealCast (step 23's Priest class) - a hero->hero support cast, distinct from both DamageDealtEvent and HeroDamagedEvent since it's neither damage direction. */
export interface HeroHealedEvent {
  source: BattleHero;
  target: BattleHero;
  amount: number;
  /** True if this heal also removed one of target's active debuffs (see BattleHero.cleanseOneDebuff) - false for a heal skill with cleansesDebuff unset, or one that landed on a target with nothing to cleanse. */
  cleansed: boolean;
}

export interface CombatEngineCallbacks {
  onDamageDealt?: (event: DamageDealtEvent) => void;
  /** Fired once per enemy the instant its HP hits 0, before it's dropped from the engine. */
  onEnemyDefeated?: (enemy: BattleEnemy) => void;
  /** Fired once per enemy that walks past ENEMY_PATH's final waypoint - not a kill (no reward), just "it got through". A future base-HP system reacts here instead of anything in this engine. */
  onEnemyReachedEnd?: (enemy: BattleEnemy) => void;
  /** Fired for every enemy attack or AoE-pulse hit that actually lands on a hero. Heroes are never removed from the engine on death (see BattleHero.isDead) - this is the only per-hit signal GameManager gets, same role onDamageDealt plays for hero->enemy hits. */
  onHeroDamaged?: (event: HeroDamagedEvent) => void;
  /** Fired the instant an enemy is registered via addEnemy - step 22's biome onEnemySpawn hook (Snow Mountain's permanent on-spawn Slow) rides this rather than CombatEngine reaching into ThemeManager itself. */
  onEnemyAdded?: (enemy: BattleEnemy) => void;
  /** Fired every time resolveHealCast (step 23's Priest class) actually lands a heal - GameManager rides this to spawn the "+XX" floating text/green glow visual feedback the spec calls out. */
  onHeroHealed?: (event: HeroHealedEvent) => void;
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
  /** Cloner affix (step 28): counter for generating unique clone instanceIds - see cleanupRemovedEnemies. */
  private nextCloneSuffix = 0;
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
    this.callbacks.onEnemyAdded?.(enemy);
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

  /** Step 27's prestige reset seam: drops every enemy and in-flight projectile (mid-wave stragglers a prestige triggered outside a clean wave boundary would otherwise leave coexisting with the freshly-restarted wave 1) without touching `heroes` or `occupiedCells` at all - GameManager.resetForPrestige resets hero *levels* in place instead of removing them from the field. No callbacks fire for any of this (no onEnemyDefeated/onEnemyReachedEnd) - these enemies weren't killed or escaped, the encounter itself was reset out from under them. */
  clearField(): void {
    this.enemies.clear();
    this.projectiles.clear();
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
      const engagedHero = this.findNearestHeroInRange(enemy);
      enemy.update(deltaTime, engagedHero);

      if (engagedHero && enemy.isAlive && enemy.isAttackReady) {
        this.resolveEnemyAttack(enemy, engagedHero);
      }
      if (enemy.isAlive && enemy.isAoePulseReady) {
        this.resolveEnemyAoePulse(enemy);
      }
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

      // Heal-tagged skills (step 23's Priest class) never target an enemy
      // at all - routed entirely into resolveHealCast instead of the
      // enemy-targeting/damage path below, which a Heal skill's `range: 0`
      // authoring value would otherwise always fail (findTargetsInRange
      // would never find an enemy "in range" of a 0px circle).
      if (definition.mechanicTags.includes(MechanicTag.Heal)) {
        this.resolveHealCast(hero, readySkillId, definition);
        continue;
      }

      const isAoE = definition.mechanicTags.includes(MechanicTag.AoE);
      const isRangedSkill = definition.projectileSpeed !== undefined;
      const effectiveRange = getActiveBiomeMechanics()?.modifyHeroRange?.(definition.range, isRangedSkill) ?? definition.range;
      const targets = this.findTargetsInRange(hero, effectiveRange, isAoE);
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

  /**
   * Step 23's Priest support cast: finds the field's lowest-HP% living ally
   * (see findLowestHpAlly - global search, not range-gated, since a Heal
   * skill's `range` field is nominal/unused for targeting) and, if one
   * needs healing, actually spends the cooldown (via hero.executeSkill) to
   * heal it for sourceAttack * damageMultiplier, run through the active
   * biome's modifyIncomingHeal (Poison Swamp's -30%), then cleanses one
   * debuff off it if `definition.cleansesDebuff` is set. If nobody needs
   * healing, the cooldown is deliberately left unspent - identical to the
   * enemy-targeting path's "no targets in range -> skip, retry next tick"
   * rule, just for a support cast instead of a damage one.
   */
  private resolveHealCast(caster: BattleHero, skillId: string, definition: SkillDefinition): void {
    const target = this.findLowestHpAlly();
    if (!target) {
      return;
    }

    const action = caster.executeSkill(skillId);
    const rawHeal = action.sourceAttack * action.damageMultiplier;
    const healAmount = getActiveBiomeMechanics()?.modifyIncomingHeal?.(rawHeal) ?? rawHeal;
    target.stats.currentHp = Math.min(target.stats.maxHp, target.stats.currentHp + healAmount);

    const cleansed = definition.cleansesDebuff ? target.cleanseOneDebuff() : false;

    this.callbacks.onHeroHealed?.({ source: caster, target, amount: healAmount, cleansed });
  }

  /**
   * The single alive hero with the lowest currentHp/maxHp ratio, but only
   * among heroes actually below full HP (ratio < 1) - a hero already at
   * 100% is never a valid heal target, so a Priest with a fully-healthy
   * roster correctly finds nothing here and skips its cast (see
   * resolveHealCast) rather than "healing" someone for 0. Ties aren't
   * expected to matter (iteration order breaks them arbitrarily) - two
   * heroes at the exact same ratio are functionally equivalent targets.
   */
  private findLowestHpAlly(): BattleHero | null {
    let lowest: BattleHero | null = null;
    let lowestRatio = 1;

    for (const hero of this.heroes.values()) {
      if (!hero.isAlive) {
        continue;
      }
      const ratio = hero.stats.maxHp > 0 ? hero.stats.currentHp / hero.stats.maxHp : 0;
      if (ratio < lowestRatio) {
        lowest = hero;
        lowestRatio = ratio;
      }
    }

    return lowest;
  }

  /** Reuses resolveDamageAgainst (same armor/execute math and onDamageDealt event a melee hit gets) for the projectile's damage, then applies its statusEffect (if any) on top. */
  private resolveProjectileHit(projectile: Projectile): void {
    this.resolveDamageAgainst(projectile.caster, projectile.skillAction, projectile.target);
    if (projectile.statusEffect) {
      projectile.target.applyStatus(projectile.statusEffect);
    }
  }

  /**
   * The nearest alive hero within `enemy`'s own attackRange, or null if
   * none qualifies - the enemy-side mirror of findTargetsInRange, just
   * single-target-only and reading `enemies`' side of the field instead.
   * A dead hero (see BattleHero.isDead) is never a valid target: it can't
   * fight back, but it also isn't the aggro priority once a live hero is
   * available - this simply excludes it entirely, same as an escaped/dead
   * enemy is excluded from getAliveEnemies().
   */
  private findNearestHeroInRange(enemy: BattleEnemy): BattleHero | null {
    let nearest: BattleHero | null = null;
    let nearestDistance = Infinity;

    for (const hero of this.heroes.values()) {
      if (!hero.isAlive) {
        continue;
      }
      const distance = Math.hypot(hero.x - enemy.x, hero.y - enemy.y);
      if (distance <= enemy.attackRange && distance < nearestDistance) {
        nearest = hero;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  /** Resolves one enemy's single-target hit against its engaged hero: same armor-mitigation formula resolveDamageAgainst uses (just enemy.defense/target.defense's roles swapped), applied via BattleHero.takeDamage, then resets the attack cooldown and fires onHeroDamaged. Uses enemy.effectiveAttackDamage rather than the raw attackDamage stat so an enraged boss's higher output is reflected here automatically. Consults the active biome's shouldDodgeEnemyAttack (Desert's melee dodge) before any of that - a dodge still resets the attack cooldown (the enemy did swing, it just missed) but skips damage/the onHeroDamaged event entirely. */
  private resolveEnemyAttack(enemy: BattleEnemy, target: BattleHero): void {
    enemy.commitAttack();

    if (getActiveBiomeMechanics()?.shouldDodgeEnemyAttack?.(target)) {
      return;
    }

    const rawDamage = enemy.effectiveAttackDamage;
    const actualDamage = rawDamage * (ARMOR_CONSTANT / (ARMOR_CONSTANT + target.stats.currentDefense));
    target.takeDamage(actualDamage);
    this.applyVampiricLifesteal(enemy, actualDamage);

    this.callbacks.onHeroDamaged?.({
      source: enemy,
      target,
      amount: actualDamage,
      wasLethal: target.isDead,
    });
  }

  /** Vampiric affix (step 28): heals `enemy` for VAMPIRIC_LIFESTEAL_RATIO of `damageDealt` it just landed on a hero - shared by both resolveEnemyAttack's single-target hit and resolveEnemyAoePulse's per-hero pulse damage, since the spec's "造成的伤害" ("damage dealt") isn't scoped to single-target hits alone. A no-op for an enemy without the Vampiric affix. */
  private applyVampiricLifesteal(enemy: BattleEnemy, damageDealt: number): void {
    if (!enemy.hasAffix(AffixId.Vampiric) || damageDealt <= 0) {
      return;
    }
    enemy.currentHp = Math.min(enemy.maxHp, enemy.currentHp + damageDealt * VAMPIRIC_LIFESTEAL_RATIO);
  }

  /**
   * Resolves a boss's periodic AoE pulse: every alive hero within
   * enemy.aoePulse.radius of the enemy's current position takes
   * aoePulse.damage (flat, no armor mitigation - the whole point of an
   * AoE pulse is that it's unavoidable battlefield damage, not a
   * dodgeable/mitigable single-target hit), one onHeroDamaged event per
   * hero actually hit. No-op (and never called - see isAoePulseReady) for
   * an enemy with no aoePulse config.
   */
  private resolveEnemyAoePulse(enemy: BattleEnemy): void {
    const pulse = enemy.aoePulse;
    if (!pulse) {
      return;
    }
    enemy.commitAoePulse();

    // Step 24's deep-integration requirement: Environmental Adaptation
    // ("按百分比削弱环境Debuff效果") also mitigates a boss's AoE pulse, not
    // just Volcano's burn (BattleHero.applyBurn) - an unavoidable pulse
    // hitting the whole field, independent of positioning or engagement,
    // reads as the same kind of "environmental hazard damage" the talent
    // is meant to blunt, and this is CombatEngine's own direct hero-damage
    // pathway (BattleHero.applyBurn already handles the other one).
    const mitigatedDamage = pulse.damage * (1 - talentManager.getEnvironmentalDamageReduction());

    for (const hero of this.heroes.values()) {
      if (!hero.isAlive) {
        continue;
      }
      const distance = Math.hypot(hero.x - enemy.x, hero.y - enemy.y);
      if (distance > pulse.radius) {
        continue;
      }

      hero.takeDamage(mitigatedDamage);
      this.applyVampiricLifesteal(enemy, mitigatedDamage);
      this.callbacks.onHeroDamaged?.({
        source: enemy,
        target: hero,
        amount: mitigatedDamage,
        wasLethal: hero.isDead,
      });
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
      const rawHeal = totalDamageDealt * LIFESTEAL_RATIO;
      const healAmount = getActiveBiomeMechanics()?.modifyIncomingHeal?.(rawHeal) ?? rawHeal;
      caster.stats.currentHp = Math.min(caster.stats.maxHp, caster.stats.currentHp + healAmount);
    }
  }

  /** Applies one skill's damage to a single target and returns the actual HP lost. Rolls a crit off the caster's currentCrit stat (BASE_CRIT_DAMAGE_MULTIPLIER on a hit, both further adjustable by the active biome's modifyCrit - e.g. Dark Cave) for every non-Execute hit, then gives the biome a last look via modifyOutgoingDamage (Demon Abyss's lifesteal side effect). */
  private resolveDamageAgainst(caster: BattleHero, action: SkillAction, target: BattleEnemy): number {
    const isExecute =
      action.mechanicTags.includes(MechanicTag.Execute) && target.currentHp / target.maxHp <= EXECUTE_HP_THRESHOLD_RATIO;

    let actualDamage: number;
    let isCrit = false;
    if (isExecute) {
      // Ignores armor, crit, AND Shielded (step 28) entirely - Execute's
      // whole point is guaranteeing a kill on a near-dead target, so this
      // sets currentHp to 0 directly rather than going through
      // takeAttackDamage, which would let a Shielded target's shield
      // absorb the "lethal" hit and survive.
      actualDamage = target.currentHp;
      target.currentHp = 0;
    } else {
      const rawDamage = action.sourceAttack * action.damageMultiplier;
      const mitigated = rawDamage * (ARMOR_CONSTANT / (ARMOR_CONSTANT + target.defense));

      const biome = getActiveBiomeMechanics();
      const critRoll = biome?.modifyCrit?.(caster.stats.currentCrit, BASE_CRIT_DAMAGE_MULTIPLIER) ?? {
        chance: caster.stats.currentCrit,
        damageMultiplier: BASE_CRIT_DAMAGE_MULTIPLIER,
      };
      isCrit = Math.random() < clamp01(critRoll.chance);
      actualDamage = isCrit ? mitigated * critRoll.damageMultiplier : mitigated;
      actualDamage = biome?.modifyOutgoingDamage?.(actualDamage, { isCrit, hero: caster, enemy: target }) ?? actualDamage;
      // Shielded (step 28): shield HP absorbs before currentHp does; also
      // rolls Teleporter's on-hit warp reaction - see takeAttackDamage.
      target.takeAttackDamage(actualDamage);
    }

    this.callbacks.onDamageDealt?.({
      source: caster,
      target,
      skillAction: action,
      amount: actualDamage,
      wasExecuted: isExecute,
    });

    return actualDamage;
  }

  /**
   * Drops both enemies that died to damage this tick (onEnemyDefeated, with
   * reward) and enemies that walked past the path's end (onEnemyReachedEnd,
   * no reward) - the two are mutually exclusive per enemy since reaching
   * the end doesn't zero its HP. Cloner-affixed deaths (step 28) are a
   * third case: removed same as any other death, but *without* firing
   * onEnemyDefeated (no gold/exp/loot for the original - "不立即触发结算")
   * - createClone's two copies are queued separately and only actually
   * registered into `enemies` after this loop finishes, never mid-iteration
   * (a Map's iterator does reflect entries inserted during iteration, and
   * while a freshly-spawned, fully-alive clone would just harmlessly fail
   * both the `!isAlive`/`hasReachedEnd` checks if it were visited this same
   * pass, deferring the insert entirely avoids relying on that).
   */
  private cleanupRemovedEnemies(): void {
    const clonesToRegister: BattleEnemy[] = [];

    for (const [instanceId, enemy] of this.enemies) {
      if (!enemy.isAlive) {
        this.enemies.delete(instanceId);
        if (enemy.hasAffix(AffixId.Cloner)) {
          clonesToRegister.push(
            enemy.createClone(`${enemy.instanceId}-clone-${this.nextCloneSuffix}`),
            enemy.createClone(`${enemy.instanceId}-clone-${this.nextCloneSuffix + 1}`),
          );
          this.nextCloneSuffix += 2;
        } else {
          this.callbacks.onEnemyDefeated?.(enemy);
        }
      } else if (enemy.hasReachedEnd) {
        this.enemies.delete(instanceId);
        this.callbacks.onEnemyReachedEnd?.(enemy);
      }
    }

    for (const clone of clonesToRegister) {
      this.addEnemy(clone);
    }
  }
}
