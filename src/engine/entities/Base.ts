import { mapConfig } from '../../data/mapConfig';
import type { BaseState } from '../types';

export function createBase(): BaseState {
  return {
    position: { ...mapConfig.basePosition },
  };
}
