import { skillDefinitions, type SkillDefinition, type SkillTargetingStrategyKey } from '../../data/skillConfig';
import { effectLifetimes } from '../../data/effectConfig';
import {
  TargetingStrategies,
  distance,
  getEnemiesInRange,
  heroDefaultStrategy,
  pickBestTarget,
  pickTopTargets,
  type TargetComparator,
  type TargetingContext,
} from './TargetingSystem';
import { calculateDamage, applyDamage } from './DamageSystem';
import { spawnVisualEffect, spawnParticleBurst, spawnCastPose } from './EffectsSystem';
import { getAliveDeployedHeroes } from './HeroStatsSystem';
import { particleBurstConfig } from '../../data/effectConfig';
import { heroEntityKey } from '../entityKey';
import type { GameState, HeroState } from '../types';

const strategyLookup: Record<SkillTargetingStrategyKey, TargetComparator> = {
  heroDefault: heroDefaultStrategy,
  closestToBase: TargetingStrategies.closestToBase,
  closestToHero: TargetingStrategies.closestToHero,
  lowestHp: TargetingStrategies.lowestHp,
  highestHp: TargetingStrategies.highestHp,
  strongest: TargetingStrategies.strongest,
  random: TargetingStrategies.random,
};

// Each hero casts its own unlocked skills independently - pets don't get
// skills in v1.
export function tickSkills(state: GameState, deltaSeconds: number): void {
  for (const hero of getAliveDeployedHeroes(state)) {
    tickHeroSkills(state, hero, deltaSeconds);
  }
}

function tickHeroSkills(state: GameState, hero: HeroState, deltaSeconds: number): void {
  // hero.unlockedSkillIds is the authoritative "skills this hero currently
  // has" list - populated from the hero's own heroRosterConfig.skillUnlocks
  // by LevelSystem, and (for evolved heroes) from its chosen
  // evolutionBranches entry's exclusive skill by HeroSystem.evolveHero.
  // Iterating it directly (instead of re-deriving just the level-gated
  // subset from the roster definition) means a newly evolved hero's branch
  // skill actually casts, not just shows as unlocked in the UI.
  for (const skillId of hero.unlockedSkillIds) {
    const definition = skillDefinitions[skillId];

    let runtime = hero.skills[skillId];
    if (!runtime) {
      runtime = { cooldownRemaining: 0 };
      hero.skills[skillId] = runtime;
    }

    runtime.cooldownRemaining = Math.max(0, runtime.cooldownRemaining - deltaSeconds);

    if (runtime.cooldownRemaining > 0) {
      continue;
    }

    if (tryCastSkill(state, hero, definition)) {
      runtime.cooldownRemaining = definition.cooldownSeconds;
    }
  }
}

// Each effectType owns its own target-finding, because they need different
// shapes of it: aoeDamage needs one impact point, chainDamage needs the top
// N targets directly. tryCastSkill is just the dispatcher.
function tryCastSkill(state: GameState, hero: HeroState, definition: SkillDefinition): boolean {
  switch (definition.effectType) {
    case 'aoeDamage':
      return castAoeDamage(state, hero, definition);
    case 'chainDamage':
      return castChainDamage(state, hero, definition);
    case 'healAlly':
      return castHealAlly(state, hero, definition);
    default:
      return false;
  }
}

function castAoeDamage(state: GameState, hero: HeroState, definition: SkillDefinition): boolean {
  const strategy = strategyLookup[definition.targetingStrategy];
  const context: TargetingContext = { basePosition: state.base.position, originPosition: hero.position };
  const candidates = getEnemiesInRange(state.enemies, hero.position, definition.range);
  const impactTarget = pickBestTarget(candidates, strategy, context);

  if (!impactTarget) {
    return false;
  }

  const aoeRadius = definition.aoeRadius ?? 0;
  const hitEnemies = getEnemiesInRange(state.enemies, impactTarget.position, aoeRadius);

  spawnVisualEffect(state, {
    kind: 'skillImpact',
    x: impactTarget.position.x,
    y: impactTarget.position.y,
    radius: aoeRadius,
    color: definition.color,
    lifetime: effectLifetimes.skillImpact,
  });
  // Skill's own color (definition.color), not the fixed
  // particleBurstConfig.skillImpact color - every aoeDamage skill used to
  // burst the same orange regardless of whether it was Fireball or
  // Earthquake.
  spawnParticleBurst(state, impactTarget.position.x, impactTarget.position.y, { ...particleBurstConfig.skillImpact, color: definition.color });

  for (const enemy of hitEnemies) {
    const damageResult = calculateDamage(hero.attackDamage * definition.damageMultiplier, 0);
    applyDamage(state, enemy, damageResult);
  }

  spawnCastPose(state, heroEntityKey(hero.id), hero.position.x, hero.position.y);
  return true;
}

function castChainDamage(state: GameState, hero: HeroState, definition: SkillDefinition): boolean {
  const strategy = strategyLookup[definition.targetingStrategy];
  const context: TargetingContext = { basePosition: state.base.position, originPosition: hero.position };
  const candidates = getEnemiesInRange(state.enemies, hero.position, definition.range);
  const targets = pickTopTargets(candidates, strategy, context, definition.targetCount ?? 1);

  if (targets.length === 0) {
    return false;
  }

  for (const target of targets) {
    spawnVisualEffect(state, {
      kind: 'lightningBolt',
      x: hero.position.x,
      y: hero.position.y,
      targetX: target.position.x,
      targetY: target.position.y,
      color: definition.color,
      lifetime: effectLifetimes.lightningBolt,
    });
    spawnParticleBurst(state, target.position.x, target.position.y, { ...particleBurstConfig.skillImpact, color: definition.color });

    const damageResult = calculateDamage(hero.attackDamage * definition.damageMultiplier, 0);
    applyDamage(state, target, damageResult);
  }

  spawnCastPose(state, heroEntityKey(hero.id), hero.position.x, hero.position.y);
  return true;
}

// Support-flavored skills (skillConfig.ts's healAlly entries) - always
// targets the lowest-HP% deployed heroes in range, ignoring
// definition.targetingStrategy entirely (that field only makes sense for
// picking among enemies). This is the "补师" path referenced in
// heroConfig.ts: HP lost to enemy attacks (CombatSystem.tickEnemyAttacksOnHeroes)
// can be restored here instead of only on the next wave.
function castHealAlly(state: GameState, hero: HeroState, definition: SkillDefinition): boolean {
  const injured = getAliveDeployedHeroes(state)
    .filter((candidate) => distance(candidate.position, hero.position) <= definition.range && candidate.currentHp < candidate.maxHp)
    .sort((a, b) => a.currentHp / a.maxHp - b.currentHp / b.maxHp);
  const targets = injured.slice(0, definition.targetCount ?? 1);

  if (targets.length === 0) {
    return false;
  }

  const healAmount = hero.attackDamage * definition.damageMultiplier;
  for (const target of targets) {
    target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
    spawnVisualEffect(state, {
      kind: 'healPulse',
      x: target.position.x,
      y: target.position.y,
      radius: 30,
      color: definition.color,
      lifetime: effectLifetimes.healPulse,
    });
    spawnVisualEffect(state, {
      kind: 'healNumber',
      x: target.position.x,
      y: target.position.y,
      amount: Math.round(healAmount),
      lifetime: effectLifetimes.healNumber,
    });
  }

  spawnCastPose(state, heroEntityKey(hero.id), hero.position.x, hero.position.y);
  return true;
}
