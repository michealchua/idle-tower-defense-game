export type EnemyArchetypeId =
  | 'normal'
  | 'fast'
  | 'tank'
  | 'elite'
  | 'swarm'
  | 'brute'
  | 'giant'
  | 'berserker'
  | 'healer'
  | 'shield'
  | 'miniboss'
  | 'boss';

export interface BerserkerBehavior {
  hpRatioThreshold: number;
  speedMultiplier: number;
}

export interface HealAbility {
  radius: number;
  amount: number;
  intervalSeconds: number;
}

export interface EnemyArchetype {
  id: EnemyArchetypeId;
  hpMultiplier: number;
  speedMultiplier: number;
  damageToBaseMultiplier: number;
  goldRewardMultiplier: number;
  expRewardMultiplier: number;
  // Not consumed by anything yet - a future threat-budget spawn system reads
  // this instead of just counting enemies. Inert hook, not wired up here.
  threatValue: number;
  // All three below are optional - unset means "no special behavior", which
  // is every archetype up through brute. Only berserker/healer/shield set
  // one of these; giant is still a pure stat-multiplier archetype (a bigger
  // tank), same as normal/fast/tank/elite/swarm/brute.
  berserker?: BerserkerBehavior;
  healAbility?: HealAbility;
  hasShield?: boolean;
}

export const enemyArchetypes: Record<EnemyArchetypeId, EnemyArchetype> = {
  normal: {
    id: 'normal',
    hpMultiplier: 1,
    speedMultiplier: 1,
    damageToBaseMultiplier: 1,
    goldRewardMultiplier: 1,
    expRewardMultiplier: 1,
    threatValue: 1,
  },
  fast: {
    id: 'fast',
    hpMultiplier: 0.6,
    speedMultiplier: 2,
    damageToBaseMultiplier: 0.8,
    goldRewardMultiplier: 1.1,
    expRewardMultiplier: 1.1,
    threatValue: 1.5,
  },
  tank: {
    id: 'tank',
    hpMultiplier: 4,
    speedMultiplier: 0.5,
    damageToBaseMultiplier: 1.5,
    goldRewardMultiplier: 1.5,
    expRewardMultiplier: 1.5,
    threatValue: 3,
  },
  elite: {
    id: 'elite',
    hpMultiplier: 2.5,
    speedMultiplier: 1.1,
    damageToBaseMultiplier: 1.3,
    goldRewardMultiplier: 2.5,
    expRewardMultiplier: 2.5,
    threatValue: 4,
  },
  swarm: {
    id: 'swarm',
    hpMultiplier: 0.3,
    speedMultiplier: 1.7,
    damageToBaseMultiplier: 0.5,
    goldRewardMultiplier: 0.5,
    expRewardMultiplier: 0.5,
    threatValue: 0.5,
  },
  brute: {
    id: 'brute',
    hpMultiplier: 2,
    speedMultiplier: 0.8,
    damageToBaseMultiplier: 1.2,
    goldRewardMultiplier: 1.2,
    expRewardMultiplier: 1.2,
    threatValue: 2,
  },
  // "Moving boss" flavor - big, slow, high reward. Pure stat-multiplier
  // archetype, no new behavior needed.
  giant: {
    id: 'giant',
    hpMultiplier: 5,
    speedMultiplier: 0.4,
    damageToBaseMultiplier: 2,
    goldRewardMultiplier: 3,
    expRewardMultiplier: 3,
    threatValue: 5,
  },
  // Below half HP it speeds up - see MovementSystem.tickMovement, which
  // recomputes this from live HP every tick (not a one-way flag), so a
  // Healer topping it back up visibly calms it down again.
  berserker: {
    id: 'berserker',
    hpMultiplier: 1.2,
    speedMultiplier: 0.9,
    damageToBaseMultiplier: 1.1,
    goldRewardMultiplier: 1.3,
    expRewardMultiplier: 1.3,
    threatValue: 2.5,
    berserker: { hpRatioThreshold: 0.5, speedMultiplier: 2 },
  },
  // Periodically heals nearby enemies - see EnemyAbilitySystem.tickEnemyAbilities.
  // `amount` is a flat placeholder, same "doesn't scale with difficultyScore"
  // precedent speedMultiplier already sets - tune later.
  healer: {
    id: 'healer',
    hpMultiplier: 1,
    speedMultiplier: 0.9,
    damageToBaseMultiplier: 0.8,
    goldRewardMultiplier: 1.5,
    expRewardMultiplier: 1.5,
    threatValue: 2,
    healAbility: { radius: 80, amount: 10, intervalSeconds: 2 },
  },
  // Absorbs exactly one hit - see DamageSystem.applyDamage, which checks
  // shieldActive before touching currentHp.
  shield: {
    id: 'shield',
    hpMultiplier: 1.3,
    speedMultiplier: 0.9,
    damageToBaseMultiplier: 1,
    goldRewardMultiplier: 1.4,
    expRewardMultiplier: 1.4,
    threatValue: 2.5,
    hasShield: true,
  },
  // Deterministic single spawn for a chapter's wave-5 miniboss - never part
  // of the weighted enemySpawnTable, only spawned directly by
  // SpawnSystem/WaveSystem. hasShield gives it one extra "hit it twice" beat
  // beyond raw HP.
  miniboss: {
    id: 'miniboss',
    hpMultiplier: 8,
    speedMultiplier: 0.5,
    damageToBaseMultiplier: 2.5,
    goldRewardMultiplier: 8,
    expRewardMultiplier: 8,
    threatValue: 8,
    hasShield: true,
  },
  // Deterministic single spawn for a chapter's wave-10 big boss. berserker
  // enrage past 50% HP gives a simple "gets scarier near the end" beat
  // without a full multi-phase system.
  boss: {
    id: 'boss',
    hpMultiplier: 20,
    speedMultiplier: 0.45,
    damageToBaseMultiplier: 4,
    goldRewardMultiplier: 20,
    expRewardMultiplier: 20,
    threatValue: 15,
    berserker: { hpRatioThreshold: 0.5, speedMultiplier: 1.6 },
  },
};
