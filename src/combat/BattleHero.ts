import type { SkillDefinition } from '../data/skills/skillTypes';
import type { HeroClass, HeroInstance } from '../data/hero/heroTypes';
import type { SkillAction } from './SkillAction';

/**
 * Live, battle-scoped stats. Seeded from HeroInstance.currentStats but
 * mutated independently from that point on - taking damage or receiving a
 * buff during a run never writes back into the save-game HeroInstance.
 */
export interface BattleHeroStats {
  maxHp: number;
  currentHp: number;
  currentAttack: number;
  currentDefense: number;
  currentAttackSpeed: number;
  currentCrit: number;
}

/**
 * Battlefield-facing wrapper around a HeroInstance. Owns everything that
 * only makes sense mid-battle (live HP/stat buffs, skill cooldowns) so the
 * persisted HeroInstance stays pure progression/save data - see
 * heroTypes.ts's HeroInstance doc comment.
 */
export class BattleHero {
  readonly instanceId: string;
  readonly heroClass: HeroClass;
  readonly stats: BattleHeroStats;
  /** World-space placement, set by whoever deploys this hero (e.g. GameManager.tryPlaceHero) - purely presentational, CombatEngine doesn't target off of it yet. */
  x: number;
  y: number;

  private readonly skillDefinitions = new Map<string, SkillDefinition>();
  private readonly skillCooldowns = new Map<string, number>();
  /** Unlocked, owned skill ids in cast-priority order: growth skills (slot order) first, base skill last. */
  private readonly skillPriorityOrder: string[];

  constructor(heroInstance: HeroInstance, skills: SkillDefinition[], position: { x: number; y: number } = { x: 0, y: 0 }) {
    this.instanceId = heroInstance.instanceId;
    this.heroClass = heroInstance.heroClass;
    this.x = position.x;
    this.y = position.y;

    const { hp, attack, defense, attackSpeed, crit } = heroInstance.currentStats;
    this.stats = {
      maxHp: hp,
      currentHp: hp,
      currentAttack: attack,
      currentDefense: defense,
      currentAttackSpeed: attackSpeed,
      currentCrit: crit,
    };

    for (const skill of skills) {
      this.skillDefinitions.set(skill.id, skill);
    }

    this.skillPriorityOrder = this.buildSkillPriorityOrder(heroInstance);
    for (const skillId of this.skillPriorityOrder) {
      this.skillCooldowns.set(skillId, 0);
    }
  }

  private buildSkillPriorityOrder(heroInstance: HeroInstance): string[] {
    const order: string[] = [];

    for (const slot of heroInstance.skills.growthSkills) {
      if (slot.unlocked && slot.skillId && this.skillDefinitions.has(slot.skillId)) {
        order.push(slot.skillId);
      }
    }

    const baseSkill = heroInstance.skills.baseSkill;
    if (baseSkill.unlocked && baseSkill.skillId && this.skillDefinitions.has(baseSkill.skillId)) {
      order.push(baseSkill.skillId);
    }

    return order;
  }

  getSkillCooldown(skillId: string): number {
    return this.skillCooldowns.get(skillId) ?? 0;
  }

  /** Read-only peek at an owned skill's definition (range, cooldown, damageMultiplier, ...) without touching cooldown state - what CombatEngine checks range/AoE against *before* deciding whether to actually executeSkill. */
  getSkillDefinition(skillId: string): SkillDefinition | undefined {
    return this.skillDefinitions.get(skillId);
  }

  /** Largest range among every skill this hero owns - a hero can carry several skills with different individual ranges, so this is the outer envelope GameRenderer's hover debug circle draws. */
  getMaxSkillRange(): number {
    let maxRange = 0;
    for (const definition of this.skillDefinitions.values()) {
      maxRange = Math.max(maxRange, definition.range);
    }
    return maxRange;
  }

  isSkillReady(skillId: string): boolean {
    return this.getSkillCooldown(skillId) <= 0;
  }

  /**
   * Ticks every skill's cooldown down by deltaTime (seconds), then returns
   * the highest-priority ready skill's id - or null if none are ready. Does
   * NOT fire the skill; the caller (targeting/range check) decides whether
   * to actually call executeSkill for it.
   */
  update(deltaTime: number): string | null {
    for (const [skillId, remaining] of this.skillCooldowns) {
      if (remaining > 0) {
        this.skillCooldowns.set(skillId, Math.max(0, remaining - deltaTime));
      }
    }

    for (const skillId of this.skillPriorityOrder) {
      if (this.isSkillReady(skillId)) {
        return skillId;
      }
    }

    return null;
  }

  /**
   * Fires a ready, owned skill: resets its cooldown and returns a
   * SkillAction payload for the (future) damage-resolution system to
   * consume. Throws if the skill isn't one this hero currently owns.
   */
  executeSkill(skillId: string): SkillAction {
    const definition = this.skillDefinitions.get(skillId);
    if (!definition || !this.skillPriorityOrder.includes(skillId)) {
      throw new Error(`BattleHero "${this.instanceId}": skill "${skillId}" is not owned/unlocked`);
    }

    this.skillCooldowns.set(skillId, definition.cooldown);

    return {
      skillId,
      casterInstanceId: this.instanceId,
      mechanicTags: [...definition.mechanicTags],
      damageMultiplier: definition.damageMultiplier,
      range: definition.range,
      sourceAttack: this.stats.currentAttack,
    };
  }
}
