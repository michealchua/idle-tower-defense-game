import type { GameState, VisualEffect } from '../types';

export function tickEffects(state: GameState, deltaSeconds: number): void {
  for (const effect of state.visualEffects) {
    effect.age += deltaSeconds;
  }
  state.visualEffects = state.visualEffects.filter((effect) => effect.age < effect.lifetime);
}

export function spawnVisualEffect(state: GameState, effect: Omit<VisualEffect, 'id' | 'age'>): void {
  state.visualEffects.push({ ...effect, id: state.nextVisualEffectId, age: 0 });
  state.nextVisualEffectId += 1;
}
