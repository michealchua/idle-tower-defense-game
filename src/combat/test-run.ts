// Manual, data-driven simulation of GameManager over sampleLevelConfig's
// 2 waves, ending in an explicit victory assertion.
// Run with: npx tsx src/combat/test-run.ts

import { GameManager, GameState } from './GameManager';
import { WaveState } from './WaveManager';
import { BattleHero } from './BattleHero';
import { BattleEnemy } from './BattleEnemy';
import { CombatEngine } from './CombatEngine';
import { EnemyFactory } from './EnemyFactory';
import { sampleLevelConfig } from './sampleLevelConfig';
import { HeroFactory } from '../data/hero/HeroFactory';
import { swordsmanTemplate } from '../data/hero/warriorTemplates';
import { pyromancerTemplate } from '../data/hero/mageTemplates';
import { bladeSlashSkill, bloodFurySkill, bloodrageSlashSkill } from '../data/skills/warriorSkills';
import { fireballSkill } from '../data/skills/mageSkills';
import { StatusEffectType } from '../data/skills/skillTypes';
import { heroEvolutions } from './heroEvolution';
import { gridCellCenter } from './gridConfig';

// --- forceStartNextWave edge cases -----------------------------------
//
// Isolated from the main simulation below so a failure here points
// straight at the hardcore-mechanic seam itself, not at the choke-point
// hero cluster's damage math.
console.log('=== forceStartNextWave 边界验证 ===');
{
  const gm = new GameManager(sampleLevelConfig, {}, { maxBaseHp: 100 });
  gm.start();
  // Read WaveManager.state into a fresh local after every mutating call
  // (start()/forceStartNextWave()) rather than repeatedly comparing the
  // live gm.waveManager.state expression - TypeScript's control-flow
  // narrowing doesn't know those calls can change what that getter
  // returns, and "remembers" an earlier comparison's result straight
  // through them, flagging the next comparison as an impossible literal
  // overlap.
  const stateAfterStart = gm.waveManager.state;
  console.log('  start() 后波次状态:', stateAfterStart, '(期望 waiting)');
  if (stateAfterStart !== WaveState.Waiting) {
    throw new Error('Expected WaveManager to start in WaveState.Waiting.');
  }

  gm.forceStartNextWave();
  const stateAfterForce = gm.waveManager.state;
  console.log('  调用 forceStartNextWave() 后:', stateAfterForce, '(期望立即跳过倒计时进入 spawning)');
  if (stateAfterForce !== WaveState.Spawning) {
    throw new Error('forceStartNextWave() should transition WAITING -> SPAWNING immediately.');
  }

  gm.forceStartNextWave();
  const stateAfterSecondForce = gm.waveManager.state;
  console.log('  SPAWNING 期间再次调用，状态仍为:', stateAfterSecondForce, '(期望无操作，仍是 spawning)');
  if (stateAfterSecondForce !== WaveState.Spawning) {
    throw new Error('forceStartNextWave() should be a no-op while already SPAWNING.');
  }
}
{
  // No heroes at all - baseHp drains to 0 quickly, forcing GAME_OVER, so we
  // can confirm forceStartNextWave() is inert once the run has ended.
  const gm = new GameManager(sampleLevelConfig, {}, { maxBaseHp: 1 });
  gm.start();
  let ticks = 0;
  while (gm.gameState === GameState.Playing && ticks < 3000) {
    gm.update(0.1);
    ticks += 1;
  }
  console.log('  达成', gm.gameState, '后调用 forceStartNextWave()...');
  const waveStateBefore = gm.waveManager.state;
  gm.forceStartNextWave();
  const waveStateAfter = gm.waveManager.state;
  console.log('  波次状态未变:', waveStateAfter === waveStateBefore, `(${waveStateBefore} -> ${waveStateAfter})`);
  if (waveStateAfter !== waveStateBefore) {
    throw new Error('forceStartNextWave() should be a no-op once gameState has left Playing.');
  }
}
console.log('[PASS] forceStartNextWave 边界验证通过。\n');

// --- Status effect boundary test 1: Slow extends time-to-reach-end -----
//
// Pure BattleEnemy movement math, no CombatEngine/hero involved - proves
// out the Slow status's speed reduction directly against
// BattleEnemy.hasReachedEnd's tick count.
console.log('=== 边界测试 1：Slow 是否延长了敌人到达终点所需的 Tick 数 ===');
{
  const SLOW_MAGNITUDE = 0.4; // 40% slower
  const dt = 0.1;
  const maxTicks = 10000;

  function ticksToReachEnd(applySlow: boolean): number {
    const enemy = new EnemyFactory().create('goblin');
    if (applySlow) {
      // Duration far longer than the goblin's full path traversal so the
      // slow stays active for the entire journey - keeps the expected
      // ratio a clean 1 / (1 - magnitude) instead of a partial-journey
      // blend that would need path-geometry-aware math to predict exactly.
      enemy.applyStatus({ type: StatusEffectType.Slow, duration: 9999, magnitude: SLOW_MAGNITUDE });
    }
    let ticks = 0;
    while (!enemy.hasReachedEnd && ticks < maxTicks) {
      enemy.update(dt);
      ticks += 1;
    }
    return ticks;
  }

  const baselineTicks = ticksToReachEnd(false);
  const slowedTicks = ticksToReachEnd(true);
  console.log(`  baseline ticks: ${baselineTicks} | slowed ticks: ${slowedTicks}`);
  if (slowedTicks <= baselineTicks) {
    throw new Error('Slow status should strictly increase the tick count needed to reach the end.');
  }

  const expectedRatio = 1 / (1 - SLOW_MAGNITUDE);
  const actualRatio = slowedTicks / baselineTicks;
  // Tolerance wider than pure floating-point error would need: each of the
  // path's 3 waypoint transitions "snaps" the last partial step of that
  // leg to exactly WAYPOINT_ARRIVAL_THRESHOLD_PX rather than landing on an
  // exact tick boundary, and dt=0.1 quantizes ticks to whole numbers - both
  // add a little discretization noise on top of the pure 1/(1-magnitude)
  // ratio, independent of whether the Slow math itself is correct.
  console.log(`  actual ratio: ${actualRatio.toFixed(3)} (expected ~${expectedRatio.toFixed(3)}, i.e. 1/(1-${SLOW_MAGNITUDE}))`);
  if (Math.abs(actualRatio - expectedRatio) > 0.05) {
    throw new Error(`Slow's tick-count ratio drifted too far from the expected 1/(1-magnitude): got ${actualRatio}, expected ~${expectedRatio}.`);
  }
}
console.log('[PASS] Slow 边界测试通过：减速按预期比例延长了到达终点所需的 tick 数。\n');

// --- Status effect boundary test 2: DOT kills after the hero stops -----
//
// A real fireball projectile has to actually travel and land through
// CombatEngine first (proving the projectile lifecycle itself), then the
// hero is cut out of the loop entirely - only enemy.update() gets called
// from that point on - to prove the DOT that's already living in the
// enemy's own activeStatuses keeps ticking (and can still kill) with zero
// further hero involvement.
console.log('=== 边界测试 2：DOT 是否能在英雄停止攻击后依然按秒击杀 ===');
{
  const heroInstance = HeroFactory.createHero(pyromancerTemplate);
  const hero = new BattleHero(heroInstance, [fireballSkill], { x: 0, y: 0 });

  // Deliberately fragile (low maxHp) and stationary (speed 0, so its
  // distance to the hero never changes) - this test only needs one
  // fireball to land, not a realistic wave/path scenario.
  const enemy = new BattleEnemy({
    instanceId: 'dot-test-enemy',
    archetypeId: 'goblin',
    maxHp: 20,
    defense: 0,
    speed: 0,
    goldReward: 0,
    expReward: 0,
    baseDamage: 0,
  });
  enemy.x = 50; // well within fireballSkill's 180px range of the hero at (0,0)
  enemy.y = 0;

  const engine = new CombatEngine();
  engine.addHero(hero);
  engine.addEnemy(enemy);

  const dt = 0.1;
  let ticksToLand = 0;
  while (enemy.activeStatuses.length === 0 && ticksToLand < 200) {
    engine.update(dt);
    ticksToLand += 1;
  }
  console.log(`  火球飞行并命中用了 ${ticksToLand} tick`);
  if (enemy.activeStatuses.length === 0) {
    throw new Error('Expected the fireball projectile to travel and land, applying a Dot status.');
  }
  console.log(`  命中瞬间（火球自身伤害已结算）剩余 HP: ${enemy.currentHp.toFixed(1)}/${enemy.maxHp}`);

  // "英雄停止攻击" - stop calling engine.update() (and therefore the hero)
  // entirely. Only the enemy object itself gets ticked from here on.
  let dotOnlyTicks = 0;
  while (enemy.isAlive && dotOnlyTicks < 200) {
    enemy.update(dt);
    dotOnlyTicks += 1;
  }
  console.log(`  仅靠 DOT（英雄已停止参与）又经过 ${dotOnlyTicks} tick 后: isAlive=${enemy.isAlive}, HP=${enemy.currentHp.toFixed(1)}`);
  if (enemy.isAlive) {
    throw new Error('Expected the enemy to die from residual Dot damage alone after the hero stopped attacking.');
  }
}
console.log('[PASS] DOT 边界测试通过：命中后即使英雄完全停止攻击，燃烧伤害依然按秒结算并致死。\n');

// --- Leveling/evolution boundary test 3 --------------------------------
//
// Place a base hero -> inject gold -> upgrade repeatedly to the evolution
// threshold -> evolve -> verify both the stat growth and the wholesale
// skill swap (arcane bolt, no status effect -> fireball, a Projectile
// skill carrying a Dot statusEffectOnHit).
console.log('=== 边界测试 3：升级与分支进化流程 ===');
{
  // Ample gold up front - this test is about the upgrade/evolve state
  // machine itself, not about earning the gold to afford it (that's
  // already covered by step 15's economy tests).
  const gm = new GameManager(sampleLevelConfig, {}, { startingGold: 100000 });

  const placeResult = gm.tryPlaceHero('apprenticeMage', { col: 1, row: 3 });
  if (!placeResult.success) {
    throw new Error('Expected placing the base apprenticeMage hero to succeed with ample gold.');
  }
  const hero = placeResult.hero;

  const initialAttack = hero.stats.currentAttack;
  const initialMaxHp = hero.stats.maxHp;
  const preEvolutionSkill = hero.getSkillDefinition('skill-arcane-bolt');
  console.log(`  初始状态: Lv.${hero.level}, 攻击力=${initialAttack.toFixed(2)}, maxHp=${initialMaxHp.toFixed(2)}, 技能=${preEvolutionSkill?.id} (statusEffectOnHit=${preEvolutionSkill?.statusEffectOnHit ?? 'none'})`);
  if (!preEvolutionSkill || preEvolutionSkill.statusEffectOnHit) {
    throw new Error('Expected the pre-evolution base skill to be the plain, status-effect-free arcane bolt.');
  }

  const evolutionConfig = heroEvolutions.apprenticeMage;
  let upgradeCount = 0;
  while (hero.level < evolutionConfig.requiredLevel) {
    const result = gm.tryUpgradeHero(hero.instanceId);
    if (!result.success) {
      throw new Error(`tryUpgradeHero unexpectedly failed at level ${hero.level} (reason: ${result.reason}) despite ample gold.`);
    }
    upgradeCount += 1;
  }
  console.log(`  连续调用 tryUpgradeHero ${upgradeCount} 次后: Lv.${hero.level}, 攻击力=${hero.stats.currentAttack.toFixed(2)}, maxHp=${hero.stats.maxHp.toFixed(2)}`);
  if (hero.level !== evolutionConfig.requiredLevel) {
    throw new Error(`Expected hero level to land exactly on the evolution threshold ${evolutionConfig.requiredLevel}, got ${hero.level}.`);
  }
  if (hero.stats.currentAttack <= initialAttack || hero.stats.maxHp <= initialMaxHp) {
    throw new Error('Expected attack and maxHp to have grown proportionally from repeated upgrade() calls.');
  }

  const evolveResult = gm.tryEvolveHero(hero.instanceId, 'mage-pyromancer');
  if (!evolveResult.success) {
    throw new Error(`Expected evolution into mage-pyromancer to succeed at the threshold level (reason: ${'reason' in evolveResult ? evolveResult.reason : 'n/a'}).`);
  }
  console.log(`  进化选择: ${hero.evolvedInto}`);
  if (hero.evolvedInto !== 'mage-pyromancer') {
    throw new Error(`Expected evolvedInto to be "mage-pyromancer", got "${hero.evolvedInto}".`);
  }

  // The whole skill set should now be fireballSkill - a Projectile-based
  // skill (projectileSpeed set) carrying a Dot statusEffectOnHit - and the
  // old arcane bolt should be entirely gone, not just added alongside it.
  const evolvedSkill = hero.getSkillDefinition(fireballSkill.id);
  console.log(`  新技能: ${evolvedSkill?.id}, projectileSpeed=${evolvedSkill?.projectileSpeed}, statusEffectOnHit.type=${evolvedSkill?.statusEffectOnHit?.type}`);
  if (!evolvedSkill || evolvedSkill.projectileSpeed === undefined) {
    throw new Error('Expected the evolved hero to own fireballSkill with a defined projectileSpeed (i.e. a ranged, non-melee attack).');
  }
  if (evolvedSkill.statusEffectOnHit?.type !== StatusEffectType.Dot) {
    throw new Error('Expected the evolved fireballSkill to carry a Dot statusEffectOnHit.');
  }
  if (hero.getSkillDefinition('skill-arcane-bolt')) {
    throw new Error('Expected the pre-evolution arcane bolt skill to be fully removed after evolveInto, not left alongside the new one.');
  }

  // A second evolution must be rejected - evolvedInto is already set.
  const secondEvolveResult = gm.tryEvolveHero(hero.instanceId, 'mage-cryomancer');
  console.log(`  二次进化尝试: success=${secondEvolveResult.success}${secondEvolveResult.success ? '' : `, reason=${secondEvolveResult.reason}`}`);
  if (secondEvolveResult.success || secondEvolveResult.reason !== 'already_evolved') {
    throw new Error('Expected a second evolution attempt to be rejected with reason "already_evolved".');
  }
}
console.log('[PASS] 升级/进化边界测试通过：属性按比例放大，技能被整体替换为携带 Projectile + 状态效果的新技能，且拒绝二次进化。\n');

// A single melee hero's DPS (~4.3/s from blade slash's 4s cooldown) can't
// out-damage a goblin (50hp) within the ~3.5s window one range circle
// spends overlapping the path - that's a real dwell-time/DPS limit, not a
// targeting bug. Four heroes clustered on adjacent cells below the path's
// first leg overlap their range circles enough to hit a passing goblin
// simultaneously, comfortably clearing 50hp inside that same window - a
// believable choke-point cluster, and what actually proves out "walks into
// range -> autofires -> dies" end to end.
function createChokePointHero(col: number, row: number) {
  const heroInstance = HeroFactory.createHero(swordsmanTemplate);
  heroInstance.skills.growthSkills[0].unlocked = true;
  return new BattleHero(heroInstance, [bladeSlashSkill, bloodFurySkill, bloodrageSlashSkill], gridCellCenter(col, row));
}

const heroes = [1, 2, 3, 4].map((col) => createChokePointHero(col, 3));

// sampleLevelConfig's wave 2 boss (2000hp) walks the path exactly once and
// never comes back for a second pass, so this cluster can only ever land
// one pass's worth of hits on it - nowhere near enough to kill it. It (and
// likely both orcs) will realistically escape rather than die. Victory
// only requires the field to end up empty with baseHp still positive, not
// every enemy killed (see GameManager.update's isLevelCleared/baseHp>0
// check) - a higher maxBaseHp than the default just keeps a few realistic
// escapes from flipping this into GameOver instead, without needing to
// hand-tune exact damage numbers to guarantee the boss dies.
const TEST_MAX_BASE_HP = 20;

const gameManager = new GameManager(sampleLevelConfig, {
  onWaveStart: (config, index) => {
    console.log(`\n=== 第 ${index + 1} 波开始: ${config.waveId} ===`);
  },
  onWaveComplete: (waveId, _index, nextDelaySeconds) => {
    console.log(
      nextDelaySeconds === null
        ? `--- 波次完成: ${waveId}（最后一波） ---`
        : `--- 波次完成: ${waveId}，${nextDelaySeconds} 秒后进入下一波 ---`,
    );
  },
  onDamageDealt: (event) => {
    const executeTag = event.wasExecuted ? '[处决]' : '';
    console.log(
      `英雄 ${event.source.instanceId} 释放技能 ${event.skillAction.skillId} ${executeTag}对 ${event.target.instanceId} ` +
        `造成 ${event.amount.toFixed(1)} 伤害 (剩余HP ${Math.max(0, event.target.currentHp).toFixed(1)}/${event.target.maxHp})`,
    );
  },
  onEnemyDefeated: (enemy, gold, exp) => {
    console.log(`敌人 ${enemy.instanceId} 死亡，掉落金币 +${gold}，经验 +${exp}`);
  },
  onEnemyReachedEnd: (enemy) => {
    console.log(`敌人 ${enemy.instanceId} 突破防线！大本营 HP -${enemy.baseDamage} (剩余 ${Math.max(0, gameManager.baseHp - enemy.baseDamage)})`);
  },
  onGameOver: () => {
    console.log('\n!!! GAME OVER：大本营已被攻陷 !!!');
  },
  onVictory: () => {
    console.log('\n*** VICTORY：所有波次已清空，大本营存活 ***');
  },
}, { maxBaseHp: TEST_MAX_BASE_HP });

for (const hero of heroes) {
  gameManager.addHero(hero);
}
gameManager.start();

const TICK_SECONDS = 0.1;
const TOTAL_TICKS = 1500;

// Demonstrates forceStartNextWave() in context: the moment wave 2 enters
// its WAITING countdown, skip straight to SPAWNING instead of waiting out
// the full delayBeforeStart.
let forcedWave2Start = false;

let tick = 0;
for (; tick < TOTAL_TICKS && gameManager.gameState === GameState.Playing; tick += 1) {
  if (!forcedWave2Start && gameManager.waveManager.currentIndex === 1 && gameManager.waveManager.state === WaveState.Waiting) {
    console.log('\n>>> forceStartNextWave(): 跳过第 2 波的等待倒计时 <<<');
    gameManager.forceStartNextWave();
    forcedWave2Start = true;
  }
  gameManager.update(TICK_SECONDS);
}

console.log(`\nforceStartNextWave() 是否被触发: ${forcedWave2Start}`);
if (!forcedWave2Start) {
  throw new Error('Expected forceStartNextWave() to have been exercised during the main simulation.');
}

console.log(`\n=== 模拟结束 (共 ${(tick * TICK_SECONDS).toFixed(1)} 秒, gameState=${gameManager.gameState}) ===`);
console.log(`最终金币: ${gameManager.gold}`);
console.log(`最终经验: ${gameManager.experience}`);
console.log(`最终大本营 HP: ${gameManager.baseHp}/${gameManager.maxBaseHp}`);
console.log(`最终波次进度: ${gameManager.waveManager.currentIndex + 1}/${gameManager.waveManager.totalWaveCount}`);
console.log(`isLevelCleared(): ${gameManager.waveManager.isLevelCleared()}`);

// Victory assertion - fails loudly (non-zero exit) if the level didn't
// actually clear within the simulated window, rather than silently
// reporting a passing-looking log.
if (gameManager.gameState !== GameState.Victory) {
  throw new Error(`Expected GameState.Victory after the simulation, got "${gameManager.gameState}" instead.`);
}
if (!gameManager.waveManager.isLevelCleared()) {
  throw new Error('Expected waveManager.isLevelCleared() to be true once GameState.Victory is reached.');
}
console.log('\n[PASS] 胜利断言通过：GameState.Victory 且 isLevelCleared() 均为真。');
