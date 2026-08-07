import { BattleEnemy } from './BattleEnemy';

export interface EnemyTypeDefinition {
  maxHp: number;
  defense: number;
  speed: number;
  goldReward: number;
  expReward: number;
  /** How much GameManager's baseHp drops if this enemy walks past ENEMY_PATH's final waypoint uncontested. */
  baseDamage: number;
}

/** Base stat templates for spawnable enemy types - WaveConfig.enemiesToSpawn references these ids. */
export const enemyTypeDefinitions: Record<string, EnemyTypeDefinition> = {
  goblin: { maxHp: 50, defense: 5, speed: 1.2, goldReward: 10, expReward: 1, baseDamage: 1 },
  orc: { maxHp: 120, defense: 15, speed: 0.9, goldReward: 25, expReward: 3, baseDamage: 2 },
  boss_demon: { maxHp: 2000, defense: 60, speed: 0.6, goldReward: 200, expReward: 100, baseDamage: 5 },
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
    });
  }
}
