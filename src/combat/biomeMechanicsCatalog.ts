// Concrete BiomeMechanics implementations for all 10 themes (step 22's
// "全局规则引擎"). One object per theme, each a closure over its own
// periodic-timer state (so revisiting the same theme later in a run resumes
// its interval bookkeeping rather than needing to be reset by whoever wires
// it up) - ThemeManager attaches these to their ThemeDefinition and flips
// the active one via activeBiome.ts's setActiveBiomeMechanics.
import type { BiomeMechanics } from './activeBiome';
import type { CombatEngine } from './CombatEngine';
import { StatusEffectType } from '../data/skills/skillTypes';
import { ENEMY_PATH, gridCellCenter } from './gridConfig';
import type { ThemeId } from './ThemeManager';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function healRatio(current: number, max: number): number {
  return max > 0 ? current / max : 0;
}

/** Every alive unit on the field, tagged with a uniform (currentHp, maxHp, heal) shape so Forest's "全场生命值百分比最低的单位" can compare heroes and enemies side by side without two separate code paths. */
function collectAliveUnits(
  combatEngine: CombatEngine,
): { ratio: number; currentHp: number; maxHp: number; heal: (amount: number) => void }[] {
  const units: { ratio: number; currentHp: number; maxHp: number; heal: (amount: number) => void }[] = [];

  for (const hero of combatEngine.getHeroes()) {
    if (!hero.isAlive) {
      continue;
    }
    units.push({
      ratio: healRatio(hero.stats.currentHp, hero.stats.maxHp),
      currentHp: hero.stats.currentHp,
      maxHp: hero.stats.maxHp,
      heal: (amount) => {
        hero.stats.currentHp = Math.min(hero.stats.maxHp, hero.stats.currentHp + amount);
      },
    });
  }

  for (const enemy of combatEngine.getAliveEnemies()) {
    units.push({
      ratio: healRatio(enemy.currentHp, enemy.maxHp),
      currentHp: enemy.currentHp,
      maxHp: enemy.maxHp,
      heal: (amount) => {
        enemy.currentHp = Math.min(enemy.maxHp, enemy.currentHp + amount);
      },
    });
  }

  return units;
}

// --- Volcano: periodic burn on every hero -----------------------------

const VOLCANO_BURN_INTERVAL = 3;
const VOLCANO_BURN_DPS = 8;
const VOLCANO_BURN_DURATION = 3;

function createVolcanoMechanics(): BiomeMechanics {
  let elapsed = 0;
  return {
    themeId: 'volcano',
    onUpdate(deltaTime, combatEngine) {
      elapsed += deltaTime;
      while (elapsed >= VOLCANO_BURN_INTERVAL) {
        elapsed -= VOLCANO_BURN_INTERVAL;
        for (const hero of combatEngine.getHeroes()) {
          if (hero.isAlive) {
            hero.applyBurn(VOLCANO_BURN_DPS, VOLCANO_BURN_DURATION);
          }
        }
      }
    },
  };
}

// --- Snow Mountain: every enemy spawns permanently slowed -------------

const SNOW_MOUNTAIN_SLOW_MAGNITUDE = 0.2;

function createSnowMountainMechanics(): BiomeMechanics {
  return {
    themeId: 'snowMountain',
    onEnemySpawn(enemy) {
      enemy.applyStatus({ type: StatusEffectType.Slow, duration: Infinity, magnitude: SNOW_MOUNTAIN_SLOW_MAGNITUDE });
    },
  };
}

// --- Poison Swamp: heroes heal less, enemies regen --------------------

const POISON_SWAMP_HEAL_REDUCTION = 0.3;
const POISON_SWAMP_REGEN_INTERVAL = 2;
const POISON_SWAMP_REGEN_RATIO = 0.01;

function createPoisonSwampMechanics(): BiomeMechanics {
  let elapsed = 0;
  return {
    themeId: 'poisonSwamp',
    modifyIncomingHeal(amount) {
      return amount * (1 - POISON_SWAMP_HEAL_REDUCTION);
    },
    onUpdate(deltaTime, combatEngine) {
      elapsed += deltaTime;
      while (elapsed >= POISON_SWAMP_REGEN_INTERVAL) {
        elapsed -= POISON_SWAMP_REGEN_INTERVAL;
        for (const enemy of combatEngine.getAliveEnemies()) {
          enemy.currentHp = Math.min(enemy.maxHp, enemy.currentHp + enemy.maxHp * POISON_SWAMP_REGEN_RATIO);
        }
      }
    },
  };
}

// --- Sky Realm: global hero attack-speed buff --------------------------

const SKY_REALM_ATTACK_SPEED_BONUS = 0.15;

function createSkyRealmMechanics(): BiomeMechanics {
  return {
    themeId: 'skyRealm',
    modifyHeroStat(statKey, value) {
      return statKey === 'attackSpeed' ? value * (1 + SKY_REALM_ATTACK_SPEED_BONUS) : value;
    },
  };
}

// --- Desert: sandstorm shortens ranged range, boosts melee dodge -------

const DESERT_RANGE_PENALTY = 0.2;
const DESERT_MELEE_DODGE_CHANCE = 0.15;

function createDesertMechanics(): BiomeMechanics {
  return {
    themeId: 'desert',
    modifyHeroRange(range, isRangedSkill) {
      return isRangedSkill ? range * (1 - DESERT_RANGE_PENALTY) : range;
    },
    shouldDodgeEnemyAttack(hero) {
      return !hero.hasRangedSkill() && Math.random() < DESERT_MELEE_DODGE_CHANCE;
    },
  };
}

// --- Ocean: global slow + periodic knockback wave -----------------------

const OCEAN_SPEED_PENALTY = 0.1;
const OCEAN_WAVE_INTERVAL = 10;
const OCEAN_KNOCKBACK_PX = 24;

function createOceanMechanics(): BiomeMechanics {
  let elapsed = 0;
  return {
    themeId: 'ocean',
    modifyHeroStat(statKey, value) {
      return statKey === 'attackSpeed' ? value * (1 - OCEAN_SPEED_PENALTY) : value;
    },
    modifyEnemySpeedMultiplier(multiplier) {
      return multiplier * (1 - OCEAN_SPEED_PENALTY);
    },
    onUpdate(deltaTime, combatEngine) {
      elapsed += deltaTime;
      while (elapsed >= OCEAN_WAVE_INTERVAL) {
        elapsed -= OCEAN_WAVE_INTERVAL;
        for (const enemy of combatEngine.getAliveEnemies()) {
          const waypointIndex = Math.max(0, enemy.currentWaypointIndex - 1);
          const behind = gridCellCenter(ENEMY_PATH[waypointIndex].col, ENEMY_PATH[waypointIndex].row);
          const dx = enemy.x - behind.x;
          const dy = enemy.y - behind.y;
          const distance = Math.hypot(dx, dy) || 1;
          // Nudges the enemy back toward the waypoint it just came from,
          // clamped so a wave can never push it further back than that
          // waypoint itself (no risk of shoving it into negative path
          // progress or off the drawn route).
          const step = Math.min(OCEAN_KNOCKBACK_PX, distance);
          enemy.x -= (dx / distance) * step;
          enemy.y -= (dy / distance) * step;
        }
      }
    },
  };
}

// --- Forest: periodic heal for the field's lowest-HP-% unit -------------

const FOREST_HEAL_INTERVAL = 5;
const FOREST_HEAL_RATIO = 0.1;

function createForestMechanics(): BiomeMechanics {
  let elapsed = 0;
  return {
    themeId: 'forest',
    onUpdate(deltaTime, combatEngine) {
      elapsed += deltaTime;
      while (elapsed >= FOREST_HEAL_INTERVAL) {
        elapsed -= FOREST_HEAL_INTERVAL;
        const units = collectAliveUnits(combatEngine);
        if (units.length === 0) {
          continue;
        }
        const lowest = units.reduce((a, b) => (b.ratio < a.ratio ? b : a));
        lowest.heal(lowest.maxHp * FOREST_HEAL_RATIO);
      }
    },
  };
}

// --- Dark Cave: lower crit chance, much higher crit damage --------------

const DARK_CAVE_CRIT_CHANCE_PENALTY = 0.1;
const DARK_CAVE_CRIT_DAMAGE_BONUS = 0.5;

function createDarkCaveMechanics(): BiomeMechanics {
  return {
    themeId: 'darkCave',
    modifyCrit(chance, damageMultiplier) {
      return {
        chance: clamp01(chance - DARK_CAVE_CRIT_CHANCE_PENALTY),
        damageMultiplier: damageMultiplier + DARK_CAVE_CRIT_DAMAGE_BONUS,
      };
    },
  };
}

// --- Ancient Ruins: lower hero maxHp, higher loot chance -----------------

// Exported (unlike this file's other tuning constants) because test-run.ts's
// headless Ancient Ruins boundary test asserts against the exact expected
// ratio rather than hardcoding a second copy of "15%" that could silently
// drift out of sync with this one.
export const ANCIENT_RUINS_MAXHP_PENALTY = 0.15;
const ANCIENT_RUINS_LOOT_BONUS = 0.2;

function createAncientRuinsMechanics(): BiomeMechanics {
  return {
    themeId: 'ancientRuins',
    modifyHeroStat(statKey, value) {
      return statKey === 'maxHp' ? value * (1 - ANCIENT_RUINS_MAXHP_PENALTY) : value;
    },
    modifyLootChance(chance) {
      return clamp01(chance + ANCIENT_RUINS_LOOT_BONUS);
    },
  };
}

// --- Demon Abyss: enemies hit harder as they're bloodied, heroes lifesteal --

const DEMON_ABYSS_ATTACK_SCALING_PER_MISSING_PERCENT = 0.01;
const DEMON_ABYSS_LIFESTEAL_RATIO = 0.1;

function createDemonAbyssMechanics(): BiomeMechanics {
  return {
    themeId: 'demonAbyss',
    modifyEnemyAttackDamage(baseDamage, enemy) {
      const missingHpFraction = 1 - healRatio(enemy.currentHp, enemy.maxHp);
      return baseDamage * (1 + missingHpFraction * 100 * DEMON_ABYSS_ATTACK_SCALING_PER_MISSING_PERCENT);
    },
    modifyOutgoingDamage(damage, context) {
      context.hero.stats.currentHp = Math.min(context.hero.stats.maxHp, context.hero.stats.currentHp + damage * DEMON_ABYSS_LIFESTEAL_RATIO);
      return damage;
    },
  };
}

export const biomeMechanicsById: Record<ThemeId, BiomeMechanics> = {
  forest: createForestMechanics(),
  desert: createDesertMechanics(),
  ocean: createOceanMechanics(),
  snowMountain: createSnowMountainMechanics(),
  poisonSwamp: createPoisonSwampMechanics(),
  darkCave: createDarkCaveMechanics(),
  ancientRuins: createAncientRuinsMechanics(),
  volcano: createVolcanoMechanics(),
  skyRealm: createSkyRealmMechanics(),
  demonAbyss: createDemonAbyssMechanics(),
};

/** HUD-facing "死因/增益" one-liner per theme, per step 22's Hazard Indicator spec (e.g. "🌋 火山：全体英雄持续受到灼烧"). */
export const biomeHazardTextById: Record<ThemeId, string> = {
  forest: '🌳 森林：每 5 秒治疗全场生命值百分比最低的单位',
  desert: '🏜️ 沙漠：远程英雄射程 -20%，近战英雄闪避 +15%',
  ocean: '🌊 海洋：全场移速/攻速 -10%，每 10 秒海浪击退敌人',
  snowMountain: '❄️ 雪山：敌人生成时永久减速 20%',
  poisonSwamp: '☠️ 毒沼：英雄受疗 -30%，敌人每 2 秒回复 1% 生命',
  darkCave: '🕯️ 幽暗洞穴：英雄暴击率 -10%，暴击伤害 +50%',
  ancientRuins: '🏛️ 古代遗迹：英雄最大生命 -15%，敌人掉落率 +20%',
  volcano: '🌋 火山：全体英雄每 3 秒持续受到灼烧',
  skyRealm: '☁️ 天空之城：全体英雄攻速 +15%',
  demonAbyss: '👹 恶魔深渊：敌人越残血攻击越强，英雄攻击附带 10% 吸血',
};
