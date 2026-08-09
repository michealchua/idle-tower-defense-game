import { StatusEffectType, type StatusEffectConfig } from '../data/skills/skillTypes';
import { ENEMY_PATH, CELL_SIZE, gridCellCenter } from './gridConfig';
import type { BattleHero } from './BattleHero';
import { getActiveBiomeMechanics } from './activeBiome';
import {
  AffixId,
  SHIELDED_SHIELD_RATIO,
  TELEPORTER_CHANCE,
  TELEPORTER_COOLDOWN_SECONDS,
  TELEPORTER_DISTANCE_PX,
  CLONER_SCALE,
  BERSERKER_HP_THRESHOLD,
  BERSERKER_SPEED_MULTIPLIER,
} from './AffixManager';

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
  /** Step 28's elite affixes - see AffixManager.ts. Defaults to none; only ever non-empty for isElite spawns (EnemyFactory is what actually rolls these via AffixManager.rollAffixes). */
  affixes?: AffixId[];
  /** Step 28's Cloner affix: relative sprite/HP-bar draw scale GameRenderer applies - 1 for a normal spawn, CLONER_SCALE for a clone. Purely visual; has no effect on hitbox/targeting math, which stays position-only in this engine. */
  visualScale?: number;
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
  /** Step 28's elite affix ids (see AffixManager.ts) - fixed for this enemy's lifetime, except Cloner splits stripping Cloner itself off the copies (see createClone). Empty for every non-elite spawn. */
  readonly affixes: AffixId[];
  /** Step 28's Cloner draw-scale hint (1 for a normal spawn) - GameRenderer sizes both the sprite and HP bar off this. */
  readonly visualScale: number;
  /** Live Slow/DOT effects currently applied - see applyStatus. Ticked down and resolved (DOT damage, expiry) every update() call. */
  readonly activeStatuses: ActiveStatusEffect[] = [];

  /** Shielded affix (step 28): remaining shield HP, depleted before currentHp on every incoming hit - see absorbAndApplyDamage. 0 for an enemy without the Shielded affix, so every damage-application call site can treat "has a shield" and "shield is empty" identically without a separate hasAffix check. */
  shieldHp: number;
  /** Shielded affix: shield HP as spawned - what GameRenderer's ring overlay/HUD reads as "full" for sizing a depletion indicator, since shieldHp itself only ever counts down. 0 for an enemy without the Shielded affix. */
  readonly maxShieldHp: number;

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
  /** Teleporter affix (step 28): seconds until the next warp roll is even attempted - see tryTeleport/TELEPORTER_COOLDOWN_SECONDS. */
  private teleportCooldownRemaining = 0;

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
    this.affixes = config.affixes ?? [];
    this.visualScale = config.visualScale ?? 1;
    this.maxShieldHp = this.affixes.includes(AffixId.Shielded) ? this.maxHp * SHIELDED_SHIELD_RATIO : 0;
    this.shieldHp = this.maxShieldHp;

    const start = gridCellCenter(ENEMY_PATH[0].col, ENEMY_PATH[0].row);
    this.x = start.x;
    this.y = start.y;
  }

  hasAffix(id: AffixId): boolean {
    return this.affixes.includes(id);
  }

  /** Berserker affix (step 28): true once currentHp/maxHp drops to/below BERSERKER_HP_THRESHOLD - drives both the attack-cadence/movement-speed doubling below and GameRenderer's red tint. Computed live off currentHp (same "not latched" reasoning isEnraged already follows), so it also correctly flips back off if this enemy is ever healed back above the threshold (Poison Swamp regen, Forest's heal-lowest, etc). */
  get isBerserking(): boolean {
    return this.hasAffix(AffixId.Berserker) && this.currentHp / this.maxHp <= BERSERKER_HP_THRESHOLD;
  }

  get isAlive(): boolean {
    return this.currentHp > 0;
  }

  /** True once currentHp/maxHp drops to/below enrage.hpThreshold - drives effectiveAttackDamage. Always false for enemies with no enrage config. Computed live off currentHp rather than latched, so it also reflects HP changes CombatEngine applies directly (resolveDamageAgainst mutates currentHp outside this class). */
  private get isEnraged(): boolean {
    return this.enrage !== undefined && this.currentHp / this.maxHp <= this.enrage.hpThreshold;
  }

  /** attackDamage, boosted by enrage.damageMultiplier once isEnraged, then given a final pass through the active biome's modifyEnemyAttackDamage (Demon Abyss's "每损失 1% HP，攻击力提升 1%" scaling, step 22) - what CombatEngine.resolveEnemyAttack actually applies, instead of the raw base stat. The two stack (an enraged, bloodied Demon Abyss boss gets both), same "biome is a layer on top, not a replacement" convention BattleHero.computeFinalStat follows for equipment. */
  get effectiveAttackDamage(): number {
    const enraged = this.isEnraged ? this.attackDamage * this.enrage!.damageMultiplier : this.attackDamage;
    return getActiveBiomeMechanics()?.modifyEnemyAttackDamage?.(enraged, this) ?? enraged;
  }

  /** True once attackCooldownRemaining has counted down to 0 - CombatEngine only resolves a hit while this is true, then calls commitAttack to reset it. */
  get isAttackReady(): boolean {
    return this.attackCooldownRemaining <= 0;
  }

  /** True once aoePulseCooldownRemaining has counted down to 0 - always false for an enemy with no aoePulse config, since that field stays undefined. */
  get isAoePulseReady(): boolean {
    return this.aoePulse !== undefined && this.aoePulseCooldownRemaining <= 0;
  }

  /** Resets the attack cooldown to 1/(attackSpeed * biome speed multiplier * berserk multiplier) seconds - called by CombatEngine immediately after it resolves a hit. A biome that slows "all entities" (Ocean, step 22) lengthens this cooldown the same way it slows movement below, instead of needing a separate hero-only vs enemy-only split; Berserker (step 28) shortens it the same way once isBerserking flips on. */
  commitAttack(): void {
    const speedMultiplier = getActiveBiomeMechanics()?.modifyEnemySpeedMultiplier?.(1) ?? 1;
    const berserkMultiplier = this.isBerserking ? BERSERKER_SPEED_MULTIPLIER : 1;
    this.attackCooldownRemaining = 1 / (this.attackSpeed * berserkMultiplier * Math.max(0.01, speedMultiplier));
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
    if (this.teleportCooldownRemaining > 0) {
      this.teleportCooldownRemaining = Math.max(0, this.teleportCooldownRemaining - deltaTime);
    }
  }

  private tickStatuses(deltaTime: number): void {
    const dotDamage = this.totalDotDamagePerSecond * deltaTime;
    if (dotDamage > 0) {
      // Shielded (step 28) absorbs DOT ticks too - a shield's whole point
      // is "the next points of damage don't count", regardless of source -
      // but DOT is deliberately NOT routed through takeAttackDamage, so a
      // burning enemy can't spam-trigger Teleporter's "受到攻击时" reaction
      // off passive damage-over-time alone.
      this.absorbAndApplyDamage(dotDamage);
    }

    for (let i = this.activeStatuses.length - 1; i >= 0; i -= 1) {
      this.activeStatuses[i].remaining -= deltaTime;
      if (this.activeStatuses[i].remaining <= 0) {
        this.activeStatuses.splice(i, 1);
      }
    }
  }

  /** Shielded affix (step 28) - the shared damage-application core every incoming-damage path routes through: shieldHp is depleted first, and only the overflow (if any) actually reduces currentHp. A shield-less enemy (shieldHp always 0) skips straight to the plain subtraction, so this is a no-op-shaped passthrough for the common case. */
  private absorbAndApplyDamage(amount: number): void {
    if (amount <= 0) {
      return;
    }
    const shieldAbsorbed = Math.min(this.shieldHp, amount);
    this.shieldHp -= shieldAbsorbed;
    const overflow = amount - shieldAbsorbed;
    if (overflow > 0) {
      this.currentHp = Math.max(0, this.currentHp - overflow);
    }
  }

  /**
   * Applies direct hero-dealt damage (a skill hit or a projectile impact -
   * see CombatEngine.resolveDamageAgainst) - routes through
   * absorbAndApplyDamage first (Shielded), then rolls Teleporter's "受到
   * 攻击时 15% 概率瞬移" reaction if this enemy carries that affix and its
   * cooldown is ready. Not used for DOT (see tickStatuses, which calls
   * absorbAndApplyDamage directly) or for Execute-tagged kills (which
   * bypass everything, including the shield, to guarantee the kill - see
   * CombatEngine.resolveDamageAgainst's isExecute branch).
   */
  takeAttackDamage(amount: number): void {
    this.absorbAndApplyDamage(amount);
    this.tryTeleport();
  }

  private tryTeleport(): void {
    if (!this.hasAffix(AffixId.Teleporter) || this.teleportCooldownRemaining > 0) {
      return;
    }
    if (Math.random() >= TELEPORTER_CHANCE) {
      return;
    }
    this.teleportCooldownRemaining = TELEPORTER_COOLDOWN_SECONDS;
    this.teleportForward(TELEPORTER_DISTANCE_PX);
  }

  /**
   * Instantly advances `distancePx` along ENEMY_PATH toward the base,
   * crossing waypoint boundaries as needed (same WAYPOINT_ARRIVAL_
   * THRESHOLD_PX arrival check moveAlongPath uses, just resolved all at
   * once instead of spread across deltaTime-sized steps) - Teleporter's
   * "瞬移...向基地中心移动一段距离". Can push this enemy all the way to
   * hasReachedEnd if it warps close enough to the final waypoint; that's a
   * real, if rare, consequence of the affix, not a bug to guard against.
   */
  private teleportForward(distancePx: number): void {
    let remaining = distancePx;

    while (remaining > 0 && !this.reachedEnd) {
      const target = ENEMY_PATH[this.currentWaypointIndex];
      const targetPosition = gridCellCenter(target.col, target.row);
      const dx = targetPosition.x - this.x;
      const dy = targetPosition.y - this.y;
      const distance = Math.hypot(dx, dy);

      if (distance < WAYPOINT_ARRIVAL_THRESHOLD_PX) {
        if (this.currentWaypointIndex >= ENEMY_PATH.length - 1) {
          this.reachedEnd = true;
          break;
        }
        this.currentWaypointIndex += 1;
        continue;
      }

      const step = Math.min(remaining, distance);
      this.x += (dx / distance) * step;
      this.y += (dy / distance) * step;
      remaining -= step;
    }
  }

  /**
   * Cloner affix (step 28): builds one shrunken copy of this enemy -
   * CLONER_SCALE of maxHp/attackDamage/goldReward/expReward (each floored
   * to at least 1 so a copy can never spawn already-dead or harmless),
   * defense/attackRange/attackSpeed/baseDamage and - explicitly, per the
   * spec's "保留原始移动速度" - speed all carried over unscaled. Cloner
   * itself is stripped from the copy's own affix list so a clone's death
   * settles normally instead of splitting again; every other affix the
   * original had (Shielded, Vampiric, ...) carries over, each re-rolling
   * its own fresh state (a cloned Shielded copy gets its own full shield,
   * not half of whatever was left on the original). isElite is inherited
   * unchanged so a clone's own death still rolls loot normally, per the
   * spec's "能正常掉落战利品". Positioned at this enemy's current location/
   * waypoint progress, not back at the path's start - CombatEngine is
   * expected to give the two copies distinct instanceIds and register them.
   */
  createClone(instanceId: string): BattleEnemy {
    const clone = new BattleEnemy({
      instanceId,
      archetypeId: this.archetypeId,
      maxHp: Math.max(1, Math.round(this.maxHp * CLONER_SCALE)),
      defense: this.defense,
      speed: this.speed,
      goldReward: Math.max(1, Math.round(this.goldReward * CLONER_SCALE)),
      expReward: Math.max(1, Math.round(this.expReward * CLONER_SCALE)),
      baseDamage: this.baseDamage,
      attackDamage: Math.max(1, Math.round(this.attackDamage * CLONER_SCALE)),
      attackRange: this.attackRange,
      attackSpeed: this.attackSpeed,
      isElite: this.isElite,
      affixes: this.affixes.filter((id) => id !== AffixId.Cloner),
      visualScale: this.visualScale * CLONER_SCALE,
    });
    clone.x = this.x;
    clone.y = this.y;
    clone.currentWaypointIndex = this.currentWaypointIndex;
    return clone;
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

    const biomeSpeedMultiplier = getActiveBiomeMechanics()?.modifyEnemySpeedMultiplier?.(1) ?? 1;
    const berserkMultiplier = this.isBerserking ? BERSERKER_SPEED_MULTIPLIER : 1;
    const pixelsPerSecond =
      this.speed * (1 - this.totalSlowFraction) * Math.max(0, biomeSpeedMultiplier) * berserkMultiplier * CELL_SIZE;
    const step = Math.min(pixelsPerSecond * deltaTime, distance);
    this.x += (dx / distance) * step;
    this.y += (dy / distance) * step;
  }
}
