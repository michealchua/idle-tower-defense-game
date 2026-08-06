import { createTower } from '../entities/Tower';
import { layoutTowerPositions } from '../../data/mapConfig';
import { getMaxDeployedTowers } from '../../data/castleConfig';
import { towerConfig, getTowerUpgradeCost, type TowerId } from '../../data/towerConfig';
import { getTalentMultiplier } from '../../data/talentConfig';
import { effectLifetimes } from '../../data/effectConfig';
import { getAscensionMultiplier, getDeployedTowers } from './HeroStatsSystem';
import { getEnemiesInRange, heroDefaultStrategy, pickBestTarget, pickTopTargets } from './TargetingSystem';
import { calculateDamage, applyDamage } from './DamageSystem';
import { spawnVisualEffect } from './EffectsSystem';
import type { GameState } from '../types';

// Same idea as HeroSystem.relayoutDeployedHeroes/PetSystem.relayoutDeployedPets
// - only the deployed subset gets a real combat/render position.
function relayoutDeployedTowers(state: GameState): void {
  const positions = layoutTowerPositions(state.deployedTowerIds.length);
  state.deployedTowerIds.forEach((towerId, index) => {
    const tower = state.towers.find((candidate) => candidate.id === towerId);
    if (tower) {
      tower.position = positions[index];
    }
  });
}

// The single place tower combat stats are written - called after build,
// upgrade, and ascension (see AscensionSystem.ascend). Talent bonuses
// (attackDamage/aoeDamage) are applied live in tickTowerCombat instead of
// here, since that already runs every tick and baking them in here would
// require TalentSystem to call back into this module on every purchase.
export function recomputeTowerStats(state: GameState): void {
  const ascensionMultiplier = getAscensionMultiplier(state);

  for (const tower of state.towers) {
    const def = towerConfig[tower.id as TowerId];
    const levelGrowth = 1 + (tower.level - 1) * def.upgrade.growthPerLevel;

    tower.attackDamage = def.baseAttackDamage * levelGrowth * ascensionMultiplier;
    tower.attackSpeed = def.baseAttackSpeed;
    tower.attackRange = def.baseAttackRange;
    tower.goldPerSecond = (def.goldPerSecond ?? 0) * levelGrowth * ascensionMultiplier;
  }
}

// Free primitive - acquisition (spending gold) happens in unlockTower below,
// same split as HeroSystem/PetSystem's unlock-vs-pull separation. Debug
// tools can call this directly.
function addTower(state: GameState, towerId: TowerId): void {
  state.unlockedTowerIds.push(towerId);
  state.towers.push(createTower(towerId, { x: 0, y: 0 }));

  if (state.deployedTowerIds.length < getMaxDeployedTowers(state.castleLevel)) {
    state.deployedTowerIds.push(towerId);
    relayoutDeployedTowers(state);
  }

  recomputeTowerStats(state);
}

export function unlockTower(state: GameState, towerId: TowerId): boolean {
  if (state.unlockedTowerIds.includes(towerId)) {
    return false;
  }

  const cost = towerConfig[towerId].buildCost;
  if (state.gold < cost) {
    return false;
  }

  state.gold -= cost;
  state.goldSpentTotal += cost;
  addTower(state, towerId);
  return true;
}

export function deployTower(state: GameState, towerId: string): boolean {
  if (!state.unlockedTowerIds.includes(towerId) || state.deployedTowerIds.includes(towerId)) {
    return false;
  }
  if (state.deployedTowerIds.length >= getMaxDeployedTowers(state.castleLevel)) {
    return false;
  }

  state.deployedTowerIds.push(towerId);
  relayoutDeployedTowers(state);
  return true;
}

export function undeployTower(state: GameState, towerId: string): boolean {
  const index = state.deployedTowerIds.indexOf(towerId);
  if (index === -1) {
    return false;
  }

  state.deployedTowerIds.splice(index, 1);
  relayoutDeployedTowers(state);
  return true;
}

export function upgradeTower(state: GameState, towerId: string): boolean {
  const tower = state.towers.find((candidate) => candidate.id === towerId);
  if (!tower) {
    return false;
  }

  const cost = getTowerUpgradeCost(tower.id as TowerId, tower.level);
  if (state.gold < cost) {
    return false;
  }

  state.gold -= cost;
  state.goldSpentTotal += cost;
  tower.level += 1;
  recomputeTowerStats(state);
  return true;
}

export function tickTowerCombat(state: GameState, deltaSeconds: number): void {
  const talentAttackMultiplier = getTalentMultiplier(state.talentLevels, 'attackDamage');
  const talentAoeMultiplier = getTalentMultiplier(state.talentLevels, 'aoeDamage');
  const context = { basePosition: state.base.position, originPosition: state.base.position };

  for (const tower of getDeployedTowers(state)) {
    const def = towerConfig[tower.id as TowerId];

    if (def.kind === 'economy') {
      state.gold += tower.goldPerSecond * deltaSeconds;
      continue;
    }

    tower.attackCooldownRemaining = Math.max(0, tower.attackCooldownRemaining - deltaSeconds);
    if (tower.attackCooldownRemaining > 0) {
      continue;
    }

    const candidates = getEnemiesInRange(state.enemies, tower.position, tower.attackRange);
    const damage = tower.attackDamage * talentAttackMultiplier;

    if (def.kind === 'lightning') {
      const targets = pickTopTargets(candidates, heroDefaultStrategy, { ...context, originPosition: tower.position }, def.chainCount ?? 1);
      if (targets.length === 0) {
        continue;
      }
      tower.attackCooldownRemaining = 1 / tower.attackSpeed;
      for (const target of targets) {
        applyDamage(state, target, calculateDamage(damage, 0));
        spawnVisualEffect(state, {
          kind: 'lightningBolt',
          x: tower.position.x,
          y: tower.position.y,
          targetX: target.position.x,
          targetY: target.position.y,
          lifetime: effectLifetimes.lightningBolt,
        });
      }
      continue;
    }

    const target = pickBestTarget(candidates, heroDefaultStrategy, { ...context, originPosition: tower.position });
    if (!target) {
      continue;
    }
    tower.attackCooldownRemaining = 1 / tower.attackSpeed;
    const wasAlive = target.currentHp > 0;
    applyDamage(state, target, calculateDamage(damage, 0));
    spawnVisualEffect(state, {
      kind: 'attackFlash',
      x: tower.position.x,
      y: tower.position.y,
      targetX: target.position.x,
      targetY: target.position.y,
      lifetime: effectLifetimes.attackFlash,
    });

    if (def.kind === 'cannon' && def.splashRadius && wasAlive) {
      const splashDamage = damage * (def.splashDamageRatio ?? 0.5) * talentAoeMultiplier;
      const splashTargets = getEnemiesInRange(state.enemies, target.position, def.splashRadius).filter(
        (enemy) => enemy.instanceId !== target.instanceId,
      );
      for (const splashTarget of splashTargets) {
        applyDamage(state, splashTarget, calculateDamage(splashDamage, 0));
      }
      spawnVisualEffect(state, {
        kind: 'towerSplash',
        x: target.position.x,
        y: target.position.y,
        radius: def.splashRadius,
        lifetime: effectLifetimes.towerSplash,
      });
    }

    if (def.kind === 'frost' && def.slowMultiplier && def.slowDuration && wasAlive && target.currentHp > 0) {
      target.slowMultiplier = def.slowMultiplier;
      target.slowRemaining = def.slowDuration;
      spawnVisualEffect(state, {
        kind: 'frostImpact',
        x: target.position.x,
        y: target.position.y,
        lifetime: effectLifetimes.frostImpact,
      });
    }
  }
}
