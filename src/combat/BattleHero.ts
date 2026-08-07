import type { SkillDefinition } from '../data/skills/skillTypes';
import type { HeroClass, HeroInstance } from '../data/hero/heroTypes';
import type { SkillAction } from './SkillAction';
import type { EvolutionOption } from './heroEvolution';

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

/** Gold cost of the *next* upgrade grows by this factor per level - level 1->2 costs BASE_UPGRADE_COST, level 2->3 costs BASE_UPGRADE_COST*this, etc. */
const UPGRADE_COST_GROWTH_RATE = 1.35;
const BASE_UPGRADE_COST = 30;
/** Fractional stat growth applied on every upgrade() call - +12% compounding per level. currentCrit is deliberately excluded (see upgrade()'s doc comment). */
const STAT_GROWTH_PER_LEVEL = 0.12;

/**
 * Battlefield-facing wrapper around a HeroInstance. Owns everything that
 * only makes sense mid-battle (live HP/stat buffs, skill cooldowns, level/
 * evolution progress) so the persisted HeroInstance stays pure progression/
 * save data - see heroTypes.ts's HeroInstance doc comment.
 */
export class BattleHero {
  readonly instanceId: string;
  readonly heroClass: HeroClass;
  /** heroCatalog.ts key this instance was purchased under (e.g. 'apprenticeMage') - what GameManager.tryEvolveHero looks up in heroEvolutions with. Defaults to the underlying HeroInstance's templateId for callers (e.g. test-run.ts's direct constructions) that don't go through heroCatalog and have no evolution options anyway. */
  readonly heroTypeId: string;
  readonly stats: BattleHeroStats;
  /** World-space placement, set by whoever deploys this hero (e.g. GameManager.tryPlaceHero) - purely presentational, CombatEngine doesn't target off of it yet. */
  x: number;
  y: number;

  level = 1;
  /** Set once evolveInto commits a branch - the evolved sprite id (see heroEvolution.ts's EvolutionOption.id doc comment) GameRenderer draws instead of the plain heroClass sprite, and what blocks a second evolution. Null while unevolved. */
  evolvedInto: string | null = null;

  private readonly skillDefinitions = new Map<string, SkillDefinition>();
  private readonly skillCooldowns = new Map<string, number>();
  /** Unlocked, owned skill ids in cast-priority order: growth skills (slot order) first, base skill last. Mutated wholesale by evolveInto - stays a stable array reference (not reassigned) so nothing holding onto it goes stale. */
  private readonly skillPriorityOrder: string[];

  constructor(
    heroInstance: HeroInstance,
    skills: SkillDefinition[],
    position: { x: number; y: number } = { x: 0, y: 0 },
    heroTypeId: string = heroInstance.templateId,
  ) {
    this.instanceId = heroInstance.instanceId;
    this.heroClass = heroInstance.heroClass;
    this.heroTypeId = heroTypeId;
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

  /** Gold cost of the *next* upgrade() call - grows geometrically with level so late-game upgrades cost meaningfully more than early ones, not a flat fee forever. Pure calculation; GameManager.tryUpgradeHero is what actually checks/deducts gold. */
  getUpgradeCost(): number {
    return Math.round(BASE_UPGRADE_COST * UPGRADE_COST_GROWTH_RATE ** (this.level - 1));
  }

  /**
   * Spends one level: grows maxHp/currentAttack/currentDefense/
   * currentAttackSpeed by STAT_GROWTH_PER_LEVEL and fully heals (a level-up
   * reward, not just a bigger number). currentCrit is deliberately left
   * alone - unlike the others, a percentage stat compounding the same way
   * would blow past 100% within a handful of levels rather than growing
   * indefinitely. Does not touch gold - GameManager.tryUpgradeHero deducts
   * getUpgradeCost() first and only calls this once that's confirmed.
   */
  upgrade(): void {
    this.level += 1;
    const growth = 1 + STAT_GROWTH_PER_LEVEL;
    this.stats.maxHp *= growth;
    this.stats.currentHp = this.stats.maxHp;
    this.stats.currentAttack *= growth;
    this.stats.currentDefense *= growth;
    this.stats.currentAttackSpeed *= growth;
  }

  /**
   * Commits an evolution branch: wholesale-replaces this hero's entire
   * skill set with `option.skill` (not just adding it alongside the old
   * one - evolving is a Build change, not a buff) and marks evolvedInto so
   * GameRenderer switches to the evolved sprite and a second evolution
   * gets rejected. skillPriorityOrder/skillDefinitions/skillCooldowns are
   * mutated in place (cleared and refilled) rather than reassigned, so
   * they stay the exact same object references update()/executeSkill/
   * getSkillDefinition already close over.
   */
  evolveInto(option: EvolutionOption): void {
    this.skillDefinitions.clear();
    this.skillDefinitions.set(option.skill.id, option.skill);

    this.skillPriorityOrder.length = 0;
    this.skillPriorityOrder.push(option.skill.id);

    this.skillCooldowns.clear();
    this.skillCooldowns.set(option.skill.id, 0);

    this.evolvedInto = option.id;
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
