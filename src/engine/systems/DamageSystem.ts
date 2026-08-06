import { spawnVisualEffect } from './EffectsSystem';
import { rollEquipmentDrop } from './EquipmentSystem';
import { getDeployedHeroes } from './HeroStatsSystem';
import { effectLifetimes } from '../../data/effectConfig';
import { getTalentMultiplier } from '../../data/talentConfig';
import type { EnemyState, GameState } from '../types';

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

  if (target.currentHp <= 0) {
    handleDeath(state, target);
  }
}

export function handleDeath(state: GameState, target: EnemyState): void {
  const goldGainMultiplier = getTalentMultiplier(state.talentLevels, 'goldGain');
  const expGainMultiplier = getTalentMultiplier(state.talentLevels, 'expGain');

  state.gold += target.goldReward * goldGainMultiplier;
  // Parallel leveling - every deployed hero gets the full exp reward
  // independently, not split across the roster. Benched heroes don't fight
  // so they don't earn it. Stat growth from any resulting level-up is
  // applied later by LevelSystem/HeroStatsSystem, so there's nothing to
  // recompute here.
  for (const hero of getDeployedHeroes(state)) {
    hero.exp += target.expReward * expGainMultiplier;
  }
  rollEquipmentDrop(state);

  spawnVisualEffect(state, {
    kind: 'deathBurst',
    x: target.position.x,
    y: target.position.y,
    lifetime: effectLifetimes.deathBurst,
  });

  state.enemies = state.enemies.filter((enemy) => enemy.instanceId !== target.instanceId);
}
