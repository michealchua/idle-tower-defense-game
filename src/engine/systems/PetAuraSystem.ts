import { getPetDefinition } from '../../data/petRosterConfig';
import { effectLifetimes } from '../../data/effectConfig';
import { calculateDamage, applyDamage } from './DamageSystem';
import { spawnVisualEffect } from './EffectsSystem';
import { distance } from './TargetingSystem';
import type { GameState } from '../types';

// Not a general buff/debuff framework - deliberately not, since there's only
// ever one deployed pet at a time (GameState.activePetId), so there's
// nothing to generalize over yet. Just reads that one pet's auraEffect and
// executes it on a shared cooldown (GameState.petAuraCooldownRemaining).
export function tickPetAura(state: GameState, deltaSeconds: number): void {
  if (!state.activePetId) {
    return;
  }

  const hero = state.heroes[0];
  if (!hero) {
    return;
  }

  const { auraEffect } = getPetDefinition(state.activePetId);

  state.petAuraCooldownRemaining -= deltaSeconds;
  if (state.petAuraCooldownRemaining > 0) {
    return;
  }
  state.petAuraCooldownRemaining += auraEffect.intervalSeconds;

  if (auraEffect.kind === 'healOverTime') {
    if (hero.currentHp >= hero.maxHp) {
      return;
    }
    hero.currentHp = Math.min(hero.maxHp, hero.currentHp + auraEffect.amount);
    spawnVisualEffect(state, {
      kind: 'healPulse',
      x: hero.position.x,
      y: hero.position.y,
      radius: 24,
      color: '#a5d6a7',
      lifetime: effectLifetimes.healPulse,
    });
    spawnVisualEffect(state, {
      kind: 'healNumber',
      x: hero.position.x,
      y: hero.position.y,
      amount: Math.round(auraEffect.amount),
      lifetime: effectLifetimes.healNumber,
    });
    return;
  }

  const hitEnemies = state.enemies.filter((enemy) => distance(enemy.position, hero.position) <= auraEffect.radius);
  if (hitEnemies.length === 0) {
    return;
  }

  spawnVisualEffect(state, {
    kind: 'skillImpact',
    x: hero.position.x,
    y: hero.position.y,
    radius: auraEffect.radius,
    color: '#8d6e63',
    lifetime: effectLifetimes.skillImpact,
  });

  for (const enemy of hitEnemies) {
    applyDamage(state, enemy, calculateDamage(auraEffect.amount, 0));
  }
}
