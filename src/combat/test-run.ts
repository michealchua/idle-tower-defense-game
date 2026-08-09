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
import { EquipmentRarity, EquipmentSlot, type EquipmentItem } from './Equipment';
import { setActiveBiomeMechanics } from './activeBiome';
import { themeDefinitions } from './ThemeManager';
import { ANCIENT_RUINS_MAXHP_PENALTY } from './biomeMechanicsCatalog';
import { priestTemplate } from '../data/hero/priestTemplates';
import { holyMendSkill } from '../data/skills/priestSkills';
import { talentManager } from './TalentManager';
import { addMemoryFragments, getMemoryFragments } from './MetaProgression';
import { OfflineManager, MAX_OFFLINE_SECONDS } from './OfflineManager';
import { load as loadSave, save as saveMeta, clearInMemorySnapshotForTesting, recordStageCleared, getHighestStageCleared } from './SaveManager';
import { PrestigeManager, SPARK_BONUS_PER_POINT } from './PrestigeManager';
import { AffixId, SHIELDED_SHIELD_RATIO } from './AffixManager';

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
    // attackRange: 0 means this enemy can never engage the hero itself -
    // this test is purely about the fireball's Dot status, not step 18's
    // enemy-attack mechanic.
    attackDamage: 0,
    attackRange: 0,
    attackSpeed: 1,
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

// --- Boundary test 4: enemy attacks lock onto and kill a hero -----------
//
// A stationary, high-attackDamage enemy placed directly within its own
// attackRange of a single hero - isolates the attack-engagement/death path
// itself (step 18) from pathing, wave management, or any other hero on the
// field. Verifies: the enemy locks onto and repeatedly hits the hero
// (heroDamageEventsBeforeDeath), the hero actually dies (isDead=true,
// currentHp=0), and - the core "hero survival" requirement - a dead hero
// stops being a valid attack target AND stops firing its own skills
// (DPS output) entirely from that tick on.
console.log('=== 边界测试 4：敌人反击锁定英雄，英雄死亡后停止 DPS 输出 ===');
{
  const heroInstance = HeroFactory.createHero(swordsmanTemplate);
  const hero = new BattleHero(heroInstance, [bladeSlashSkill], { x: 0, y: 0 });
  // currentHp is still a plain mutable field (see BattleHero.stats' doc
  // comment - only maxHp/currentAttack/etc became getters in step 19), so
  // this override still works: starts the hero well below its real
  // (unmodified) maxHp so a couple of 20-damage hits are enough to kill it
  // without needing to fight through swordsmanTemplate's full 120 HP.
  hero.stats.currentHp = 50;

  // speed: 0 and placed well within attackRange of the hero at (0,0) - no
  // need to walk ENEMY_PATH into range first, this test only cares about
  // what happens once an enemy is already engaged.
  const attacker = new BattleEnemy({
    instanceId: 'attacker-test-enemy',
    archetypeId: 'goblin',
    maxHp: 500,
    defense: 0,
    speed: 0,
    goldReward: 0,
    expReward: 0,
    baseDamage: 0,
    attackDamage: 20,
    attackRange: 100,
    attackSpeed: 1,
  });
  attacker.x = 30;
  attacker.y = 0;

  // Phase-based, not an instantaneous `hero.isDead` check inside the
  // callback: the killing blow's own onHeroDamaged event fires *after*
  // BattleHero.takeDamage has already flipped isDead to true, so reading
  // isDead at callback time would misattribute that one lethal hit to
  // "after death" instead of "the hit that caused it". `phase` only
  // flips once the death-loop below has actually exited.
  let phase: 'before' | 'after' = 'before';
  let heroDamageEventsBeforeDeath = 0;
  let heroDamageEventsAfterDeath = 0;
  let damageDealtEventsAfterDeath = 0;

  const engine = new CombatEngine({
    onHeroDamaged: () => {
      if (phase === 'before') {
        heroDamageEventsBeforeDeath += 1;
      } else {
        heroDamageEventsAfterDeath += 1;
      }
    },
    onDamageDealt: () => {
      if (phase === 'after') {
        damageDealtEventsAfterDeath += 1;
      }
    },
  });
  engine.addHero(hero);
  engine.addEnemy(attacker);

  const dt = 0.1;
  let tick = 0;
  const maxTicksToDeath = 500;
  while (!hero.isDead && tick < maxTicksToDeath) {
    engine.update(dt);
    tick += 1;
  }
  phase = 'after';
  console.log(`  英雄于第 ${tick} tick 死亡: isDead=${hero.isDead}, HP=${hero.stats.currentHp}, 死亡前共受到 ${heroDamageEventsBeforeDeath} 次攻击`);
  if (!hero.isDead || hero.stats.currentHp !== 0) {
    throw new Error('Expected the enemy to have locked onto and killed the hero (isDead=true, currentHp=0).');
  }
  if (heroDamageEventsBeforeDeath < 2) {
    throw new Error('Expected the enemy to land more than one attack (sustained engagement) before the hero died.');
  }

  // Keep simulating after death - a dead hero must stop all further
  // skill/attack output (BattleHero.update returns null while isDead) and
  // must no longer be a valid attack target either
  // (CombatEngine.findNearestHeroInRange excludes dead heroes), so no new
  // events of either kind should fire from this point on.
  for (let i = 0; i < 50; i += 1) {
    engine.update(dt);
  }
  console.log(`  死亡后又模拟 50 tick: 英雄仍被攻击次数=${heroDamageEventsAfterDeath}, 英雄仍造成伤害次数=${damageDealtEventsAfterDeath}`);
  if (heroDamageEventsAfterDeath > 0) {
    throw new Error('Expected a dead hero to no longer be a valid enemy attack target.');
  }
  if (damageDealtEventsAfterDeath > 0) {
    throw new Error('Expected a dead hero to stop firing skills (DPS output) entirely once isDead.');
  }
}
console.log('[PASS] 敌人反击边界测试通过：成功锁定并击杀英雄，死亡后正确停止了 DPS 输出与被攻击资格。\n');

// --- Boundary test 5: equipment stat bonuses stack, and fall back on -----
//     unequip
//
// Manually-authored items (not rolled through equipmentCatalog's RNG - the
// point here is the formula, not the loot table) covering both flat and
// percent modifiers, across two different stats each: the legendary
// weapon's crit bonus and the rare armor's maxHp bonus must both still
// apply after the weapon's own attack bonus is removed, proving slots are
// independent rather than the whole equipment set getting reset together.
console.log('=== 边界测试 5：装备加成的叠加计算与卸下后的属性回落 ===');
{
  const heroInstance = HeroFactory.createHero(swordsmanTemplate);
  const hero = new BattleHero(heroInstance, [bladeSlashSkill], { x: 0, y: 0 });

  const baseAttack = hero.stats.currentAttack;
  const baseMaxHp = hero.stats.maxHp;
  const baseCrit = hero.stats.currentCrit;
  console.log(`  装备前 (Lv.${hero.level}): 攻击力=${baseAttack.toFixed(2)}, maxHp=${baseMaxHp.toFixed(2)}, 暴击=${baseCrit.toFixed(3)}`);

  const legendaryWeapon: EquipmentItem = {
    instanceId: 'test-legendary-weapon',
    itemId: 'test-legendary-weapon-template',
    name: '测试传奇武器',
    slot: EquipmentSlot.Weapon,
    rarity: EquipmentRarity.Legendary,
    modifiers: { attack: { flat: 50 }, crit: { flat: 0.1 } },
    level: 1,
    currentExp: 0,
    baseExpValue: 200,
  };
  const rareArmor: EquipmentItem = {
    instanceId: 'test-rare-armor',
    itemId: 'test-rare-armor-template',
    name: '测试稀有护甲',
    slot: EquipmentSlot.Armor,
    level: 1,
    currentExp: 0,
    baseExpValue: 30,
    rarity: EquipmentRarity.Rare,
    modifiers: { maxHp: { flat: 100 } },
  };

  const previousWeaponSlot = hero.equipItem(legendaryWeapon);
  const previousArmorSlot = hero.equipItem(rareArmor);
  if (previousWeaponSlot !== null || previousArmorSlot !== null) {
    throw new Error('Expected both slots to have been empty before equipping, so equipItem should have returned null for each.');
  }

  const expectedAttack = baseAttack + 50;
  const expectedCrit = baseCrit + 0.1;
  const expectedMaxHp = baseMaxHp + 100;
  console.log(
    `  装备后: 攻击力=${hero.stats.currentAttack.toFixed(2)} (期望 ${expectedAttack.toFixed(2)}), ` +
      `暴击=${hero.stats.currentCrit.toFixed(3)} (期望 ${expectedCrit.toFixed(3)}), ` +
      `maxHp=${hero.stats.maxHp.toFixed(2)} (期望 ${expectedMaxHp.toFixed(2)})`,
  );
  if (Math.abs(hero.stats.currentAttack - expectedAttack) > 0.001) {
    throw new Error(`Expected equipped attack to equal base + flat weapon bonus: got ${hero.stats.currentAttack}, expected ${expectedAttack}.`);
  }
  if (Math.abs(hero.stats.currentCrit - expectedCrit) > 0.001) {
    throw new Error(`Expected equipped crit to equal base + flat weapon crit bonus: got ${hero.stats.currentCrit}, expected ${expectedCrit}.`);
  }
  if (Math.abs(hero.stats.maxHp - expectedMaxHp) > 0.001) {
    throw new Error(`Expected equipped maxHp to equal base + flat armor bonus: got ${hero.stats.maxHp}, expected ${expectedMaxHp}.`);
  }

  const removedWeapon = hero.unequipItem(EquipmentSlot.Weapon);
  console.log(
    `  卸下武器 (${removedWeapon?.name}): 攻击力回落至=${hero.stats.currentAttack.toFixed(2)} (期望 ${baseAttack.toFixed(2)}), ` +
      `暴击回落至=${hero.stats.currentCrit.toFixed(3)} (期望 ${baseCrit.toFixed(3)}), maxHp 应保持不变=${hero.stats.maxHp.toFixed(2)}`,
  );
  if (removedWeapon?.instanceId !== legendaryWeapon.instanceId) {
    throw new Error('Expected unequipItem to return the exact weapon instance that was equipped.');
  }
  if (Math.abs(hero.stats.currentAttack - baseAttack) > 0.001) {
    throw new Error(`Expected attack to fall back to its pre-equipment value after unequipping the weapon: got ${hero.stats.currentAttack}, expected ${baseAttack}.`);
  }
  if (Math.abs(hero.stats.currentCrit - baseCrit) > 0.001) {
    throw new Error(`Expected crit to fall back to its pre-equipment value after unequipping the weapon: got ${hero.stats.currentCrit}, expected ${baseCrit}.`);
  }
  // The still-equipped armor's maxHp bonus must survive the weapon's
  // removal untouched - slots are independent, not an all-or-nothing set.
  if (Math.abs(hero.stats.maxHp - expectedMaxHp) > 0.001) {
    throw new Error('Expected unequipping the weapon to leave the still-equipped armor\'s maxHp bonus untouched.');
  }
}
console.log('[PASS] 装备加成边界测试通过：固定加成正确叠加到最终属性，卸下后单个槽位的加成独立回落。\n');

// --- Boundary test 6: enhancement (feeding fodder to level up gear) -----
//
// A rare weapon (still level 1) gets equipped onto a hero, then leveled up
// by feeding it 3 Common items as fodder through the real
// GameManager.tryEnhanceEquipment path (equipped-item branch, not
// InventoryManager.enhanceEquipment directly - proving out the whole
// "target is currently worn" flow, not just the underlying math). Verifies:
// the weapon actually leveled up, the 3 fodder items are gone from the bag
// entirely (destroyed, not just unequipped-and-kept), and the hero's own
// live attack stat reflects the newly-enhanced weapon's bigger numbers
// with no separate "recalculate" call needed.
console.log('=== 边界测试 6：装备强化（消耗狗粮升级已穿戴装备）===');
{
  const gm = new GameManager(sampleLevelConfig, {}, { startingGold: 100000 });
  const placeResult = gm.tryPlaceHero('swordsman', { col: 1, row: 3 });
  if (!placeResult.success) {
    throw new Error('Expected placing the swordsman hero to succeed with ample gold.');
  }
  const hero = placeResult.hero;

  const rareWeapon: EquipmentItem = {
    instanceId: 'enhance-test-rare-weapon',
    itemId: 'enhance-test-rare-weapon-template',
    name: '测试待强化稀有武器',
    slot: EquipmentSlot.Weapon,
    rarity: EquipmentRarity.Rare,
    modifiers: { attack: { flat: 20 } },
    level: 1,
    currentExp: 0,
    baseExpValue: 30,
  };
  gm.inventory.addItem(rareWeapon);

  // 3 x 20 exp = 60, comfortably clearing expThresholdForLevel(1) (50) with
  // 10 left over as banked progress toward level 3 - enough to prove a
  // real level-up happened without landing suspiciously exactly on 0.
  const commonFoodItems: EquipmentItem[] = [1, 2, 3].map((n) => ({
    instanceId: `enhance-test-common-food-${n}`,
    itemId: 'enhance-test-common-food-template',
    name: `杂兵装备${n}`,
    slot: EquipmentSlot.Boots,
    rarity: EquipmentRarity.Common,
    modifiers: { attackSpeed: { flat: 0.01 } },
    level: 1,
    currentExp: 0,
    baseExpValue: 20,
  }));
  for (const food of commonFoodItems) {
    gm.inventory.addItem(food);
  }

  const equipResult = gm.tryEquipItem(hero.instanceId, rareWeapon.instanceId);
  if (!equipResult.success) {
    throw new Error('Expected equipping the rare weapon onto the freshly-placed hero to succeed.');
  }

  const attackBeforeEnhance = hero.stats.currentAttack;
  console.log(`  强化前: 武器等级=${rareWeapon.level}, 英雄攻击力=${attackBeforeEnhance.toFixed(2)}`);

  const foodIds = commonFoodItems.map((item) => item.instanceId);
  const enhanceResult = gm.tryEnhanceEquipment(rareWeapon.instanceId, foodIds);
  if (!enhanceResult.success) {
    throw new Error(`Expected tryEnhanceEquipment to succeed (reason: ${'reason' in enhanceResult ? enhanceResult.reason : 'n/a'}).`);
  }
  console.log(`  强化结算: 获得经验=${enhanceResult.expGained}, 提升等级数=${enhanceResult.levelsGained}, 武器新等级=${rareWeapon.level}, 剩余经验=${rareWeapon.currentExp}`);
  if (rareWeapon.level !== 2 || enhanceResult.levelsGained !== 1) {
    throw new Error(`Expected the weapon to level up exactly once to level 2: got level ${rareWeapon.level}, levelsGained ${enhanceResult.levelsGained}.`);
  }

  const remainingInventoryIds = gm.inventory.getItems().map((item) => item.instanceId);
  console.log(`  背包中剩余道具数=${remainingInventoryIds.length} (期望 0，3 件狗粮均被销毁)`);
  for (const foodId of foodIds) {
    if (remainingInventoryIds.includes(foodId)) {
      throw new Error(`Expected fodder item "${foodId}" to have been destroyed (removed from the bag), but it's still there.`);
    }
  }

  // attack = levelStats.attack + modifiers.attack.flat * equipmentLevelMultiplier(level)
  // level 1: 20 * 1.0 = 20 | level 2: 20 * 1.1 = 22 -> +2 over the pre-enhance value.
  const expectedAttackAfterEnhance = attackBeforeEnhance + 2;
  console.log(`  强化后英雄攻击力=${hero.stats.currentAttack.toFixed(2)} (期望 ${expectedAttackAfterEnhance.toFixed(2)})`);
  if (Math.abs(hero.stats.currentAttack - expectedAttackAfterEnhance) > 0.001) {
    throw new Error(
      `Expected the hero's live attack stat to reflect the weapon's new level-2 bonus with no extra recalculation step: got ${hero.stats.currentAttack}, expected ${expectedAttackAfterEnhance}.`,
    );
  }
}
console.log('[PASS] 装备强化边界测试通过：已穿戴装备成功升级，狗粮被彻底销毁，英雄攻击力实时反映了强化后的装备加成。\n');

// --- Boundary test 7: Volcano biome mechanic - burn drains hero HP ------
//
// Places a single hero (no enemies, no combat at all) under Volcano's
// mechanics via setActiveBiomeMechanics directly - isolates the biome's
// onUpdate hook itself from GameManager/ThemeManager's own wave-driven
// rotation, which would take many simulated waves to land on Volcano at
// all (see ThemeManager.updateForWave's now-random rotation). Fast-forwards
// 10 simulated seconds (several of Volcano's 3-second burn pulses) and
// asserts HP strictly decreased.
console.log('=== 边界测试 7：Volcano 环境机制 - 灼烧是否随时间降低英雄 HP ===');
{
  setActiveBiomeMechanics(null);
  const heroInstance = HeroFactory.createHero(swordsmanTemplate);
  const hero = new BattleHero(heroInstance, [bladeSlashSkill], { x: 0, y: 0 });
  const initialHp = hero.stats.currentHp;

  setActiveBiomeMechanics(themeDefinitions.volcano.mechanics);
  const engine = new CombatEngine();
  engine.addHero(hero);

  const dt = 0.1;
  for (let i = 0; i < 100; i += 1) {
    // 10 simulated seconds total
    engine.update(dt);
    themeDefinitions.volcano.mechanics.onUpdate?.(dt, engine);
  }

  console.log(`  10 秒后英雄 HP: ${hero.stats.currentHp.toFixed(1)} (初始 ${initialHp.toFixed(1)}, 期望因灼烧下降)`);
  if (hero.stats.currentHp >= initialHp) {
    throw new Error(`Expected Volcano's burn mechanic to have reduced the hero's HP over time: got ${hero.stats.currentHp}, started at ${initialHp}.`);
  }
  setActiveBiomeMechanics(null);
}
console.log('[PASS] Volcano 环境机制通过：英雄因持续灼烧损失了生命值。\n');

// --- Boundary test 8: Ancient Ruins biome mechanic - hero maxHp penalty -
//
// A fresh hero's maxHp is read once with no biome active, then again with
// Ancient Ruins' mechanics live - asserts the *live* getter (BattleHero.
// stats.maxHp, via computeFinalStat's biome-hook final step) reflects the
// exact expected -15% penalty, and that removing the biome again restores
// the original value (proving the reduction is a runtime layer, not a
// mutation of the hero's own levelStats).
console.log('=== 边界测试 8：Ancient Ruins 环境机制 - 英雄 maxHp 是否正确降低 ===');
{
  setActiveBiomeMechanics(null);
  const heroInstance = HeroFactory.createHero(swordsmanTemplate);
  const hero = new BattleHero(heroInstance, [bladeSlashSkill], { x: 0, y: 0 });
  const baseMaxHp = hero.stats.maxHp;

  setActiveBiomeMechanics(themeDefinitions.ancientRuins.mechanics);
  const expectedMaxHp = baseMaxHp * (1 - ANCIENT_RUINS_MAXHP_PENALTY);
  console.log(`  基础 maxHp=${baseMaxHp.toFixed(2)}, 遗迹加成后=${hero.stats.maxHp.toFixed(2)} (期望 ${expectedMaxHp.toFixed(2)})`);
  if (Math.abs(hero.stats.maxHp - expectedMaxHp) > 0.001) {
    throw new Error(`Expected Ancient Ruins to reduce hero maxHp by exactly ${ANCIENT_RUINS_MAXHP_PENALTY * 100}%: got ${hero.stats.maxHp}, expected ${expectedMaxHp}.`);
  }

  setActiveBiomeMechanics(null);
  console.log(`  移除环境后 maxHp 回落至=${hero.stats.maxHp.toFixed(2)} (期望恢复为 ${baseMaxHp.toFixed(2)})`);
  if (Math.abs(hero.stats.maxHp - baseMaxHp) > 0.001) {
    throw new Error(`Expected hero maxHp to fall back to its pre-biome value once Ancient Ruins is no longer active: got ${hero.stats.maxHp}, expected ${baseMaxHp}.`);
  }
}
console.log('[PASS] Ancient Ruins 环境机制通过：英雄 maxHp 按预期比例降低，且环境移除后正确回落。\n');

// --- Boundary test 9: Priest heal + cleanse (step 23) --------------------
//
// A priest and a heavily-damaged, burning ally on an otherwise empty field
// (no enemies at all) - isolates CombatEngine's Heal-tagged branch
// (resolveHealCast/findLowestHpAlly) from every other combat system.
// Detects "the heal actually landed" by watching for the first HP increase
// (burn only ever decreases HP, so any rise can only be the heal), then
// asserts the target's one active burn stack was cleared by the same cast.
console.log('=== 边界测试 9：牧师治疗与净化 - 治疗残血英雄并移除 BURN 状态 ===');
{
  setActiveBiomeMechanics(null);

  const priestInstance = HeroFactory.createHero(priestTemplate);
  const priest = new BattleHero(priestInstance, [holyMendSkill], { x: 0, y: 0 });

  const targetInstance = HeroFactory.createHero(swordsmanTemplate);
  const target = new BattleHero(targetInstance, [bladeSlashSkill], { x: 50, y: 0 });
  target.stats.currentHp = target.stats.maxHp * 0.2;
  target.applyBurn(5, 999);

  // Read counts through this indirection rather than `target.activeBurnCount`
  // directly - TypeScript's control-flow narrowing otherwise treats repeated
  // reads of that exact dotted expression as one "aliased condition" and
  // keeps pinning it to whatever literal an earlier `!==` check excluded,
  // straight through the engine.update() calls in between that actually
  // change it (same pitfall this file's other tests already call out for
  // getters like WaveManager.state) - a plain function call has no such
  // aliasing, so each call is read fresh.
  function burnCount(hero: BattleHero): number {
    return hero.activeBurnCount;
  }

  console.log(`  初始状态: HP=${target.stats.currentHp.toFixed(1)}/${target.stats.maxHp.toFixed(1)}, 活跃灼烧层数=${burnCount(target)}`);
  if (burnCount(target) !== 1) {
    throw new Error(`Expected the test target to start with exactly one active burn stack: got ${burnCount(target)}.`);
  }

  const engine = new CombatEngine();
  engine.addHero(priest);
  engine.addHero(target);

  const hpBeforeHeal = target.stats.currentHp;
  const dt = 0.1;
  let healed = false;
  for (let i = 0; i < 200 && !healed; i += 1) {
    engine.update(dt);
    if (target.stats.currentHp > hpBeforeHeal + 0.01) {
      healed = true;
    }
  }

  console.log(`  治疗后: HP=${target.stats.currentHp.toFixed(1)} (治疗前 ${hpBeforeHeal.toFixed(1)}), 剩余灼烧层数=${burnCount(target)}`);
  if (!healed) {
    throw new Error('Expected the priest to have healed the low-HP target within the simulated window.');
  }
  if (burnCount(target) !== 0) {
    throw new Error(`Expected the priest's cleansesDebuff heal to have removed the target's burn stack: still has ${burnCount(target)}.`);
  }
}
console.log('[PASS] 牧师治疗/净化边界测试通过：残血友军获得治疗，且身上的灼烧状态被清除。\n');

// --- Boundary test 10: Vitality talent raises a fresh hero's maxHp -------
//
// Grants enough Memory Fragments to buy 3 levels of Vitality, upgrades it
// via the real talentManager.upgradeTalent path (step 24's dynamic
// costFormula, not a flat fee - each level's cost is read fresh via
// getNextLevelCost rather than assumed constant), then instantiates a
// brand new hero afterward and asserts its live maxHp getter (BattleHero.
// stats.maxHp, via computeFinalStat's talent layer) reflects the exact
// expected percentage bonus - proves the talent affects hero construction/
// stats globally, not just a hero that happened to already exist.
//
// Isolation note: TalentManager deliberately exposes no reset/respec
// method at all (see its own "落子无悔" doc comment) - test isolation here
// goes through SaveManager's clearInMemorySnapshotForTesting() + an
// explicit save() instead, which establishes a clean *persisted* baseline
// the normal way (saving the all-default snapshot), not by pretending a
// talent was ever un-bought.
console.log('=== 边界测试 10：天赋树 - Vitality 是否正确提升新英雄的初始 maxHp ===');
{
  setActiveBiomeMechanics(null);
  clearInMemorySnapshotForTesting();
  saveMeta();

  const heroBefore = new BattleHero(HeroFactory.createHero(swordsmanTemplate), [bladeSlashSkill], { x: 0, y: 0 });
  const baseMaxHp = heroBefore.stats.maxHp;

  const vitalityNode = talentManager.getNode('vitality');
  if (!vitalityNode) {
    throw new Error('Expected a "vitality" talent node to be registered in talentNodes.');
  }

  // Ample fragments for 3 upgrades - costFormula grows per level, so this
  // over-provisions rather than trying to predict the exact running total.
  addMemoryFragments(vitalityNode.costFormula(0) + vitalityNode.costFormula(1) + vitalityNode.costFormula(2) + 100);

  for (let i = 0; i < 3; i += 1) {
    const result = talentManager.upgradeTalent('vitality');
    if (!result.success) {
      throw new Error(`Expected upgradeTalent('vitality') to succeed on attempt ${i + 1} with ample fragments (reason: ${'reason' in result ? result.reason : 'n/a'}).`);
    }
  }
  console.log(`  升级后 Vitality 等级=${talentManager.getLevel('vitality')} (期望 3)`);
  if (talentManager.getLevel('vitality') !== 3) {
    throw new Error(`Expected Vitality to be at level 3 after 3 successful upgrades: got ${talentManager.getLevel('vitality')}.`);
  }

  const heroAfter = new BattleHero(HeroFactory.createHero(swordsmanTemplate), [bladeSlashSkill], { x: 0, y: 0 });
  const expectedMaxHp = baseMaxHp * (1 + 3 * vitalityNode.bonusPerLevel);
  console.log(`  天赋加成前 maxHp=${baseMaxHp.toFixed(2)}, 加成后=${heroAfter.stats.maxHp.toFixed(2)} (期望 ${expectedMaxHp.toFixed(2)})`);
  if (Math.abs(heroAfter.stats.maxHp - expectedMaxHp) > 0.001) {
    throw new Error(`Expected the freshly-instantiated hero's maxHp to reflect Vitality's talent bonus: got ${heroAfter.stats.maxHp}, expected ${expectedMaxHp}.`);
  }

  // Clean baseline for the choke-point simulation below - saves the
  // all-default snapshot (not a talent-specific reset) so nothing here
  // secretly buffs it.
  clearInMemorySnapshotForTesting();
  saveMeta();
}
console.log('[PASS] 天赋树边界测试通过：消耗记忆碎片升级 Vitality 后，新实例化英雄的 maxHp 正确享受了百分比加成。\n');

// --- Boundary test 10b: Persistence round trip (step 24) -----------------
//
// Spends 100 Memory Fragments on a Vitality upgrade through the real
// upgradeTalent path (which itself calls SaveManager.save() on success -
// see that method's doc comment), then simulates the process being killed
// and restarted: clearInMemorySnapshotForTesting() wipes SaveManager's
// in-memory `current` snapshot (but not whatever was actually persisted by
// that save() call), and only *then* does load() get called again - so a
// passing assertion here proves an actual serialize/deserialize round
// trip through persistentStore, not just that an in-memory value never
// changed.
console.log('=== 边界测试 10b：数据持久化 - 天赋等级与记忆碎片的序列化/反序列化往返 ===');
{
  clearInMemorySnapshotForTesting();
  saveMeta();

  addMemoryFragments(100);
  const fragmentsBeforeUpgrade = getMemoryFragments();
  const vitalityNode = talentManager.getNode('vitality');
  if (!vitalityNode) {
    throw new Error('Expected a "vitality" talent node to be registered in talentNodes.');
  }
  const expectedCost = vitalityNode.costFormula(talentManager.getLevel('vitality'));

  const upgradeResult = talentManager.upgradeTalent('vitality');
  if (!upgradeResult.success) {
    throw new Error(`Expected upgradeTalent('vitality') to succeed with 100 fragments in hand (reason: ${'reason' in upgradeResult ? upgradeResult.reason : 'n/a'}).`);
  }
  const fragmentsAfterUpgrade = getMemoryFragments();
  const levelAfterUpgrade = talentManager.getLevel('vitality');
  console.log(
    `  升级前碎片=${fragmentsBeforeUpgrade}, 花费=${upgradeResult.fragmentsSpent} (期望 ${expectedCost}), 升级后碎片=${fragmentsAfterUpgrade}, 天赋等级=${levelAfterUpgrade}`,
  );
  if (upgradeResult.fragmentsSpent !== expectedCost) {
    throw new Error(`Expected upgradeTalent to spend exactly costFormula(currentLevel): got ${upgradeResult.fragmentsSpent}, expected ${expectedCost}.`);
  }
  if (fragmentsAfterUpgrade !== fragmentsBeforeUpgrade - expectedCost) {
    throw new Error(`Expected Memory Fragments to be deducted by exactly the upgrade's cost: got ${fragmentsAfterUpgrade}, expected ${fragmentsBeforeUpgrade - expectedCost}.`);
  }
  if (levelAfterUpgrade !== 1) {
    throw new Error(`Expected Vitality to be at level 1 after a single successful upgrade: got ${levelAfterUpgrade}.`);
  }

  // "强制清空当前内存数据，再调用读取接口" - the actual persistence assertion.
  clearInMemorySnapshotForTesting();
  loadSave();
  const fragmentsAfterReload = getMemoryFragments();
  const levelAfterReload = talentManager.getLevel('vitality');
  console.log(`  清空内存并重新 load() 后: 碎片=${fragmentsAfterReload} (期望 ${fragmentsAfterUpgrade}), 天赋等级=${levelAfterReload} (期望 ${levelAfterUpgrade})`);
  if (fragmentsAfterReload !== fragmentsAfterUpgrade) {
    throw new Error(`Expected Memory Fragments to survive a save()/clear-memory/load() round trip exactly: got ${fragmentsAfterReload}, expected ${fragmentsAfterUpgrade}.`);
  }
  if (levelAfterReload !== levelAfterUpgrade) {
    throw new Error(`Expected the Vitality talent level to survive a save()/clear-memory/load() round trip exactly: got ${levelAfterReload}, expected ${levelAfterUpgrade}.`);
  }

  // Clean baseline for the choke-point simulation below.
  clearInMemorySnapshotForTesting();
  saveMeta();
}
console.log('[PASS] 数据持久化边界测试通过：碎片扣除与天赋等级提升正确生效，且在内存被清空后经 save()/load() 完美恢复。\n');

// --- Boundary test 11: Offline progress rewards (step 25) ---------------
//
// A pure function test of OfflineManager.calculateRewards - no SaveManager/
// localStorage involved at all, since calculateRewards takes its two
// inputs (highestStageCleared, elapsedSeconds) directly rather than
// reading them itself. Covers both the spec's explicit cases: a scaled
// 4-hour/stage-20 reward package, and the MAX_OFFLINE_SECONDS cap (an
// absurdly long absence must be clamped, not paid out linearly forever).
console.log('=== 边界测试 11：离线收益 - 固定低保奖励按历史最高层数与离线时长计算 ===');
{
  const FOUR_HOURS_SECONDS = 4 * 60 * 60;
  const HIGHEST_STAGE = 20;

  const rewards = OfflineManager.calculateRewards(HIGHEST_STAGE, FOUR_HOURS_SECONDS);
  console.log(
    `  4 小时离线 @ 历史最高第 ${HIGHEST_STAGE} 波: 金币=+${rewards.gold}, 记忆碎片=+${rewards.memoryFragments}, 装备=${rewards.equipment.length} 件`,
  );

  if (rewards.offlineSeconds !== FOUR_HOURS_SECONDS) {
    throw new Error(`Expected offlineSeconds to pass an under-cap elapsed time through unchanged: got ${rewards.offlineSeconds}, expected ${FOUR_HOURS_SECONDS}.`);
  }
  if (rewards.gold <= 0) {
    throw new Error('Expected a positive gold reward for a stage-20 save with 4 hours offline.');
  }
  if (rewards.memoryFragments <= 0) {
    throw new Error('Expected a positive Memory Fragments reward for a stage-20 save with 4 hours offline.');
  }
  if (rewards.equipment.length === 0) {
    throw new Error('Expected at least one piece of offline "dog food" equipment over a 4-hour window.');
  }

  const forbiddenRarities = rewards.equipment.filter(
    (item) => item.rarity === EquipmentRarity.Epic || item.rarity === EquipmentRarity.Legendary,
  );
  console.log(`  掉落稀有度分布: ${rewards.equipment.map((item) => item.rarity).join(', ')}`);
  if (forbiddenRarities.length > 0) {
    throw new Error(`Expected offline equipment to never include Epic/Legendary rarity: got ${forbiddenRarities.map((item) => item.rarity).join(', ')}.`);
  }
  if (!rewards.equipment.every((item) => item.rarity === EquipmentRarity.Common || item.rarity === EquipmentRarity.Rare)) {
    throw new Error('Expected every offline equipment drop to be exactly Common or Rare rarity.');
  }

  // A wildly-longer absence must clamp to MAX_OFFLINE_SECONDS, not scale
  // linearly forever - same total reward as being away exactly the cap.
  const cappedRewards = OfflineManager.calculateRewards(HIGHEST_STAGE, MAX_OFFLINE_SECONDS * 10);
  const atCapRewards = OfflineManager.calculateRewards(HIGHEST_STAGE, MAX_OFFLINE_SECONDS);
  console.log(
    `  离线 10x 上限 vs 恰好上限: gold=${cappedRewards.gold} vs ${atCapRewards.gold}, fragments=${cappedRewards.memoryFragments} vs ${atCapRewards.memoryFragments}`,
  );
  if (cappedRewards.offlineSeconds !== MAX_OFFLINE_SECONDS) {
    throw new Error(`Expected an absence far beyond MAX_OFFLINE_SECONDS to clamp offlineSeconds to the cap: got ${cappedRewards.offlineSeconds}, expected ${MAX_OFFLINE_SECONDS}.`);
  }
  if (cappedRewards.gold !== atCapRewards.gold || cappedRewards.memoryFragments !== atCapRewards.memoryFragments) {
    throw new Error('Expected rewards for an absence far beyond the cap to exactly match rewards for an absence of exactly the cap.');
  }

  // A save that's never cleared a single wave (highestStageCleared 0)
  // still returns a well-formed package - no gold/fragments to give (there's
  // nothing to scale the guarantee off yet), not a crash or negative value.
  const freshSaveRewards = OfflineManager.calculateRewards(0, FOUR_HOURS_SECONDS);
  console.log(`  历史最高第 0 波（全新存档）: 金币=${freshSaveRewards.gold}, 记忆碎片=${freshSaveRewards.memoryFragments}`);
  if (freshSaveRewards.gold !== 0 || freshSaveRewards.memoryFragments !== 0) {
    throw new Error(`Expected a fresh save (highestStageCleared 0) to earn no gold/fragments offline: got gold=${freshSaveRewards.gold}, fragments=${freshSaveRewards.memoryFragments}.`);
  }
}
console.log('[PASS] 离线收益边界测试通过：奖励按历史最高层数与离线时长正确缩放，且装备产出严格排除 Epic/Legendary。\n');

// --- Boundary test 12: Prestige system (step 27) -------------------------
//
// Forces a high historical highestStageCleared via SaveManager.
// recordStageCleared - what PrestigeManager.calculateSparks/executePrestige
// actually read from (there's no, nor should there be, a live "jump
// WaveManager to wave 50" API; prestige eligibility is about the save's
// all-time best, not any one GameManager instance's current wave). Places
// a hero and levels it to 50, executes a real prestige, and asserts every
// piece of state the spec calls out: wave back to "Wave 1" (waveManager.
// currentIndex 0), gold zeroed, hero level back to 1. Finally captures a
// baseline hero's attack *before* any Sparks exist and compares it against
// a freshly-instantiated hero built *after* the prestige, proving the
// (1 + Sparks * 0.05) multiplier is a persisted, account-wide bonus - not
// something tied to the specific hero/run that was just reset.
console.log('=== 边界测试 12：转生系统 - 星火结算与全局属性乘区 ===');
{
  setActiveBiomeMechanics(null);
  clearInMemorySnapshotForTesting();
  saveMeta();

  // Captured before recordStageCleared/executePrestige below, so this is
  // guaranteed to reflect zero Eternity Sparks - the "before" half of the
  // global-multiplier comparison at the end of this test.
  const baselineHero = new BattleHero(HeroFactory.createHero(swordsmanTemplate), [bladeSlashSkill], { x: 0, y: 0 });
  const baselineAttack = baselineHero.stats.currentAttack;

  recordStageCleared(50);

  const gm = new GameManager(sampleLevelConfig, {}, { startingGold: 10000, maxBaseHp: 100 });
  gm.start();

  const placeResult = gm.tryPlaceHero('swordsman', { col: 1, row: 3 });
  if (!placeResult.success) {
    throw new Error('Expected placing the swordsman hero to succeed with ample gold.');
  }
  const hero = placeResult.hero;
  gm.gold = 10000; // tryPlaceHero already spent some on the placement itself - top back up so "金币为 10000" going into the prestige matches the spec's forced precondition exactly.
  for (let i = 0; i < 49; i += 1) {
    hero.upgrade();
  }
  // Read through this indirection rather than `hero.level` directly -
  // TypeScript's control-flow narrowing otherwise treats repeated reads of
  // that exact property as one "aliased condition" and keeps pinning it to
  // whatever literal an earlier `!==` check excluded, straight through the
  // executePrestige() call in between that's exactly what changes it (same
  // pitfall this file's Priest/burn-count test already works around).
  function heroLevel(h: BattleHero): number {
    return h.level;
  }

  console.log(`  转生前: 波次索引=${gm.waveManager.currentIndex}, 金币=${gm.gold}, 英雄等级=${heroLevel(hero)}`);
  if (heroLevel(hero) !== 50) {
    throw new Error(`Expected the hero to be exactly level 50 before prestiging: got ${heroLevel(hero)}.`);
  }

  const sparksPreview = PrestigeManager.calculateSparks(getHighestStageCleared());
  console.log(`  历史最高波次=${getHighestStageCleared()}, calculateSparks 预览=${sparksPreview}`);
  if (sparksPreview <= 0) {
    throw new Error(`Expected calculateSparks to return a positive value for a highestStageCleared of 50: got ${sparksPreview}.`);
  }

  const sparksGained = PrestigeManager.executePrestige(gm);
  console.log(`  转生结算: 获得星火=${sparksGained}, 转生后波次索引=${gm.waveManager.currentIndex}, 金币=${gm.gold}, 英雄等级=${heroLevel(hero)}`);
  if (sparksGained !== sparksPreview) {
    throw new Error(`Expected executePrestige to grant exactly the previewed Sparks amount: got ${sparksGained}, expected ${sparksPreview}.`);
  }
  if (gm.waveManager.currentIndex !== 0) {
    throw new Error(`Expected the wave to reset back to "Wave 1" (currentIndex 0) after prestiging: got ${gm.waveManager.currentIndex}.`);
  }
  if (gm.gold !== 0) {
    throw new Error(`Expected gold to reset to 0 after prestiging: got ${gm.gold}.`);
  }
  if (heroLevel(hero) !== 1) {
    throw new Error(`Expected the hero's level to reset to 1 after prestiging: got ${heroLevel(hero)}.`);
  }

  const heroAfterPrestige = new BattleHero(HeroFactory.createHero(swordsmanTemplate), [bladeSlashSkill], { x: 0, y: 0 });
  const expectedAttack = baselineAttack * (1 + sparksGained * SPARK_BONUS_PER_POINT);
  console.log(
    `  转生前基准攻击力=${baselineAttack.toFixed(2)}, 转生后新英雄攻击力=${heroAfterPrestige.stats.currentAttack.toFixed(2)} (期望 ${expectedAttack.toFixed(2)})`,
  );
  if (Math.abs(heroAfterPrestige.stats.currentAttack - expectedAttack) > 0.001) {
    throw new Error(
      `Expected a freshly-instantiated hero's attack to carry the full (1 + Sparks * ${SPARK_BONUS_PER_POINT}) global multiplier: got ${heroAfterPrestige.stats.currentAttack}, expected ${expectedAttack}.`,
    );
  }

  // Reset so this doesn't secretly buff the choke-point simulation below.
  clearInMemorySnapshotForTesting();
  saveMeta();
}
console.log('[PASS] 转生系统边界测试通过：星火结算公式为正，转生后波次/金币/英雄等级正确归零，且全局伤害乘区对新英雄同样生效。\n');

// --- Boundary test 13: Shielded affix (step 28) ---------------------------
//
// A hand-constructed enemy carrying only the Shielded affix (bypassing
// EnemyFactory's random roll entirely, for a deterministic assertion) -
// asserts the spawn-time shield value matches SHIELDED_SHIELD_RATIO of
// maxHp exactly, then that two successive takeAttackDamage calls deplete
// the shield before touching currentHp at all, with only the overflow
// once the shield's actually exhausted landing on HP.
console.log('=== 边界测试 13：Shielded 词缀 - 护盾优先扣除 ===');
{
  const enemy = new BattleEnemy({
    instanceId: 'shield-test-enemy',
    archetypeId: 'goblin',
    maxHp: 100,
    defense: 0,
    speed: 1,
    goldReward: 0,
    expReward: 0,
    baseDamage: 0,
    attackDamage: 0,
    attackRange: 0,
    attackSpeed: 1,
    affixes: [AffixId.Shielded],
  });

  // Read through this indirection rather than `enemy.shieldHp`/`enemy.
  // currentHp` directly - TypeScript's control-flow narrowing otherwise
  // treats repeated reads of the same property as one "aliased condition"
  // and keeps pinning it to whatever literal an earlier `!==` check
  // excluded, straight through the takeAttackDamage() calls in between
  // that are exactly what change them (same pitfall this file's other
  // tests already work around).
  function shield(e: BattleEnemy): number {
    return e.shieldHp;
  }
  function hp(e: BattleEnemy): number {
    return e.currentHp;
  }

  const expectedInitialShield = 100 * SHIELDED_SHIELD_RATIO;
  console.log(`  初始状态: 护盾=${shield(enemy)} (期望 ${expectedInitialShield}), HP=${hp(enemy)}/${enemy.maxHp}`);
  if (shield(enemy) !== expectedInitialShield) {
    throw new Error(`Expected a Shielded enemy's spawn-time shield to equal maxHp * ${SHIELDED_SHIELD_RATIO}: got ${shield(enemy)}, expected ${expectedInitialShield}.`);
  }

  enemy.takeAttackDamage(30);
  console.log(`  受到 30 点伤害后: 护盾=${shield(enemy)} (期望 20), HP=${hp(enemy)} (期望 100，护盾未耗尽前不掉血)`);
  if (shield(enemy) !== 20) {
    throw new Error(`Expected the shield to absorb the full 30 damage: got shieldHp ${shield(enemy)}, expected 20.`);
  }
  if (hp(enemy) !== 100) {
    throw new Error(`Expected currentHp to be untouched while the shield still covers the hit: got ${hp(enemy)}, expected 100.`);
  }

  enemy.takeAttackDamage(30);
  console.log(`  再次受到 30 点伤害后: 护盾=${shield(enemy)} (期望 0), HP=${hp(enemy)} (期望 90，20 点护盾吸收 + 10 点溢出到血量)`);
  if (shield(enemy) !== 0) {
    throw new Error(`Expected the shield to be fully depleted: got ${shield(enemy)}, expected 0.`);
  }
  if (hp(enemy) !== 90) {
    throw new Error(`Expected the 10-point overflow (30 damage - 20 remaining shield) to land on HP: got ${hp(enemy)}, expected 90.`);
  }
}
console.log('[PASS] Shielded 词缀边界测试通过：护盾值正确初始化，且受击时严格优先于生命值被扣除。\n');

// --- Boundary test 14: Cloner affix (step 28) ------------------------------
//
// A hand-constructed Cloner-affixed enemy, added directly into a real
// GameManager's CombatEngine, zeroed to 0 HP, then ticked forward one small
// step so CombatEngine.update's cleanupRemovedEnemies actually processes
// the death - asserts GameManager's own live enemy list (combatEngine.
// getAliveEnemies()) gains exactly two clones, each at exactly half the
// original's maxHp and spawned at full (halved) HP, with Cloner itself
// stripped off so neither clone can split again.
console.log('=== 边界测试 14：Cloner 词缀 - 死亡分裂为两个减半克隆体 ===');
{
  const gm = new GameManager(sampleLevelConfig, {}, { maxBaseHp: 100 });
  const originalMaxHp = 200;

  const clonerEnemy = new BattleEnemy({
    instanceId: 'cloner-test-enemy',
    archetypeId: 'orc',
    maxHp: originalMaxHp,
    defense: 0,
    speed: 1,
    goldReward: 20,
    expReward: 5,
    baseDamage: 0,
    attackDamage: 0,
    attackRange: 0,
    attackSpeed: 1,
    affixes: [AffixId.Cloner],
  });
  gm.combatEngine.addEnemy(clonerEnemy);
  clonerEnemy.currentHp = 0;

  gm.combatEngine.update(0.01);

  const aliveAfterSplit = gm.combatEngine.getAliveEnemies();
  console.log(`  分裂后存活敌人数=${aliveAfterSplit.length} (期望 2)`);
  if (aliveAfterSplit.length !== 2) {
    throw new Error(`Expected exactly 2 clones to register into CombatEngine after the Cloner enemy died: got ${aliveAfterSplit.length}.`);
  }

  for (const clone of aliveAfterSplit) {
    console.log(`    克隆体 ${clone.instanceId}: maxHp=${clone.maxHp} (期望 ${originalMaxHp / 2}), HP=${clone.currentHp}, 携带 Cloner=${clone.hasAffix(AffixId.Cloner)}`);
    if (clone.maxHp !== originalMaxHp / 2) {
      throw new Error(`Expected each clone's maxHp to be exactly half the original's: got ${clone.maxHp}, expected ${originalMaxHp / 2}.`);
    }
    if (clone.currentHp !== clone.maxHp) {
      throw new Error(`Expected a freshly-spawned clone to be at full (halved) HP: got ${clone.currentHp}/${clone.maxHp}.`);
    }
    if (clone.hasAffix(AffixId.Cloner)) {
      throw new Error(`Expected Cloner to be stripped from a clone's own affix list (no infinite splitting): clone ${clone.instanceId} still has it.`);
    }
  }
}
console.log('[PASS] Cloner 词缀边界测试通过：死亡后正确注册了两个减半克隆体，且克隆体自身不再携带 Cloner。\n');

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
