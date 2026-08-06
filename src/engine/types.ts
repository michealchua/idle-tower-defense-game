import type { UpgradeableStat } from '../data/heroConfig';
import type { EnemyArchetypeId } from '../data/enemyArchetypes';
import type { EquipmentAffix, EquipmentRarity, EquipmentSlot } from '../data/equipmentConfig';
import type { BossKind } from '../data/waveConfig';

export interface Position {
  x: number;
  y: number;
}

// Deliberately not just a cooldown number - room to add charges, stacks,
// energy/mana, or an active-duration timer later without redesigning how
// HeroState stores per-skill runtime data.
export interface SkillRuntimeState {
  cooldownRemaining: number;
}

export interface HeroState {
  // Matches a heroRosterConfig id - which template's rarity/statMultiplier
  // this hero uses. Roster entries are 1:1 with deployed heroes.
  id: string;
  level: number;
  maxHp: number;
  currentHp: number;
  // All five of these are fully-computed/effective values, written only by
  // HeroStatsSystem.recomputeHeroStats - nothing else mutates them directly
  // anymore (see recomputeHeroStats for the full input list: template,
  // ascension, evolution tier, level growth, global upgrades, equipment,
  // pet passives).
  attackDamage: number;
  attackSpeed: number;
  attackRange: number;
  criticalChance: number;
  attackCooldownRemaining: number;
  exp: number;
  expToNextLevel: number;
  unlockedMilestoneIds: string[];
  skills: Record<string, SkillRuntimeState>;
  position: Position;
}

export interface PetState {
  // Matches a petRosterConfig id.
  id: string;
  position: Position;
  // Same "fully computed" contract as HeroState's combat stats, written only
  // by HeroStatsSystem.recomputePetStats.
  attackDamage: number;
  attackSpeed: number;
  attackRange: number;
  attackCooldownRemaining: number;
}

export interface TowerState {
  // Matches a towerConfig id. Unlike heroes/pets, one tower id = one
  // instance - there's no gacha/duplicate concept, just build once and
  // upgrade in place (see TowerSystem.upgradeTower).
  id: string;
  level: number;
  position: Position;
  // Fully-computed by TowerSystem.recomputeTowerStats, same contract as
  // HeroState/PetState combat stats. 0 for the economy (gold-generating)
  // tower kind, which never attacks.
  attackDamage: number;
  attackSpeed: number;
  attackRange: number;
  attackCooldownRemaining: number;
  // Economy tower kind only - see towerConfig.ts. 0 for combat towers.
  goldPerSecond: number;
}

export interface EnemyState {
  instanceId: number;
  // Drives stats/behavior - what an enemy IS.
  archetypeId: EnemyArchetypeId;
  // Drives rendering only - what an enemy LOOKS LIKE. Defaults to
  // archetypeId today, but kept separate so a future visual variant or
  // enemy visual-evolution system never touches gameplay code.
  visualId: string;
  maxHp: number;
  currentHp: number;
  goldReward: number;
  expReward: number;
  speed: number;
  damageToBase: number;
  position: Position;
  // Absorbs exactly one hit while true - see DamageSystem.applyDamage.
  // Always present (false for archetypes without hasShield), set at spawn
  // in Enemy.ts.
  shieldActive: boolean;
  // Generic per-enemy active-ability cooldown - only healAbility archetypes
  // use it in v1, but named generically so a future active ability doesn't
  // need its own field. See EnemyAbilitySystem.tickEnemyAbilities.
  abilityCooldownRemaining: number;
  // Frost tower slow debuff (see TowerSystem.tickTowerCombat) - always
  // present (1/0 when not slowed) so MovementSystem never needs a fallback.
  // slowMultiplier applies only while slowRemaining > 0; MovementSystem
  // resets it back to 1 once the timer runs out.
  slowMultiplier: number;
  slowRemaining: number;
}

export interface BaseState {
  maxHp: number;
  currentHp: number;
  position: Position;
}

// The only place wave transitions happen is WaveSystem.ts - everything else
// (SpawnSystem, MovementSystem, DifficultySystem) just reads this.
export interface WaveState {
  chapter: number;
  waveInChapter: number;
  isBossWave: boolean;
  // Set only when isBossWave is true.
  bossKind?: BossKind;
  // Normal waves only - counts down as SpawnSystem spawns from the wave's
  // roster; 0 for boss waves (they spawn exactly one enemy instead).
  enemiesRemainingToSpawn: number;
  // Boss waves only - guards against re-spawning the boss every tick once
  // it's already down.
  bossSpawned: boolean;
  // Boss waves only - counts down; undefined for normal waves (no timer).
  timeRemaining?: number;
}

export interface EquipmentItem {
  instanceId: number;
  slot: EquipmentSlot;
  rarity: EquipmentRarity;
  stat: UpgradeableStat;
  // Base (0-star) roll of the primary stat - see
  // equipmentConfig.getEquipmentMainStatValue for the star-scaled value.
  value: number;
  starLevel: number;
  affixes: EquipmentAffix[];
  legendaryEffectId?: string;
}

export type VisualEffectKind =
  | 'attackFlash'
  | 'deathBurst'
  | 'damageNumber'
  | 'levelUp'
  | 'milestoneUnlock'
  | 'skillImpact'
  | 'lightningBolt'
  | 'healPulse'
  | 'shieldBreak'
  | 'waveClear'
  | 'towerSplash'
  | 'frostImpact';

export interface VisualEffect {
  id: number;
  kind: VisualEffectKind;
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  amount?: number;
  isCritical?: boolean;
  radius?: number;
  age: number;
  lifetime: number;
}

export interface GameState {
  // The full collection: every unlocked hero/pet, regardless of whether it's
  // currently fielded. deployedHeroIds/deployedPetIds (a subset, capped by
  // squadConfig) is who actually fights - see CombatSystem/SkillSystem/
  // LevelSystem/DamageSystem, all of which filter to the deployed subset.
  heroes: HeroState[];
  pets: PetState[];
  towers: TowerState[];
  unlockedHeroIds: string[];
  unlockedPetIds: string[];
  unlockedTowerIds: string[];
  deployedHeroIds: string[];
  deployedPetIds: string[];
  deployedTowerIds: string[];
  // Gold-purchased castle upgrade level (see castleConfig.ts/CastleSystem.ts)
  // - grows base maxHp and unlocks more hero/pet/tower deploy slots over
  // squadConfig's level-1 baseline. Survives ascension, same as unlocked
  // heroes/pets/equipment (it's collection/structure progress, not a
  // run-scoped stat).
  castleLevel: number;
  // Passive resource for the talent tree (talentConfig.ts/TalentSystem.ts) -
  // accumulates over time regardless of combat, spent on permanent
  // percentage bonuses. skillPointAccumulator is the fractional-seconds
  // carry so partial progress isn't lost between whole-point ticks.
  skillPoints: number;
  skillPointAccumulator: number;
  talentLevels: Record<string, number>;
  // Shared across every hero - upgrades used to live per-hero on HeroState,
  // but with multiple simultaneous heroes there is exactly one team-wide
  // upgrade track, same as the equipment loadout below.
  globalUpgrades: Record<UpgradeableStat, number>;
  ascensionLevel: number;
  // Gacha economy - keyed by heroRosterConfig/petRosterConfig id, pre-seeded
  // to 0 for every roster entry (see GameState.ts) so reads never need a
  // fallback. Stars are 0-MAX_STAR_LEVEL; see gachaConfig.ts.
  heroShards: Record<string, number>;
  heroStars: Record<string, number>;
  petShards: Record<string, number>;
  petStars: Record<string, number>;
  // Rare star-up materials for purple/gold rarity only - no real income
  // source built yet, granted via debug tools for now.
  epicSourceStone: number;
  legendarySourceStone: number;
  // Lifetime gold spent (gacha pulls, star-ups, upgrades, equipment
  // star-ups) - never decreases. Drives the 'goldSpent' unlock condition,
  // see unlockConditionConfig.ts.
  goldSpentTotal: number;
  wave: WaveState;
  enemies: EnemyState[];
  base: BaseState;
  gold: number;
  nextEnemyInstanceId: number;
  isGameOver: boolean;
  visualEffects: VisualEffect[];
  nextVisualEffectId: number;
  spawnCooldownRemaining: number;
  inventory: EquipmentItem[];
  equipped: Record<EquipmentSlot, EquipmentItem | null>;
  nextEquipmentInstanceId: number;
}
