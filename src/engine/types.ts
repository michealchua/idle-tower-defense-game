import type { UpgradeableStat } from '../data/heroConfig';
import type { EnemyArchetypeId } from '../data/enemyArchetypes';
import type { EquipmentRarity, EquipmentSetId, EquipmentSlot, EquipmentSubstat } from '../data/equipmentConfig';
import type { BossKind } from '../data/waveConfig';
import type { AscensionShopId } from '../data/ascensionShopConfig';
import type { PityPoolId } from '../data/pityConfig';
import type { CastleTypeId } from '../data/castleTypeConfig';
import type { DailyQuestId } from '../data/dailyQuestConfig';

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
  // Procedurally rolled once at createHero (see NameGenerator.generateHeroName)
  // - flavor only, never used to look anything up. Per-playthrough, not part
  // of heroRosterConfig, so two players' copies of the same hero id read as
  // individuals instead of clones.
  name: string;
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
  // Which of this hero's own heroRosterConfig.skillUnlocks entries have
  // fired - separate from unlockedMilestoneIds (visual evolution tiers
  // only) since the two are no longer unlocked by the same shared table,
  // see milestoneConfig.ts.
  unlockedSkillIds: string[];
  skills: Record<string, SkillRuntimeState>;
  // Gold-purchased per-hero upgrade levels (see UpgradeSystem.ts) - each
  // hero has its own independent track now, replacing the old GameState-
  // level shared globalUpgrades. Reset (like level/exp) on ascend, see
  // AscensionSystem.ascend.
  upgrades: Record<UpgradeableStat, number>;
  position: Position;
  // Per-hero gear, one item per slot - each hero has their own independent
  // loadout, replacing the old GameState-level shared `equipped` map (see
  // EquipmentSystem.ts/HeroSystem.ts). Set on createHero, mutated only by
  // HeroSystem.equipItemToHero/unequipHeroSlot.
  equipment: Record<EquipmentSlot, EquipmentItem | null>;
  // Which of heroRosterConfig's HeroDefinition.evolutionBranches this hero
  // has chosen - null until HeroSystem.evolveHero fires (requires
  // heroConfig.heroEvolutionConfig.unlockLevel). Unlike level/exp/upgrades,
  // this is never reset by AscensionSystem.ascend - it's permanent
  // collection progress, same as equipment/stars.
  evolutionBranchId: string | null;
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
  // Chip damage dealt to a hero while in range - see
  // CombatSystem.tickEnemyAttacksOnHeroes/enemyConfig.ts.heroDamage.
  heroDamage: number;
  heroAttackCooldownRemaining: number;
  position: Position;
  // Absorbs exactly one hit while true - see DamageSystem.applyDamage.
  // Always present (false for archetypes without hasShield), set at spawn
  // in Enemy.ts.
  shieldActive: boolean;
  // Generic per-enemy active-ability cooldown - healAbility and
  // summonAbility archetypes both use it, named generically so a future
  // active ability doesn't need its own field. See
  // EnemyAbilitySystem.tickEnemyAbilities.
  abilityCooldownRemaining: number;
  // Generic movement-speed slow debuff - always present (1/0 when not
  // slowed) so MovementSystem never needs a fallback. slowMultiplier applies
  // only while slowRemaining > 0; MovementSystem resets it back to 1 once
  // the timer runs out. Nothing currently grants this (the tower that used
  // to - frost - is gone), kept as generic infrastructure for a future
  // skill/mechanic rather than ripped out along with it.
  slowMultiplier: number;
  slowRemaining: number;
  // Charges left before a zombie-archetype enemy actually dies - see
  // DamageSystem.applyDamage. Seeded from archetype.revive.maxRevives at
  // spawn (0 for every archetype without `revive`), decremented on each
  // revive instead of ever going negative.
  revivesRemaining: number;
  // Set only on minions created by a witch-archetype's summonAbility (see
  // EnemyAbilitySystem.tickEnemyAbilities) - the summoning enemy's own
  // instanceId, used to cap how many of its summons can be alive at once.
  // Undefined for every normally-spawned enemy.
  summonedByInstanceId?: number;
  // Procedurally rolled (NameGenerator.generateMonsterName) only for
  // archetypes with a genuine special mechanic - see Enemy.ts's
  // isNamedArchetype. undefined for plain stat-multiplier mobs, which stay
  // nameless so CanvasRenderer only ever labels the enemies actually worth
  // calling out.
  name?: string;
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
  // 副词条 (secondary stats) - count/roll-quality scale with rarity, see
  // equipmentConfig.equipmentRarities.substatCount. Fully re-rolled in place
  // by EquipmentSystem.reforgeEquipment (洗练), never touching slot/rarity/
  // main stat/set/legendary effect.
  substats: EquipmentSubstat[];
  legendaryEffectId?: string;
  // Which 套装 (equipment set) this item belongs to, if any - see
  // equipmentConfig.equipmentSets/getActiveSetBonuses. Only blue+ rarity
  // items can roll one.
  setId?: EquipmentSetId;
}

// Transient toast-feed entry for EquipmentSystem.rollEquipmentDrop - only
// carries what the UI needs to render a "you found X" line (slot/rarity,
// same fields ItemCard's itemTitle already formats from), not the item
// object itself, so a sold/equipped item's toast still reads correctly even
// after the real EquipmentItem it referred to is gone. Same age/lifetime
// tick-and-prune lifecycle as VisualEffect, see EquipmentSystem.
// tickEquipmentDropFeed.
export interface EquipmentDropEvent {
  id: number;
  slot: EquipmentSlot;
  rarity: EquipmentRarity;
  age: number;
  lifetime: number;
}

export type VisualEffectKind =
  | 'attackFlash'
  | 'deathBurst'
  | 'damageNumber'
  | 'healNumber'
  | 'levelUp'
  | 'milestoneUnlock'
  | 'skillImpact'
  | 'lightningBolt'
  | 'healPulse'
  | 'shieldBreak'
  | 'revive'
  | 'summon'
  | 'waveClear';

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
  // currently fielded. deployedHeroIds (a subset, capped by squadConfig) is
  // who actually fights - see CombatSystem/SkillSystem/LevelSystem/
  // DamageSystem, all of which filter to the deployed subset. Pets have no
  // such split - every entry in `pets` is always active, see
  // HeroStatsSystem.computePetPassiveBonuses.
  heroes: HeroState[];
  pets: PetState[];
  unlockedHeroIds: string[];
  unlockedPetIds: string[];
  deployedHeroIds: string[];
  // Gold-purchased castle upgrade level (see castleConfig.ts/CastleSystem.ts)
  // - grows base maxHp and unlocks more hero/pet deploy slots over
  // squadConfig's level-1 baseline, and scales whichever castleType bonus is
  // currently selected below. Survives ascension, same as unlocked
  // heroes/pets/equipment (it's collection/structure progress, not a
  // run-scoped stat).
  castleLevel: number;
  // Which single passive bonus castleLevel currently feeds - see
  // castleTypeConfig.ts. Free/instant to switch (CastleSystem.setCastleType),
  // doesn't reset castleLevel.
  castleType: CastleTypeId;
  // Resource for the talent tree (talentConfig.ts/TalentSystem.ts) - earned
  // only by killing a wave's miniboss/boss (see DamageSystem.handleDeath),
  // never accrues passively. Spent on permanent percentage bonuses that
  // survive ascension (see AscensionSystem.ascend).
  skillPoints: number;
  talentLevels: Record<string, number>;
  // Lifetime ascension counter - never reset, also used as an unlock
  // condition (see unlockConditionConfig.ts). No longer drives a stat
  // multiplier directly; see ascensionPoints/ascensionShopLevels below.
  ascensionLevel: number;
  // Resource for the ascension shop (ascensionShopConfig.ts/
  // AscensionShopSystem.ts) - granted on every ascend() and, like
  // talentLevels, never reset by ascending again.
  ascensionPoints: number;
  ascensionShopLevels: Record<AscensionShopId, number>;
  // Premium currency - no passive income, only discrete rewards (boss kills,
  // chapter clears, ascending; see diamondConfig.ts). Spent on premium gacha
  // pulls, red/rainbow rarity breakthroughs, and direct gold exchange.
  diamonds: number;
  // Gacha economy - keyed by heroRosterConfig/petRosterConfig id, pre-seeded
  // to 0 for every roster entry (see GameState.ts) so reads never need a
  // fallback. Stars are 0-MAX_STAR_LEVEL; see gachaConfig.ts.
  heroShards: Record<string, number>;
  heroStars: Record<string, number>;
  petShards: Record<string, number>;
  petStars: Record<string, number>;
  // Pulls since each pool's last pity-eligible rarity (see pityConfig.ts) -
  // incremented on every pull that isn't itself a hit, reset to 0 on one
  // (natural or forced). Never reset by ascension, same as goldSpentTotal.
  pityCounters: Record<PityPoolId, number>;
  // "新手绝对福利" - the player's very first ever 10-pull (whichever of the
  // four pools they spend it on) is guaranteed at least one gold-or-better
  // hit, see GachaSystem.pullMulti. Flips true the moment that pull
  // resolves and never resets - separate from hasGrantedFirstGachaBonus
  // below, which only tracks whether the *free diamonds* funding that pull
  // have been handed out yet.
  isFirstTenPullDone: boolean;
  // One-shot latch for GachaSystem.tickGachaWelcomeBonus - without this,
  // the "grant free diamonds once GachaPanel unlocks" check (which reruns
  // every GameLoop tick) would re-grant every tick until the player
  // actually spends them. Not surfaced to the UI, so it isn't mirrored into
  // the useGameStore snapshot the way isFirstTenPullDone is.
  hasGrantedFirstGachaBonus: boolean;
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
  // Castle's own currency - produced only by the economic castle type's
  // passive income (castleTypeConfig.getCastleBuildMaterialsPerSecond) and
  // spent only on castle upgrades (castleConfig.getCastleUpgradeCost). Kept
  // isolated from gold so castle progression doesn't compete with hero
  // upgrades for the same pool - see the resource-isolation doc comment at
  // the top of resourceConfig.ts.
  buildMaterials: number;
  nextEnemyInstanceId: number;
  isGameOver: boolean;
  visualEffects: VisualEffect[];
  nextVisualEffectId: number;
  spawnCooldownRemaining: number;
  // Game-feel state, both pure presentation (nothing here is ever read as a
  // gameplay condition). Decays every tick in EffectsSystem.tickScreenShake -
  // CanvasRenderer reads it to jitter the whole canvas by a random offset
  // each frame. See effectConfig.screenShakeConfig for trigger intensities.
  screenShakeIntensity: number;
  // Counts down in GameLoop.step, which skips every gameplay system (but
  // still ticks visualEffects/screenShake) while this is above 0 - a brief,
  // deliberate freeze-frame on a killing blow or crit. See
  // effectConfig.hitStopConfig for trigger durations.
  hitStopRemaining: number;
  // Unequipped items only - equipped gear lives on the owning hero's own
  // HeroState.equipment instead (see EquipmentSystem.ts/HeroSystem.ts).
  inventory: EquipmentItem[];
  nextEquipmentInstanceId: number;
  // Toast feed for equipment drops - see EquipmentDropEvent's doc comment.
  equipmentDropFeed: EquipmentDropEvent[];
  nextEquipmentDropEventId: number;
  // 洗练尘 - salvaging an unequipped item (EquipmentSystem.salvageEquipment)
  // is its only source, reforging an item's substats
  // (EquipmentSystem.reforgeEquipment) its only sink. See resourceConfig.ts.
  reforgeDust: number;
  // ISO date (YYYY-MM-DD, local) of the last calendar day the daily login
  // reward was granted - null means never. See GachaSystem.
  // tickDailyLoginReward. Persisted via SaveSystem.ts, so this now genuinely
  // differs only once per real calendar day across saved sessions.
  lastLoginDate: string | null;
  // One-shot latch guarding WaveSystem.tickTutorialStoryTrigger - true the
  // moment a save has ever reached Wave 1, so the new-player StoryDialog
  // script never refires (including after loading a save already past wave
  // 1). Persisted, unlike pendingStoryId below.
  hasSeenTutorialStory: boolean;
  // BiomeIds (biomeConfig.ts) whose storyConfig.ts chapter-intro script has
  // already played, ever - the biome cycle repeats every 10 chapters
  // (getBiomeForChapter) but each biome's own story beat should only play
  // once. See WaveSystem.advanceToNextWave.
  seenChapterStoryIds: string[];
  // Ids of tutorialConfig.ts steps the player has already dismissed - each
  // fires once, forever, same "one-shot latch" contract as
  // hasSeenTutorialStory. See TutorialOverlay.tsx/tutorialConfig.
  // getActiveTutorialStep.
  completedTutorialStepIds: string[];
  // Plan section 28's local "活动"/records equivalent (no backend to drive a
  // real leaderboard or live-service event calendar) - see
  // DailyQuestSystem.ts for reset/progress/claim, RecordsPanel.tsx for the
  // UI. dailyQuestDate mirrors lastLoginDate's "ISO date, local, null means
  // never" contract.
  dailyQuestDate: string | null;
  dailyQuestProgress: Record<DailyQuestId, number>;
  dailyQuestClaimed: Record<DailyQuestId, boolean>;
  // Lifetime personal-best records, never reset by ascension (same category
  // as goldSpentTotal) - the local stand-in for a "排行榜" this offline game
  // has no backend to actually serve. See RecordsPanel.tsx.
  highestGlobalWaveReached: number;
  totalBossKills: number;
  // Which storyConfig.ts script StoryDialog should currently display, or
  // null when no dialog is active. Transient UI-trigger state (not
  // meaningful to persist mid-dialog), reset to null on load - see
  // SaveSystem.ts/useGameStore.loadGame. While set, GameLoop pauses
  // gameplay ticks the same way hitStopRemaining does, so combat can't
  // progress behind the dialog.
  pendingStoryId: string | null;
}
