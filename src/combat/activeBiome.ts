// Shared "which biome's rules are live right now" seam - BattleHero,
// BattleEnemy, CombatEngine and InventoryManager all need to consult the
// current theme's BiomeMechanics hooks, but none of them own a reference to
// ThemeManager (and shouldn't - it's GameManager's concern to own the run's
// environment state). This module is the single, dependency-free place they
// all read from instead: ThemeManager writes to it via
// setActiveBiomeMechanics whenever the active theme changes, and everything
// else calls getActiveBiomeMechanics() to consult it. Every field on
// BiomeMechanics is optional, and every call site here treats a null/
// undefined mechanics object (nothing set yet - e.g. a headless test that
// constructs a BattleHero without ever touching ThemeManager) as "no biome
// rules apply", so this system is entirely opt-in.
//
// Only type-only imports below (BattleHero/BattleEnemy/CombatEngine) -
// those get erased at compile time, so this module has zero runtime
// dependency on any of them despite each of *those* modules importing
// getActiveBiomeMechanics as a real (value) import. That's what keeps this
// a hub-and-spoke dependency graph instead of a real circular one.
import type { BattleHero } from './BattleHero';
import type { BattleEnemy } from './BattleEnemy';
import type { CombatEngine } from './CombatEngine';
import type { StatModifiers } from './Equipment';

export interface BiomeMechanics {
  /** Theme id this mechanics set belongs to - purely for debug/logging, never branched on. */
  readonly themeId: string;

  /** Ticked once per GameManager.update(deltaTime) call while this theme is active - periodic field-wide effects (Volcano's burn pulse, Poison Swamp's enemy regen, Forest's lowest-HP heal, Ocean's knockback wave). Implementations own their own interval bookkeeping (a closured accumulator, not deltaTime-since-epoch), since GameManager just forwards deltaTime every tick with no extra state. */
  onUpdate?(deltaTime: number, combatEngine: CombatEngine): void;

  /** Fired the instant an enemy is added to the field (CombatEngine.addEnemy) while this theme is active - Snow Mountain's permanent on-spawn Slow. */
  onEnemySpawn?(enemy: BattleEnemy): void;

  /** Last-step adjustment to one of a hero's fully-computed (level + equipment) stats - called from BattleHero.computeFinalStat. Sky Realm's attack-speed buff, Ancient Ruins' maxHp penalty, Dark Cave's crit-rate penalty, Ocean's attack-speed penalty all live here. */
  modifyHeroStat?(statKey: keyof StatModifiers, value: number, hero: BattleHero): number;

  /** Adjusts a ranged skill's effective targeting range (Desert's -20%, isRangedSkill mirrors CombatEngine's own `projectileSpeed !== undefined` check for that skill). Left untouched for melee skills. */
  modifyHeroRange?(range: number, isRangedSkill: boolean): number;

  /** Whether an incoming single-target enemy attack against `hero` should be dodged entirely (Desert's +15% melee dodge - only ever consulted for melee heroes, see CombatEngine.resolveEnemyAttack). Not consulted for AoE pulses, which are meant to be unavoidable. */
  shouldDodgeEnemyAttack?(hero: BattleHero): boolean;

  /** Adjusts a hero's crit chance/damage multiplier before the roll - Dark Cave's -10 points chance / +50% damage. Returns the (possibly unchanged) pair. */
  modifyCrit?(chance: number, damageMultiplier: number): { chance: number; damageMultiplier: number };

  /** Last-step adjustment to outgoing hero -> enemy damage, after crit resolves - also where a hook applies its own side effects that need to see both participants (Demon Abyss's 10% lifesteal heals `hero` directly here). Returns the (possibly unchanged) damage. */
  modifyOutgoingDamage?(damage: number, context: { isCrit: boolean; hero: BattleHero; enemy: BattleEnemy }): number;

  /** Adjusts healing received by a hero before it's applied (Poison Swamp's -30%). Not consulted for BattleHero.revive - that's a wave-boundary reset, not in-combat healing. */
  modifyIncomingHeal?(amount: number): number;

  /** Adjusts a defeated enemy's loot-drop chance roll, 0..1 (Ancient Ruins' +20 points). */
  modifyLootChance?(chance: number): number;

  /** Multiplier applied to every enemy's movement speed and attack cadence (Ocean's -10% for "所有实体"; the hero side of the same effect goes through modifyHeroStat's attackSpeed case instead). */
  modifyEnemySpeedMultiplier?(multiplier: number): number;

  /** Adjusts an enemy's single-target attack damage before armor mitigation - Demon Abyss's "每损失 1% HP，攻击力提升 1%" scaling, computed off the enemy's own currentHp/maxHp. Called from BattleEnemy.effectiveAttackDamage, so it also stacks with (is applied after) that enemy's own enrage multiplier if it has one. */
  modifyEnemyAttackDamage?(baseDamage: number, enemy: BattleEnemy): number;
}

let activeMechanics: BiomeMechanics | null = null;

export function setActiveBiomeMechanics(mechanics: BiomeMechanics | null): void {
  activeMechanics = mechanics;
}

export function getActiveBiomeMechanics(): BiomeMechanics | null {
  return activeMechanics;
}
