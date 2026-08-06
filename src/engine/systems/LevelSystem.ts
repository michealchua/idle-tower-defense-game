import { getExpToNextLevel } from '../../data/heroConfig';
import { milestoneDefinitions } from '../../data/milestoneConfig';
import { effectLifetimes } from '../../data/effectConfig';
import { spawnVisualEffect } from './EffectsSystem';
import { recomputeHeroStats } from './HeroStatsSystem';
import type { GameState, HeroState } from '../types';

export function tickLevelUp(state: GameState): void {
  const leveledHeroes: HeroState[] = [];

  for (const hero of state.heroes) {
    if (tickHeroLevelUp(state, hero)) {
      leveledHeroes.push(hero);
    }
  }

  if (leveledHeroes.length === 0) {
    return;
  }

  // Stat growth from the new level(s) lives in HeroStatsSystem, not here -
  // recompute once for everyone, then apply the level-up-specific "full
  // heal" (equip/upgrade instead heal by the maxHp delta, see
  // HeroStatsSystem.recomputeHeroStats).
  recomputeHeroStats(state);
  for (const hero of leveledHeroes) {
    hero.currentHp = hero.maxHp;
  }
}

function tickHeroLevelUp(state: GameState, hero: HeroState): boolean {
  let leveledUp = false;

  while (hero.exp >= hero.expToNextLevel) {
    hero.exp -= hero.expToNextLevel;
    hero.level += 1;
    hero.expToNextLevel = getExpToNextLevel(hero.level);
    leveledUp = true;

    spawnVisualEffect(state, {
      kind: 'levelUp',
      x: hero.position.x,
      y: hero.position.y,
      lifetime: effectLifetimes.levelUp,
    });

    const milestone = milestoneDefinitions.find((definition) => definition.level === hero.level);
    if (milestone) {
      const newlyUnlocked = milestone.rewards.filter((reward) => !hero.unlockedMilestoneIds.includes(reward.id));
      for (const reward of newlyUnlocked) {
        hero.unlockedMilestoneIds.push(reward.id);
      }
      if (newlyUnlocked.length > 0) {
        spawnVisualEffect(state, {
          kind: 'milestoneUnlock',
          x: hero.position.x,
          y: hero.position.y,
          lifetime: effectLifetimes.milestoneUnlock,
        });
      }
    }
  }

  return leveledUp;
}
