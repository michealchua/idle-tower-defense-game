import { baseConfig } from '../../data/baseConfig';
import { mapConfig } from '../../data/mapConfig';
import type { BaseState } from '../types';

export function createBase(): BaseState {
  return {
    maxHp: baseConfig.maxHp,
    currentHp: baseConfig.maxHp,
    position: { ...mapConfig.basePosition },
  };
}
