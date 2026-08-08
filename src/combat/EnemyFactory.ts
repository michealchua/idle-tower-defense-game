import { BattleEnemy, type AoePulseConfig, type EnrageConfig } from './BattleEnemy';

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

/**
 * Builds BattleEnemy instances from a registered enemy type id. Instantiated
 * per-encounter (see WaveManager) rather than shared globally, so its
 * instanceId counter never leaks numbering across unrelated battles.
 */
export class EnemyFactory {
  private nextInstanceId = 0;

  create(enemyTypeId: string): BattleEnemy {
    const definition = enemyTypeDefinitions[enemyTypeId];
    if (!definition) {
      throw new Error(`EnemyFactory: unknown enemy type id "${enemyTypeId}"`);
    }

    this.nextInstanceId += 1;
    return new BattleEnemy({
      instanceId: `${enemyTypeId}-${this.nextInstanceId}`,
      archetypeId: enemyTypeId,
      maxHp: definition.maxHp,
      defense: definition.defense,
      speed: definition.speed,
      goldReward: definition.goldReward,
      expReward: definition.expReward,
      baseDamage: definition.baseDamage,
      attackDamage: definition.attackDamage,
      attackRange: definition.attackRange,
      attackSpeed: definition.attackSpeed,
      aoePulse: definition.aoePulse,
      enrage: definition.enrage,
      isElite: definition.isElite,
    });
  }
}
