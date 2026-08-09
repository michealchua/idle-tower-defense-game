import { BattleEnemy, type AoePulseConfig, type EnrageConfig } from './BattleEnemy';
import { rollAffixes } from './AffixManager';

export interface EnemyTypeDefinition {
  maxHp: number;
  defense: number;
  speed: number;
  goldReward: number;
  expReward: number;
  /** How much GameManager's baseHp drops if this enemy walks past ENEMY_PATH's final waypoint uncontested. */
  baseDamage: number;
  /** Damage dealt to a single engaged hero each time this enemy's attack lands. */
  attackDamage: number;
  /** Pixel distance within which this enemy stops moving and engages the nearest alive hero instead. */
  attackRange: number;
  /** Attacks per second against an engaged hero. */
  attackSpeed: number;
  /** Boss-only: periodic AoE pulse hitting every alive hero in radius. Omitted for regular enemies. */
  aoePulse?: AoePulseConfig;
  /** Boss-only: attack-damage buff once low on HP. Omitted for regular enemies. */
  enrage?: EnrageConfig;
  /** True for boss/elite enemies - gates InventoryManager's random equipment-drop roll on death. Defaults to false. */
  isElite?: boolean;
}

/** Base stat templates for spawnable enemy types - WaveConfig.enemiesToSpawn references these ids. */
export const enemyTypeDefinitions: Record<string, EnemyTypeDefinition> = {
  goblin: {
    maxHp: 50,
    defense: 5,
    speed: 1.2,
    goldReward: 10,
    expReward: 1,
    baseDamage: 1,
    attackDamage: 3,
    attackRange: 40,
    attackSpeed: 1,
  },
  orc: {
    maxHp: 120,
    defense: 15,
    speed: 0.9,
    goldReward: 25,
    expReward: 3,
    baseDamage: 2,
    attackDamage: 8,
    attackRange: 45,
    attackSpeed: 0.8,
  },
  // Boss template: a slow, heavily-armored bruiser that both hits harder
  // per-swing than any regular enemy and, unlike them, carries two extra
  // mechanics layered on top of the same base attack/status engine every
  // other enemy uses - aoePulse (periodic unavoidable AoE against the
  // whole hero roster, not just its melee target) and enrage (a
  // damage-multiplier that kicks in once it's bloodied, rewarding heroes
  // that can burst it down before the fight gets harder rather than
  // grinding it evenly).
  boss_demon: {
    maxHp: 2000,
    defense: 60,
    speed: 0.6,
    goldReward: 200,
    expReward: 100,
    baseDamage: 5,
    attackDamage: 25,
    attackRange: 60,
    attackSpeed: 0.5,
    aoePulse: { damage: 15, radius: 150, interval: 6 },
    enrage: { hpThreshold: 0.5, damageMultiplier: 1.8 },
    isElite: true,
  },
};

export type EnemyTypeId = keyof typeof enemyTypeDefinitions;

/** Step 31's standard wave-scaling curve - "第 N 波怪物 HP = 基础 HP * (1.15 ^ N)", applied to every spawn against the enemy type's own base maxHp from enemyTypeDefinitions above. `waveNumber` 0 (the default `create()` already used before step 31, and every direct headless-test construction that doesn't care about scaling) leaves both exponents at 1 - i.e. this is purely additive to the existing wave-aware call sites, not a behavior change for anything that already omitted `waveNumber`. */
export const ENEMY_HP_SCALING_BASE = 1.15;
/** "攻击力 = 基础攻击 * (1.08 ^ N)" - same `waveNumber` convention as ENEMY_HP_SCALING_BASE, applied to attackDamage only (defense/speed/rewards/baseDamage are all left at their enemyTypeDefinitions value regardless of wave). */
export const ENEMY_ATTACK_SCALING_BASE = 1.08;

/**
 * Builds BattleEnemy instances from a registered enemy type id. Instantiated
 * per-encounter (see WaveManager) rather than shared globally, so its
 * instanceId counter never leaks numbering across unrelated battles.
 */
export class EnemyFactory {
  private nextInstanceId = 0;

  /**
   * `waveNumber` (1-based, same convention as SaveManager.recordStageCleared/
   * PrestigeManager) drives both step 28's random elite affix roll and step
   * 31's exponential HP/attack scaling (see ENEMY_HP_SCALING_BASE/
   * ENEMY_ATTACK_SCALING_BASE above) - affixes only ever consulted for an
   * `isElite` definition (which already covers every boss, see
   * enemyTypeDefinitions.boss_demon), via AffixManager.rollAffixes, while
   * the HP/attack scaling applies to every spawn regardless of type.
   * Defaults to 0 (below the affix-unlock wave, and `1.15^0 === 1.08^0 ===
   * 1` so scaling is a no-op) for callers that don't care about either -
   * most of test-run.ts's direct constructions.
   */
  create(enemyTypeId: string, waveNumber = 0): BattleEnemy {
    const definition = enemyTypeDefinitions[enemyTypeId];
    if (!definition) {
      throw new Error(`EnemyFactory: unknown enemy type id "${enemyTypeId}"`);
    }

    this.nextInstanceId += 1;
    return new BattleEnemy({
      instanceId: `${enemyTypeId}-${this.nextInstanceId}`,
      archetypeId: enemyTypeId,
      maxHp: definition.maxHp * ENEMY_HP_SCALING_BASE ** waveNumber,
      defense: definition.defense,
      speed: definition.speed,
      goldReward: definition.goldReward,
      expReward: definition.expReward,
      baseDamage: definition.baseDamage,
      attackDamage: definition.attackDamage * ENEMY_ATTACK_SCALING_BASE ** waveNumber,
      attackRange: definition.attackRange,
      attackSpeed: definition.attackSpeed,
      aoePulse: definition.aoePulse,
      enrage: definition.enrage,
      isElite: definition.isElite,
      affixes: definition.isElite ? rollAffixes(waveNumber) : [],
    });
  }
}
