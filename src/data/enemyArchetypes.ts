import type { ElementId } from './elementConfig';

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
  | 'zombie'
  | 'witch'
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

// See DamageSystem.applyDamage - checked (after shieldActive) whenever a hit
// would bring currentHp to 0. Consumes one charge from the enemy's own
// runtime EnemyState.revivesRemaining (set from maxRevives at spawn in
// Enemy.ts) instead of dying, restoring HP to reviveHpRatio of maxHp.
export interface ReviveBehavior {
  maxRevives: number;
  reviveHpRatio: number;
}

// See EnemyAbilitySystem.tickEnemyAbilities - same cooldown/interval shape as
// HealAbility, but spawns a fresh minion at the caster's own position instead
// of buffing nearby allies. maxActiveSummons caps how many of this witch's
// own live summons (EnemyState.summonedByInstanceId) count against it, so
// killing the minions lets it summon again before the cooldown would
// otherwise allow.
export interface SummonAbility {
  minionArchetypeId: EnemyArchetypeId;
  maxActiveSummons: number;
  intervalSeconds: number;
}

export interface EnemyArchetype {
  id: EnemyArchetypeId;
  // See elementConfig.ts - what a hero's element multiplier is computed
  // against when it hits this archetype.
  element: ElementId;
  hpMultiplier: number;
  speedMultiplier: number;
  damageToBaseMultiplier: number;
  goldRewardMultiplier: number;
  expRewardMultiplier: number;
  // Not consumed by anything yet - a future threat-budget spawn system reads
  // this instead of just counting enemies. Inert hook, not wired up here.
  threatValue: number;
  // All below are optional - unset means "no special behavior", which is
  // every archetype up through brute. giant is still a pure stat-multiplier
  // archetype (a bigger tank), same as normal/fast/tank/elite/swarm/brute.
  berserker?: BerserkerBehavior;
  healAbility?: HealAbility;
  hasShield?: boolean;
  revive?: ReviveBehavior;
  summonAbility?: SummonAbility;
  // See MovementSystem.tickMovement - once within this x-distance of the
  // base, the enemy stops advancing instead of continuing on to
  // baseArrivalDistance, and so never deals damageToBase. It just holds
  // position and fights whatever's in range - "boss engages heroes, never
  // the base" without needing a separate targeting mode.
  stationaryEngageDistance?: number;
}

export const enemyArchetypes: Record<EnemyArchetypeId, EnemyArchetype> = {
  normal: {
    id: 'normal',
    element: 'earth',
    hpMultiplier: 1,
    speedMultiplier: 1,
    damageToBaseMultiplier: 1,
    goldRewardMultiplier: 1,
    expRewardMultiplier: 1,
    threatValue: 1,
  },
  fast: {
    id: 'fast',
    element: 'wind',
    hpMultiplier: 0.6,
    speedMultiplier: 2,
    damageToBaseMultiplier: 0.8,
    goldRewardMultiplier: 1.1,
    expRewardMultiplier: 1.1,
    threatValue: 1.5,
  },
  tank: {
    id: 'tank',
    element: 'earth',
    hpMultiplier: 4,
    speedMultiplier: 0.5,
    damageToBaseMultiplier: 1.5,
    goldRewardMultiplier: 1.5,
    expRewardMultiplier: 1.5,
    threatValue: 3,
  },
  elite: {
    id: 'elite',
    element: 'fire',
    hpMultiplier: 2.5,
    speedMultiplier: 1.1,
    damageToBaseMultiplier: 1.3,
    goldRewardMultiplier: 2.5,
    expRewardMultiplier: 2.5,
    threatValue: 4,
  },
  swarm: {
    id: 'swarm',
    element: 'wind',
    hpMultiplier: 0.3,
    speedMultiplier: 1.7,
    damageToBaseMultiplier: 0.5,
    goldRewardMultiplier: 0.5,
    expRewardMultiplier: 0.5,
    threatValue: 0.5,
  },
  brute: {
    id: 'brute',
    element: 'earth',
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
    element: 'earth',
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
    element: 'fire',
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
    element: 'light',
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
    element: 'water',
    hpMultiplier: 1.3,
    speedMultiplier: 0.9,
    damageToBaseMultiplier: 1,
    goldRewardMultiplier: 1.4,
    expRewardMultiplier: 1.4,
    threatValue: 2.5,
    hasShield: true,
  },
  // Comes back once at half HP the first time it would die - see
  // DamageSystem.applyDamage, which checks EnemyState.revivesRemaining
  // (seeded from maxRevives at spawn) before calling handleDeath. Tanky and
  // slow rather than fast, since the revive already buys it a second wind.
  zombie: {
    id: 'zombie',
    element: 'dark',
    hpMultiplier: 1.6,
    speedMultiplier: 0.7,
    damageToBaseMultiplier: 1.2,
    goldRewardMultiplier: 1.8,
    expRewardMultiplier: 1.8,
    threatValue: 3.5,
    revive: { maxRevives: 1, reviveHpRatio: 0.5 },
  },
  // Periodically spawns a swarm minion at its own position - see
  // EnemyAbilitySystem.tickEnemyAbilities. Deliberately squishy in its own
  // right (low hpMultiplier/damageToBaseMultiplier) so its threat comes from
  // the minions it keeps adding, not from itself.
  witch: {
    id: 'witch',
    element: 'dark',
    hpMultiplier: 0.8,
    speedMultiplier: 0.9,
    damageToBaseMultiplier: 0.6,
    goldRewardMultiplier: 2,
    expRewardMultiplier: 2,
    threatValue: 3.5,
    summonAbility: { minionArchetypeId: 'swarm', maxActiveSummons: 3, intervalSeconds: 4 },
  },
  // Deterministic single spawn for a chapter's wave-5 miniboss - never part
  // of the weighted enemySpawnTable, only spawned directly by
  // SpawnSystem/WaveSystem. hasShield gives it one extra "hit it twice" beat
  // beyond raw HP.
  miniboss: {
    id: 'miniboss',
    element: 'fire',
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
  // without a full multi-phase system. stationaryEngageDistance=130 stops it
  // just past mapConfig.heroPosition (base-to-hero distance is 120), so it
  // always halts within easy reach of the deployed squad's attackRange=100
  // but well short of baseArrivalDistance=10 - it only ever fights heroes,
  // never the base, which makes damageToBaseMultiplier below permanently
  // inert (kept for type-shape consistency with every other archetype, not
  // because anything reads it for boss).
  boss: {
    id: 'boss',
    element: 'dark',
    hpMultiplier: 20,
    speedMultiplier: 0.45,
    damageToBaseMultiplier: 4,
    goldRewardMultiplier: 20,
    expRewardMultiplier: 20,
    threatValue: 15,
    berserker: { hpRatioThreshold: 0.5, speedMultiplier: 1.6 },
    stationaryEngageDistance: 130,
  },
};
