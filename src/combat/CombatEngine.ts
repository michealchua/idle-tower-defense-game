import { MechanicTag } from '../data/skills/skillTypes';
import { BattleHero } from './BattleHero';
import { BattleEnemy } from './BattleEnemy';
import type { SkillAction } from './SkillAction';

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
}

/**
 * Owns a single encounter's BattleHero/BattleEnemy instances and steps them
 * forward together. Each CombatEngine instance is a fully isolated battle -
 * nothing here reads or writes shared/global state; rewards and other
 * side effects flow out only through the callbacks passed at construction.
 */
export class CombatEngine {
  private readonly heroes = new Map<string, BattleHero>();
  private readonly enemies = new Map<string, BattleEnemy>();
  private readonly callbacks: CombatEngineCallbacks;

  constructor(callbacks: CombatEngineCallbacks = {}) {
    this.callbacks = callbacks;
  }

  addHero(hero: BattleHero): void {
    this.heroes.set(hero.instanceId, hero);
  }

  addEnemy(enemy: BattleEnemy): void {
    this.enemies.set(enemy.instanceId, enemy);
  }

  getHeroes(): BattleHero[] {
    return [...this.heroes.values()];
  }

  getAliveEnemies(): BattleEnemy[] {
    return [...this.enemies.values()].filter((enemy) => enemy.isAlive);
  }

  /**
   * Advances the whole encounter by deltaTime seconds: ticks enemy debuffs,
   * lets each hero's cooldowns tick down and fire whatever skill comes up
   * ready, resolves the resulting damage, then sweeps up anything that died
   * this tick.
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

      // No positional targeting yet (see class doc) - "in range" is
      // simulated by simply filtering to whoever's still alive.
      const aliveEnemies = this.getAliveEnemies();
      if (aliveEnemies.length === 0) {
        continue;
      }

      const action = hero.executeSkill(readySkillId);
      this.resolveSkillAction(hero, action, aliveEnemies);
    }

    this.cleanupDefeatedEnemies();
  }

  private resolveSkillAction(caster: BattleHero, action: SkillAction, aliveEnemies: BattleEnemy[]): void {
    const targets = action.mechanicTags.includes(MechanicTag.AoE) ? aliveEnemies : aliveEnemies.slice(0, 1);

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

  private cleanupDefeatedEnemies(): void {
    for (const [instanceId, enemy] of this.enemies) {
      if (!enemy.isAlive) {
        this.enemies.delete(instanceId);
        this.callbacks.onEnemyDefeated?.(enemy);
      }
    }
  }
}
