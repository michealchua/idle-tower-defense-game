import { MechanicTag } from '../data/skills/skillTypes';

/** A timed status effect currently active on an enemy. */
export interface EnemyDebuff {
  tag: MechanicTag;
  /** Seconds remaining before this debuff expires and is removed. */
  remaining: number;
  /** Effect-specific strength (e.g. slow %, bleed damage/sec) - unused by the mechanics implemented so far. */
  magnitude?: number;
}

export interface BattleEnemyConfig {
  instanceId: string;
  archetypeId: string;
  maxHp: number;
  defense: number;
  speed: number;
  goldReward: number;
  expReward: number;
}

/**
 * Battlefield-scoped enemy model, sibling to BattleHero - owns only what a
 * live encounter needs (HP, defense, active debuffs). Archetype/scaling data
 * is resolved by the caller into a BattleEnemyConfig before construction so
 * this class stays independent of any specific enemy-data source.
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
  readonly debuffs: EnemyDebuff[] = [];

  constructor(config: BattleEnemyConfig) {
    this.instanceId = config.instanceId;
    this.archetypeId = config.archetypeId;
    this.maxHp = config.maxHp;
    this.currentHp = config.maxHp;
    this.defense = config.defense;
    this.speed = config.speed;
    this.goldReward = config.goldReward;
    this.expReward = config.expReward;
  }

  get isAlive(): boolean {
    return this.currentHp > 0;
  }

  applyDebuff(debuff: EnemyDebuff): void {
    this.debuffs.push(debuff);
  }

  hasDebuff(tag: MechanicTag): boolean {
    return this.debuffs.some((debuff) => debuff.tag === tag);
  }

  /** Ticks debuff durations down by deltaTime (seconds) and drops any that have expired. */
  update(deltaTime: number): void {
    for (let i = this.debuffs.length - 1; i >= 0; i -= 1) {
      this.debuffs[i].remaining -= deltaTime;
      if (this.debuffs[i].remaining <= 0) {
        this.debuffs.splice(i, 1);
      }
    }
  }
}
