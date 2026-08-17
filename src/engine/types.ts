import type { UpgradeableStat } from '../data/heroConfig';
import type { EnemyArchetypeId } from '../data/enemyArchetypes';
import type { EquipmentRarity, EquipmentSetId, EquipmentSlot, EquipmentSubstat } from '../data/equipmentConfig';
import type { BossKind } from '../data/waveConfig';
import type { AscensionShopId } from '../data/ascensionShopConfig';
import type { PityPoolId } from '../data/pityConfig';
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
  // Copied from HeroDefinition.name (heroRosterConfig.ts) at createHero -
  // flavor only, never used to look anything up. Fixed per roster id (not
  // per-playthrough anymore) so CodexPanel can show the same name for a
  // hero the player hasn't unlocked yet, see HeroDefinition.name's doc
  // comment for why that requires it to be deterministic.
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
  // Every skill ever drawn from the skill gacha (GachaSystem's skill pool,
  // see skillConfig.ts) plus whatever HeroSystem.evolveHero grants directly
  // - permanent collection, never reset by AscensionSystem.ascend (same
  // category as heroShards). Not all of these necessarily cast in combat -
  // see equippedSkillIds below for the subset that actually does.
  ownedSkillIds: string[];
  // Player-chosen subset of ownedSkillIds that actually ticks/casts (see
  // SkillSystem.tickHeroSkills) - capped at HeroSystem.MAX_EQUIPPED_SKILLS.
  // Reset on ascend (level/stats reset too, so re-picking a loadout makes
  // sense) even though the ownedSkillIds collection itself survives.
  equippedSkillIds: string[];
  skills: Record<string, SkillRuntimeState>;
  // Gold-purchased per-hero upgrade levels (see UpgradeSystem.ts) - each
  // hero has its own independent track now, replacing the old GameState-
  // level shared globalUpgrades. Reset (like level/exp) on ascend, see
  // AscensionSystem.ascend.
  upgrades: Record<UpgradeableStat, number>;
  // Live, moves during combat (see MovementSystem.tickHeroMovement) - walks
  // toward whatever enemy moveTargetEnemyInstanceId points at once it's
  // outside attackRange, and drifts back toward homePosition once there's no
  // target. CombatSystem/SkillSystem's own range checks already read this
  // field live, so a hero mid-walk only actually starts attacking once
  // movement has closed the distance to attackRange.
  position: Position;
  // The hero's deployed-slot anchor (see HeroSystem.relayoutDeployedHeroes) -
  // fixed until deployedSlotIndex changes, unlike position above.
  // BattleScreen's deploy-slot-grid drawing and drag hit-testing both care
  // about slot layout, not wherever a hero has wandered off to mid-fight,
  // hence the split.
  homePosition: Position;
  // Which of the fixed 9-cell grid (mapConfig.layoutSlotPositions) this
  // deployed hero occupies - null when benched. Persistent (survives
  // teammates deploying/undeploying elsewhere) rather than derived from
  // index-in-deployedHeroIds, so BattleScreen's canvas-native drag can move a
  // hero to any specific cell (including an empty one), not just swap with
  // another hero - see HeroSystem.moveHeroToSlot.
  deployedSlotIndex: number | null;
  // Sticky pursuit target (see tickHeroMovement) - null when idle/home or
  // when nothing's currently in engage range. Kept separate from combat's
  // own per-attack target selection (CombatSystem always just fires at
  // whatever's in range right now) so a hero mid-walk commits to closing the
  // distance on one enemy instead of flip-flopping toward whichever enemy
  // reads as "best" each individual tick.
  moveTargetEnemyInstanceId: number | null;
  // Per-hero gear, one item per slot - each hero has their own independent
  // loadout, replacing the old GameState-level shared `equipped` map (see
  // EquipmentSystem.ts/HeroSystem.ts). Set on createHero, mutated only by
  // HeroSystem.equipItemToHero/unequipHeroSlot.
  equipment: Record<EquipmentSlot, EquipmentItem | null>;
  // Ordered chain of heroRosterConfig HeroEvolutionBranch ids this hero has
  // chosen, tier by tier (see HeroSystem.evolveHero/
  // getAvailableEvolutionBranches) - empty until the first evolve fires.
  // Unlike level/exp/upgrades, this is never reset by AscensionSystem.ascend
  // - it's permanent collection progress, same as equipment/stars.
  evolutionPath: string[];
  // True once currentHp has been driven to 0 this wave attempt (see
  // DamageSystem.applyDamageToHero) - a downed hero stays in
  // heroes/deployedHeroIds (never removed) but stops attacking/moving/
  // casting/being targeted (see CombatSystem/MovementSystem/SkillSystem's
  // getAliveDeployedHeroes usage) until WaveSystem.resetBattlefieldForWave
  // clears it on the next wave attempt. WaveSystem.tickWaveProgress fails
  // the current wave the moment every deployed hero is downed at once - see
  // its checkSquadWipe.
  isDowned: boolean;
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

// No HP/damage semantics anymore (the castle/base-HP mechanic was removed -
// see WaveSystem's checkSquadWipe, which replaced it as the loss condition).
// position survives as a plain map anchor: MovementSystem's "hold position
// once close enough" line and TargetingSystem's closestToBase strategy both
// still need a fixed point to measure distance against.
export interface BaseState {
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
  | 'waveClear'
  // Not drawn as its own shape - a short-lived marker CanvasRenderer looks up
  // by entityKey to flash/squash the specific hero/enemy that was just hit.
  // See DamageSystem.applyDamage/applyDamageToHero (spawn) and
  // CanvasRenderer.drawEntityWithHitReaction (consume).
  | 'hitReaction'
  // Same "marker only, not drawn" contract as hitReaction - CanvasRenderer
  // looks this up by entityKey to swap the caster's sprite to its 'cast'
  // pose for a moment. See SkillSystem's three cast-success paths (spawn)
  // and CanvasRenderer.drawHero (consume).
  | 'castPose'
  // A single effect object carrying a small pre-generated particle set (see
  // `particles` below) rather than one VisualEffect per particle - keeps a
  // crit/kill/boss-kill burst to one MAX_VISUAL_EFFECTS slot instead of N.
  | 'particleBurst';

export interface VisualEffect {
  id: number;
  kind: VisualEffectKind;
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  amount?: number;
  // damageNumber only - amount as a fraction of the target's maxHp at the
  // moment of the hit, so CanvasRenderer can scale a number's size/reach by
  // how much it actually mattered rather than a fixed font size for every
  // hit regardless of magnitude. See DamageSystem.applyDamage/
  // applyDamageToHero (the only two spawn sites).
  amountRatio?: number;
  isCritical?: boolean;
  radius?: number;
  // attackFlash (owner = the attacking hero) / hitReaction (owner = the hero
  // or enemy that was hit) only - see engine/entityKey.ts for the key
  // convention. Effects that don't attribute to one specific rendered entity
  // (deathBurst, skillImpact, etc.) leave this undefined.
  entityKey?: string;
  // particleBurst only - each entry's on-screen position at a given age is
  // derived (x + cos(angle)*speed*age, ...), not stored per-frame, so this
  // stays a small fixed array generated once at spawn (see
  // EffectsSystem.spawnParticleBurst).
  particles?: { angle: number; speed: number }[];
  // particleBurst only - hex color for this burst's particles (crit/kill/
  // boss-kill/skill-impact/hero-down each get their own, see
  // effectConfig.particleBurstConfig).
  color?: string;
  // skillImpact/lightningBolt/healPulse only - selects which distinct
  // geometry CanvasRenderer draws for this specific skill (see
  // SkillDefinition.shape in skillConfig.ts, threaded through by
  // SkillSystem's three cast functions) instead of one shared shape per
  // effectType. Undefined falls back to each kind's original plain
  // ring/line/pulse shape.
  shape?: string;
  age: number;
  lifetime: number;
}

// One-shot audio cues the engine wants played - see SfxManager.ts (the only
// consumer, in the React layer via App.tsx) for what each one sounds like.
// Deliberately a flat id list, not parametrized (e.g. no per-rarity gacha
// ids here) - gacha/equipment-drop sfx are triggered straight from
// GachaPanel.tsx/EquipmentDropToast.tsx instead, since those already have
// the result data client-side; this queue is only for events that happen
// deep in engine ticks with no other React-visible signal to hook.
export type SfxEventId = 'hit' | 'crit' | 'enemyDeath' | 'bossKill' | 'heroDown' | 'levelUp' | 'waveClear' | 'bossIntro';

export interface GameState {
  // The full collection: every unlocked hero/pet, regardless of whether it's
  // currently fielded. deployedHeroIds (a subset, capped by squadConfig) is
  // who actually fights - see CombatSystem/SkillSystem/LevelSystem/
  // DamageSystem, all of which filter to the deployed subset. Pets have no
  // such deployed/benched split for passives - every entry in `pets` always
  // contributes its passiveBonus, see HeroStatsSystem.computePetPassiveBonuses.
  // activePetId below is a separate, narrower concept layered on top.
  heroes: HeroState[];
  pets: PetState[];
  unlockedHeroIds: string[];
  unlockedPetIds: string[];
  deployedHeroIds: string[];
  // Nav-tab red-dot tracking (NotificationSystem.ts) - ids the player has
  // already looked at (opened the relevant panel since obtaining them), so
  // the dot only shows for genuinely new items rather than every owned one
  // forever. seenSkillIds starts pre-seeded with the protagonist's starter
  // skills (see GameState.ts) so a fresh save doesn't open with a dot.
  // Equipment has no stable per-item id worth tracking this way (items are
  // consumed by equip/sell), so it's a plain unseen-drop counter instead.
  seenSkillIds: string[];
  seenPetIds: string[];
  unseenEquipmentCount: number;
  // The one pet (at most) drawing its auraEffect (petRosterConfig.ts,
  // PetAuraSystem.tickPetAura) - separate from the passive-bonus split
  // above, which every owned pet participates in regardless of this. null
  // = no pet deployed, no aura ticking. Not reset by AscensionSystem.ascend
  // (same permanent-choice category as HeroState.evolutionPath).
  activePetId: string | null;
  // Countdown to activePetId's next auraEffect tick (PetAuraSystem.
  // tickPetAura) - single shared timer since only one pet can ever be
  // active at once, unlike hero.skills' per-skill cooldown map. Reset
  // whenever the active pet changes (PetSystem.deployPet) so switching
  // pets doesn't inherit a stale countdown from a differently-paced aura.
  petAuraCooldownRemaining: number;
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
  // Skill gacha's duplicate-pull currency (see GachaSystem.pullSkill),
  // keyed by skillConfig.ts id and pre-seeded to 0 for every skill same as
  // hero/petShards above. No spend UI yet - tracked so a future skill
  // upgrade system has a resource to build on rather than needing a new one.
  skillShards: Record<string, number>;
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
  // Counts down in GameLoop.step exactly like hitStopRemaining (skips every
  // gameplay system, including re-running tickSpawn, while this is above 0)
  // but for a much longer "boss just appeared" dramatic pause instead of a
  // punchy freeze-frame - set once by SpawnSystem.tickSpawn the tick a
  // boss/miniboss spawns. See effectConfig.bossIntroConfig and
  // BattleScreen.tsx's banner overlay, which is only shown while this is > 0.
  bossIntroRemaining: number;
  // Queued by EffectsSystem.queueSfx from wherever a combat/progression beat
  // happens (DamageSystem/LevelSystem/WaveSystem/SpawnSystem) - App.tsx's
  // sfx-consuming effect drains this every time the store snapshot's array
  // reference changes (GameLoop.step clears it right after each onTick), so
  // the engine itself never touches Web Audio directly.
  pendingSfxEvents: SfxEventId[];
  // Counts down every tick regardless of pause state (EffectsSystem.
  // tickVictoryPose, called alongside tickEffects/tickScreenShake - does NOT
  // gate gameplay like hitStopRemaining/bossIntroRemaining, purely a display
  // timer) - while > 0, every deployed hero shows its 'victory' sprite pose.
  // Set once by WaveSystem.advanceToNextWave. See effectConfig.
  // victoryPoseConfig for the duration.
  victoryPoseRemaining: number;
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
