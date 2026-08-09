import type { SkillDefinition } from '../data/skills/skillTypes';
import type { HeroClass, HeroInstance } from '../data/hero/heroTypes';
import type { SkillAction } from './SkillAction';
import type { EvolutionOption } from './heroEvolution';
import { EquipmentSlot, equipmentLevelMultiplier, type EquipmentItem, type StatModifiers } from './Equipment';
import { getActiveBiomeMechanics } from './activeBiome';
import { talentManager } from './TalentManager';
import { PrestigeManager } from './PrestigeManager';

/**
 * Live, battle-scoped stats. Seeded from HeroInstance.currentStats but
 * mutated independently from that point on - taking damage or receiving a
 * buff during a run never writes back into the save-game HeroInstance.
 * Every field except currentHp is a computed getter (see BattleHero's
 * constructor/computeFinalStat) - `readonly` here isn't just documentation,
 * it's what makes a stray write like `hero.stats.maxHp = x` a compile
 * error instead of a silent runtime TypeError (assigning to a getter-only
 * property throws in strict mode, which every ES module already is).
 * currentHp stays a plain mutable field: it's live combat state (damage/
 * heal), not something derived from level + equipment.
 */
export interface BattleHeroStats {
  readonly maxHp: number;
  currentHp: number;
  readonly currentAttack: number;
  readonly currentDefense: number;
  readonly currentAttackSpeed: number;
  readonly currentCrit: number;
}

/** Gold cost of the *next* upgrade grows by this factor per level - level 1->2 costs BASE_UPGRADE_COST, level 2->3 costs BASE_UPGRADE_COST*this, etc. */
const UPGRADE_COST_GROWTH_RATE = 1.35;
const BASE_UPGRADE_COST = 30;
/** Fractional stat growth applied on every upgrade() call - +12% compounding per level. currentCrit is deliberately excluded (see upgrade()'s doc comment). */
const STAT_GROWTH_PER_LEVEL = 0.12;
/** Floor on revive() HP so a hero never comes back with literally 0 (which would immediately re-trigger isDead the next time anything so much as ticks a DOT-like effect against it). */
const MIN_REVIVE_HP = 1;

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
  /** True once stats.currentHp has been driven to 0 by takeDamage - see takeDamage/revive. While true, update() returns null unconditionally, so this hero stops ticking cooldowns and never becomes a ready-skill caster; GameRenderer is expected to draw it grayed-out/faded, and CombatEngine's enemy-targeting skips it as an attack target. */
  isDead = false;

  private readonly skillDefinitions = new Map<string, SkillDefinition>();
  private readonly skillCooldowns = new Map<string, number>();
  /** Active Volcano-style burn stacks (step 22's global-rule-engine biome hazards) - independent of BattleEnemy's Slow/Dot activeStatuses system, since heroes had no status-effect engine of their own before this. Each entry ticks down and deals its own damagePerSecond * deltaTime every update(), same "stacks add, don't refresh" convention BattleEnemy.applyStatus already uses. */
  private readonly activeBurns: { damagePerSecond: number; remaining: number }[] = [];
  /** Unlocked, owned skill ids in cast-priority order: growth skills (slot order) first, base skill last. Mutated wholesale by evolveInto - stays a stable array reference (not reassigned) so nothing holding onto it goes stale. */
  private readonly skillPriorityOrder: string[];

  /**
   * Post-level-growth, pre-equipment "base" stats - what upgrade() scales
   * (evolveInto deliberately doesn't touch these, same as before step 19)
   * and what stats' getters layer equipment bonuses on top of via
   * computeFinalStat. Distinct from HeroInstance.baseStats (heroTypes.ts),
   * which is the frozen authoring-time template value - this is the
   * mutable, already-leveled runtime figure equipment never itself writes
   * to.
   */
  private readonly levelStats: { maxHp: number; attack: number; defense: number; attackSpeed: number; crit: number };
  /** Frozen snapshot of levelStats as constructed (i.e. level 1's own values, before any upgrade() calls have scaled them) - upgrade() never touches this, only levelStats itself. What resetLevel() (step 27's prestige reset) restores levelStats back to. */
  private readonly baseLevelStats: { maxHp: number; attack: number; defense: number; attackSpeed: number; crit: number };
  /** At most one item per EquipmentSlot - see equipItem/unequipItem. Never has more than 4 entries (Weapon/Armor/Boots/Accessory). */
  private readonly equipment: Partial<Record<EquipmentSlot, EquipmentItem>> = {};

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
    this.levelStats = { maxHp: hp, attack, defense, attackSpeed, crit };
    this.baseLevelStats = { ...this.levelStats };

    // Captured so the object-literal getters below (whose own `this` binds
    // to the stats object itself, not BattleHero) can still reach
    // computeFinalStat/levelStats.
    const self = this;
    this.stats = {
      currentHp: hp,
      get maxHp(): number {
        return self.computeFinalStat('maxHp');
      },
      get currentAttack(): number {
        return self.computeFinalStat('attack');
      },
      get currentDefense(): number {
        return self.computeFinalStat('defense');
      },
      get currentAttackSpeed(): number {
        return self.computeFinalStat('attackSpeed');
      },
      get currentCrit(): number {
        return self.computeFinalStat('crit');
      },
    };

    for (const skill of skills) {
      this.skillDefinitions.set(skill.id, skill);
    }

    this.skillPriorityOrder = this.buildSkillPriorityOrder(heroInstance);
    for (const skillId of this.skillPriorityOrder) {
      this.skillCooldowns.set(skillId, 0);
    }
  }

  /**
   * final = levelStats[stat] * (1 + sum of every equipped item's
   * level-scaled percent bonus for `stat`) + (sum of every equipped
   * item's level-scaled flat bonus for `stat`) - i.e. "基础属性 x 升级
   * 系数 + 装备固定加成 + 装备百分比加成" (percent is applied against the
   * pre-equipment levelStats value, not against the flat-adjusted total,
   * so two items each carrying +10% combine additively to +20% of the
   * base rather than compounding). Each item's own flat/percent numbers
   * are first scaled by equipmentLevelMultiplier(item.level) (step 20) -
   * a +5 flat modifier on a level-3 item contributes +6 (5 * 1.2), not a
   * flat +5 regardless of how enhanced the item is.
   */
  private computeFinalStat(statKey: keyof StatModifiers): number {
    const base = this.levelStats[statKey];
    let flatBonus = 0;
    let percentBonus = 0;

    for (const item of Object.values(this.equipment)) {
      const modifier = item?.modifiers[statKey];
      if (!item || !modifier) {
        continue;
      }
      const levelMultiplier = equipmentLevelMultiplier(item.level);
      flatBonus += (modifier.flat ?? 0) * levelMultiplier;
      percentBonus += (modifier.percent ?? 0) * levelMultiplier;
    }

    const withEquipment = base * (1 + percentBonus) + flatBonus;

    // Step 23's out-of-run talent layer, applied multiplicatively on top of
    // equipment per the spec's "(基础属性 + 装备加成) * (1 + 天赋百分比加成)"
    // formula - talentManager.getStatBonusPercent returns 0 for every stat
    // besides maxHp (no other node governs one yet), so this is a no-op for
    // currentAttack/currentDefense/etc. even with Vitality leveled.
    const withTalent = withEquipment * (1 + talentManager.getStatBonusPercent(statKey));

    // Step 27's prestige layer - an independent multiplier stacking on top
    // of talent, per the spec's explicit "...*(1 + Sparks * 0.05)" formula.
    // Only ever touches attack ("全局伤害" - what CombatEngine's damage math
    // multiplies by) and maxHp ("全局最大生命值"); defense/attackSpeed/crit
    // are untouched, same as talentManager.getStatBonusPercent above.
    const withPrestige =
      statKey === 'attack' || statKey === 'maxHp' ? withTalent * (1 + PrestigeManager.getGlobalBonusMultiplier()) : withTalent;

    // Biome mechanics get the final word (step 22) - applied after
    // equipment, talents, AND prestige, same "environment is a layer on
    // top of the build, not baked into it" reasoning equipment itself
    // follows relative to levelStats. A no-op whenever no theme is active
    // (getActiveBiomeMechanics returns null - e.g. every pre-step-22
    // headless test construction).
    return getActiveBiomeMechanics()?.modifyHeroStat?.(statKey, withPrestige, this) ?? withPrestige;
  }

  /** True if this hero owns at least one projectile-based (ranged) skill - CombatEngine's own `definition.projectileSpeed !== undefined` check, mirrored here for biome hooks (Desert's range penalty/melee dodge) that need a hero-level "is this a ranged unit" answer rather than a per-cast one. A hero with a mix of melee and ranged skills counts as ranged. */
  hasRangedSkill(): boolean {
    for (const definition of this.skillDefinitions.values()) {
      if (definition.projectileSpeed !== undefined) {
        return true;
      }
    }
    return false;
  }

  /** Number of currently-active burn stacks - read-only visibility into activeBurns for callers that just need to know "is this hero on fire" (GameRenderer's status-ring rendering, test-run.ts's Priest cleanse boundary test) without reaching into private state. */
  get activeBurnCount(): number {
    return this.activeBurns.length;
  }

  /** Pushes a fresh, independently-timed burn stack - see activeBurns' doc comment for why this is a separate system from BattleEnemy's Slow/Dot. Skipped on an already-dead hero, same "can't stack more damage onto something already at 0 HP" guard takeDamage itself applies. The stack's own damagePerSecond is reduced by talentManager.getEnvironmentalDamageReduction() (step 23's Environmental Adaptation node) before it's stored, not at tick time - so a talent level bought mid-burn doesn't retroactively change an already-applied stack's damage. */
  applyBurn(damagePerSecond: number, duration: number): void {
    if (this.isDead) {
      return;
    }
    const reduction = talentManager.getEnvironmentalDamageReduction();
    this.activeBurns.push({ damagePerSecond: damagePerSecond * (1 - reduction), remaining: duration });
  }

  /** Removes the single oldest active burn stack (FIFO) and reports whether one was actually there to remove - what a Priest's cleansesDebuff heal (step 23) calls on its target. Currently activeBurns is the only debuff-like state BattleHero tracks; a future second debuff type would need its own priority rule here rather than assuming "burn" is the only thing "cleanse" can mean. */
  cleanseOneDebuff(): boolean {
    if (this.activeBurns.length === 0) {
      return false;
    }
    this.activeBurns.shift();
    return true;
  }

  /** Resolves this tick's total burn damage (applied via takeDamage, so it can still kill and correctly flips isDead) and drops whatever just expired. */
  private tickBurns(deltaTime: number): void {
    if (this.activeBurns.length === 0) {
      return;
    }
    const totalDps = this.activeBurns.reduce((sum, burn) => sum + burn.damagePerSecond, 0);
    this.takeDamage(totalDps * deltaTime);

    for (let i = this.activeBurns.length - 1; i >= 0; i -= 1) {
      this.activeBurns[i].remaining -= deltaTime;
      if (this.activeBurns[i].remaining <= 0) {
        this.activeBurns.splice(i, 1);
      }
    }
  }

  /**
   * Equips `item` into its own slot (EquipmentItem.slot), replacing and
   * returning whatever was previously equipped there (null if the slot
   * was empty) - a slot only ever holds one item, so equipping overwrites
   * rather than stacking. Takes effect immediately (stats' getters read
   * straight through `equipment`); currentHp is clamped down in case the
   * swap just lowered maxHp below it, so a hero can never end up reading
   * as "overhealed" relative to its own new max.
   */
  equipItem(item: EquipmentItem): EquipmentItem | null {
    const previous = this.equipment[item.slot] ?? null;
    this.equipment[item.slot] = item;
    this.stats.currentHp = Math.min(this.stats.currentHp, this.stats.maxHp);
    return previous;
  }

  /** Removes and returns whatever's equipped in `slot` (null if it was already empty) - same currentHp clamp as equipItem. */
  unequipItem(slot: EquipmentSlot): EquipmentItem | null {
    const removed = this.equipment[slot] ?? null;
    delete this.equipment[slot];
    this.stats.currentHp = Math.min(this.stats.currentHp, this.stats.maxHp);
    return removed;
  }

  getEquippedItem(slot: EquipmentSlot): EquipmentItem | undefined {
    return this.equipment[slot];
  }

  /** Snapshot of every currently-equipped slot - a shallow copy, so mutating the returned object can never affect this hero's real equipment. */
  getAllEquipment(): Partial<Record<EquipmentSlot, EquipmentItem>> {
    return { ...this.equipment };
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

  get isAlive(): boolean {
    return !this.isDead;
  }

  /**
   * Applies enemy attack/AoE-pulse damage (already armor-mitigated by the
   * caller, same as resolveDamageAgainst does for hero->enemy hits) to
   * stats.currentHp, flipping isDead once it bottoms out at 0. A no-op on
   * an already-dead hero or non-positive damage, so a stray hit landing
   * the same tick a hero already died from something else can't somehow
   * push currentHp negative or re-fire death handling.
   */
  takeDamage(amount: number): void {
    if (this.isDead || amount <= 0) {
      return;
    }
    this.stats.currentHp = Math.max(0, this.stats.currentHp - amount);
    if (this.stats.currentHp <= 0) {
      this.isDead = true;
    }
  }

  /**
   * Brings a dead hero back at `healRatio` of maxHp (e.g. 0.5 = half HP) -
   * what GameManager calls on every hero still dead when a new wave opens.
   * A no-op on a hero that isn't currently dead, so calling this
   * unconditionally over the whole roster each wave never touches a
   * hero that's still alive and mid-fight.
   */
  revive(healRatio: number): void {
    if (!this.isDead) {
      return;
    }
    this.isDead = false;
    this.stats.currentHp = Math.max(MIN_REVIVE_HP, this.stats.maxHp * healRatio);
  }

  /** Gold cost of the *next* upgrade() call - grows geometrically with level so late-game upgrades cost meaningfully more than early ones, not a flat fee forever. Pure calculation; GameManager.tryUpgradeHero is what actually checks/deducts gold. */
  getUpgradeCost(): number {
    return Math.round(BASE_UPGRADE_COST * UPGRADE_COST_GROWTH_RATE ** (this.level - 1));
  }

  /**
   * Spends one level: grows levelStats' maxHp/attack/defense/attackSpeed
   * by STAT_GROWTH_PER_LEVEL and fully heals off the freshly-recomputed
   * maxHp (a level-up reward, not just a bigger number - and since
   * stats.maxHp is now a getter layering equipment on top of levelStats,
   * this correctly heals to the post-equipment max too). levelStats.crit
   * is deliberately left alone - unlike the others, a percentage stat
   * compounding the same way would blow past 100% within a handful of
   * levels rather than growing indefinitely. Only ever touches levelStats,
   * never `equipment` - upgrading and equipping stay fully independent, so
   * neither can clobber the other's contribution to the final stat.
   * Doesn't touch gold - GameManager.tryUpgradeHero deducts getUpgradeCost()
   * first and only calls this once that's confirmed.
   */
  upgrade(): void {
    this.level += 1;
    const growth = 1 + STAT_GROWTH_PER_LEVEL;
    this.levelStats.maxHp *= growth;
    this.levelStats.attack *= growth;
    this.levelStats.defense *= growth;
    this.levelStats.attackSpeed *= growth;
    this.stats.currentHp = this.stats.maxHp;
  }

  /**
   * Step 27's prestige reset: restores level back to 1 and levelStats back
   * to their as-constructed baseLevelStats snapshot, undoing every
   * upgrade() call this hero has ever received - equipment, evolution
   * state, and skill cooldowns are all deliberately left untouched (the
   * spec's prestige reset list is explicitly level-only; "绝对保留" calls
   * out equipment by name). Also fully heals off the freshly-reset maxHp,
   * same reasoning upgrade() itself heals on every level-up rather than
   * potentially leaving currentHp reading as "overhealed" relative to a
   * now-lower max.
   */
  resetLevel(): void {
    this.level = 1;
    this.levelStats.maxHp = this.baseLevelStats.maxHp;
    this.levelStats.attack = this.baseLevelStats.attack;
    this.levelStats.defense = this.baseLevelStats.defense;
    this.levelStats.attackSpeed = this.baseLevelStats.attackSpeed;
    this.levelStats.crit = this.baseLevelStats.crit;
    this.stats.currentHp = this.stats.maxHp;
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
    if (this.isDead) {
      // Dead heroes stop all skill/attack behavior outright - cooldowns
      // simply freeze in place rather than continuing to count down, so a
      // hero revived mid-cooldown resumes exactly where it left off
      // instead of coming back with everything conveniently ready.
      return null;
    }

    this.tickBurns(deltaTime);
    if (this.isDead) {
      // A burn tick just killed this hero this same frame - same "stop
      // everything the instant isDead flips" rule the pre-existing guard
      // above enforces for a hero that was already dead entering update().
      return null;
    }

    // Cooldowns tick down at deltaTime * currentAttackSpeed, not raw
    // deltaTime - "受攻速影响" (step 23's Priest ability spec, but applied
    // uniformly to every class/skill, not special-cased to Priest alone):
    // currentAttackSpeed was previously read only for display (main.ts's
    // hero panel), never actually consulted by any gameplay system, so this
    // gives it real effect for the first time rather than introducing a
    // second, Priest-only cooldown formula.
    const cooldownRate = this.stats.currentAttackSpeed;
    for (const [skillId, remaining] of this.skillCooldowns) {
      if (remaining > 0) {
        this.skillCooldowns.set(skillId, Math.max(0, remaining - deltaTime * cooldownRate));
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
