import { spawnVisualEffect, triggerHitStop, triggerScreenShake } from './EffectsSystem';
import { rollEquipmentDrop } from './EquipmentSystem';
import { getAliveDeployedHeroes } from './HeroStatsSystem';
import { enemyArchetypes } from '../../data/enemyArchetypes';
import { effectLifetimes, hitStopConfig, screenShakeConfig } from '../../data/effectConfig';
import { getTalentMultiplier, talentPointRewardConfig } from '../../data/talentConfig';
import { getAscensionShopMultiplier } from '../../data/ascensionShopConfig';
import { getBondEffects } from '../../data/bondConfig';
import { diamondRewardConfig } from '../../data/diamondConfig';
import { incrementDailyQuestProgress } from './DailyQuestSystem';
import type { EnemyState, GameState, HeroState } from '../types';

export interface DamageResult {
  amount: number;
  isCritical: boolean;
}

export function calculateDamage(baseDamage: number, criticalChance: number): DamageResult {
  const isCritical = Math.random() < criticalChance;
  return {
    amount: isCritical ? baseDamage * 2 : baseDamage,
    isCritical,
  };
}

export function applyDamage(state: GameState, target: EnemyState, damage: DamageResult): void {
  // Shield absorbs exactly one hit - no HP loss, no damage number, just the
  // shield popping. Every hit after this one behaves normally.
  if (target.shieldActive) {
    target.shieldActive = false;
    spawnVisualEffect(state, {
      kind: 'shieldBreak',
      x: target.position.x,
      y: target.position.y,
      lifetime: effectLifetimes.shieldBreak,
    });
    return;
  }

  target.currentHp -= damage.amount;

  spawnVisualEffect(state, {
    kind: 'damageNumber',
    x: target.position.x,
    y: target.position.y,
    amount: damage.amount,
    isCritical: damage.isCritical,
    lifetime: effectLifetimes.damageNumber,
  });

  // A crit is always hero-dealt (applyDamage is only ever called against
  // enemies - enemy-on-hero chip damage goes through applyDamageToHero below,
  // which has no crit calc) - subtle jolt plus a brief freeze-frame so the
  // hit reads as heavier even before it happens to be a kill.
  if (damage.isCritical) {
    triggerScreenShake(state, screenShakeConfig.criticalIntensity);
    triggerHitStop(state, hitStopConfig.criticalHitSeconds);
  }

  if (target.currentHp <= 0) {
    // Zombie-archetype enemies come back instead of dying while they still
    // have charges - no gold/exp/drop rewards for this "death" since it
    // didn't actually happen, same early-return shape as the shieldActive
    // check above.
    if (target.revivesRemaining > 0) {
      target.revivesRemaining -= 1;
      const reviveHpRatio = enemyArchetypes[target.archetypeId].revive?.reviveHpRatio ?? 0.5;
      target.currentHp = Math.round(target.maxHp * reviveHpRatio);
      spawnVisualEffect(state, {
        kind: 'revive',
        x: target.position.x,
        y: target.position.y,
        lifetime: effectLifetimes.revive,
      });
      return;
    }
    // Max-semantics in triggerHitStop means this is a no-op floor rather than
    // a second freeze stacked on top of the critical-hit one above - a
    // critical killing blow still resolves to whichever duration is longer.
    triggerHitStop(state, hitStopConfig.killSeconds);
    handleDeath(state, target);
  }
}

// Chip damage from CombatSystem.tickEnemyAttacksOnHeroes - can now reach 0,
// which downs the hero (see HeroState.isDowned's doc comment and
// HeroStatsSystem.getAliveDeployedHeroes). A downed hero stops fighting/
// moving/being targeted for the rest of this wave attempt; WaveSystem.
// tickWaveProgress's checkSquadWipe fails the whole wave once every deployed
// hero is downed at once, and resetBattlefieldForWave clears isDowned (and
// heals everyone) on the next attempt.
export function applyDamageToHero(state: GameState, hero: HeroState, amount: number): void {
  hero.currentHp = Math.max(0, hero.currentHp - amount);
  if (hero.currentHp === 0) {
    hero.isDowned = true;
  }

  spawnVisualEffect(state, {
    kind: 'damageNumber',
    x: hero.position.x,
    y: hero.position.y,
    amount,
    isCritical: false,
    lifetime: effectLifetimes.damageNumber,
  });
}

export function handleDeath(state: GameState, target: EnemyState): void {
  // special bond (bondConfig.ts) - "控制、辅助、特殊机制" (plan section 6.2)
  // reads as economy utility rather than combat power, so it doesn't
  // compete with warrior/guardian/mage/etc for the same stat.
  const bondResourceGainMultiplier = getBondEffects(state.deployedHeroIds).resourceGainMultiplier;
  const goldGainMultiplier =
    getTalentMultiplier(state.talentLevels, 'goldGain') *
    getAscensionShopMultiplier(state.ascensionShopLevels, 'goldGain') *
    bondResourceGainMultiplier;
  const expGainMultiplier =
    getTalentMultiplier(state.talentLevels, 'expGain') *
    getAscensionShopMultiplier(state.ascensionShopLevels, 'expGain') *
    bondResourceGainMultiplier;

  state.gold += target.goldReward * goldGainMultiplier;
  // Parallel leveling - every deployed hero gets the full exp reward
  // independently, not split across the roster. Benched heroes don't fight
  // so they don't earn it. Stat growth from any resulting level-up is
  // applied later by LevelSystem/HeroStatsSystem, so there's nothing to
  // recompute here.
  for (const hero of getAliveDeployedHeroes(state)) {
    hero.exp += target.expReward * expGainMultiplier;
  }
  rollEquipmentDrop(state);
  incrementDailyQuestProgress(state, 'killEnemies');

  // Talent points have no passive/idle income (see talentConfig.ts) - the
  // only source is killing the current wave's miniboss/boss, identified by
  // its archetypeId matching the wave's bossKind (same check WaveSystem's
  // isBossAlive uses).
  if (state.wave.isBossWave && state.wave.bossKind && target.archetypeId === state.wave.bossKind) {
    state.skillPoints += talentPointRewardConfig[state.wave.bossKind];
    state.diamonds += diamondRewardConfig[state.wave.bossKind];
    state.totalBossKills += 1;
    triggerScreenShake(state, screenShakeConfig.bossImpactIntensity);
    triggerHitStop(state, hitStopConfig.bossKillSeconds);
  }

  spawnVisualEffect(state, {
    kind: 'deathBurst',
    x: target.position.x,
    y: target.position.y,
    lifetime: effectLifetimes.deathBurst,
  });

  state.enemies = state.enemies.filter((enemy) => enemy.instanceId !== target.instanceId);
}
