// Step 23/24's out-of-run talent tree - spends Memory Fragments (see
// MetaProgression.ts, backed by SaveManager.ts) on permanent, run-
// independent bonuses. "落子无悔" (once placed, no regrets) is a hard
// design constraint, not just a UI warning: this file deliberately carries
// NO reset/respec method of any kind, on the class or otherwise - a talent
// level can only ever go up, one point at a time, through upgradeTalent.
// If a future change ever needs to add one, that's a deliberate design
// reversal that should be re-examined against this comment, not a quiet
// addition alongside it.
import type { StatModifiers } from './Equipment';
import { getTalentLevel, setTalentLevel, spendMemoryFragments, save as saveMeta } from './SaveManager';

/** One node's prerequisite: `nodeId` must already be at level >= `requiredLevel` (not just "unlocked") before the dependent node can be leveled at all. */
export interface TalentDependency {
  nodeId: string;
  requiredLevel: number;
}

export interface TalentNode {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  /** Memory Fragment cost to go from `currentLevel` to `currentLevel + 1` - dynamically increasing per level (the spec's "按等级动态递增的碎片消耗公式"), not a flat per-level fee. Called with the node's *current* level (0-based: level 0 -> 1's cost is costFormula(0)). */
  costFormula: (currentLevel: number) => number;
  /** Every dependency must be satisfied (see TalentDependency) before this node can be leveled at all - empty for a root node with no prerequisites. */
  dependencies: TalentDependency[];
  /** Bonus granted per level - interpretation depends on the node (see TalentManager's getStatBonusPercent/getEnvironmentalDamageReduction/getLootChanceBonus, one of which each node id feeds). */
  bonusPerLevel: number;
}

/** Geometric cost curve shared by every node below - level 0->1 costs `base`, and each further level costs `growthRate` times more than the last. Kept as a named helper (not inlined per node) so every node's cost formula is provably built from the same shape, just different tuning constants. */
function geometricCost(base: number, growthRate: number): (currentLevel: number) => number {
  return (currentLevel: number) => Math.round(base * growthRate ** currentLevel);
}

export const talentNodes: TalentNode[] = [
  {
    id: 'vitality',
    name: '活力',
    description: '全局提升所有英雄的基础生命值，每级 +2%。落子无悔，一旦投入无法撤回。',
    maxLevel: 10,
    costFormula: geometricCost(20, 1.3),
    dependencies: [],
    bonusPerLevel: 0.02,
  },
  {
    id: 'environmentalAdaptation',
    name: '环境适应',
    description: '按百分比削弱环境负面效果对英雄造成的伤害（如火山灼烧），每级 -8%。需要活力达到 3 级。',
    maxLevel: 5,
    costFormula: geometricCost(30, 1.35),
    dependencies: [{ nodeId: 'vitality', requiredLevel: 3 }],
    bonusPerLevel: 0.08,
  },
  {
    id: 'lootLuck',
    name: '战利品幸运',
    description: '提升击败精英/首领敌人时装备掉落的概率，每级 +3%。需要活力达到 3 级。',
    maxLevel: 5,
    costFormula: geometricCost(40, 1.35),
    dependencies: [{ nodeId: 'vitality', requiredLevel: 3 }],
    bonusPerLevel: 0.03,
  },
];

const talentNodesById = new Map(talentNodes.map((node) => [node.id, node]));

export type UpgradeTalentResult =
  | { success: true; nodeId: string; newLevel: number; fragmentsSpent: number }
  | { success: false; reason: 'unknown_node' | 'max_level' | 'dependencies_not_met' | 'insufficient_fragments' };

/**
 * Reads talent levels straight from SaveManager's in-memory snapshot on
 * every call (no cache of its own) - levels change rarely (only via
 * upgradeTalent) and this keeps every getter trivially correct even if
 * SaveManager.load() re-syncs from storage out from under it. Exported as
 * the single `talentManager` singleton below, not a class callers
 * instantiate themselves - talent progress is inherently global/shared
 * state, same reasoning audioManager (the old src/audio system) is a
 * singleton rather than a per-battle instance.
 */
class TalentManager {
  getNode(nodeId: string): TalentNode | undefined {
    return talentNodesById.get(nodeId);
  }

  getAllNodes(): readonly TalentNode[] {
    return talentNodes;
  }

  getLevel(nodeId: string): number {
    return getTalentLevel(nodeId);
  }

  /** Memory Fragment cost of this node's *next* level-up - what the talent UI's confirmation dialog quotes before the player commits (step 24's "明确提示将要消耗的记忆碎片数量"). Returns 0 for an unknown or already-maxed node (nothing to quote), rather than throwing - callers that care should check canUpgrade first. */
  getNextLevelCost(nodeId: string): number {
    const node = this.getNode(nodeId);
    if (!node) {
      return 0;
    }
    const currentLevel = this.getLevel(nodeId);
    if (currentLevel >= node.maxLevel) {
      return 0;
    }
    return node.costFormula(currentLevel);
  }

  private dependenciesMet(node: TalentNode): boolean {
    return node.dependencies.every((dependency) => this.getLevel(dependency.nodeId) >= dependency.requiredLevel);
  }

  canUpgrade(nodeId: string): boolean {
    const node = this.getNode(nodeId);
    if (!node) {
      return false;
    }
    return this.getLevel(nodeId) < node.maxLevel && this.dependenciesMet(node);
  }

  /**
   * Validates (in order) that the node exists, isn't already maxed, has its
   * dependencies satisfied, and only then attempts to spend
   * node.costFormula(currentLevel) Memory Fragments - same "never charge
   * for a rejected action" ordering GameManager's tryPlaceHero/
   * tryUpgradeHero/etc. already follow. On success, persists the
   * incremented level AND immediately calls SaveManager.save() - per step
   * 24's spec, every successful talent upgrade is its own save checkpoint
   * (it's irreversible the instant it happens, so it must survive a crash
   * the very next moment, not wait for some later checkpoint).
   */
  upgradeTalent(nodeId: string): UpgradeTalentResult {
    const node = this.getNode(nodeId);
    if (!node) {
      return { success: false, reason: 'unknown_node' };
    }

    const currentLevel = this.getLevel(nodeId);
    if (currentLevel >= node.maxLevel) {
      return { success: false, reason: 'max_level' };
    }
    if (!this.dependenciesMet(node)) {
      return { success: false, reason: 'dependencies_not_met' };
    }

    const cost = node.costFormula(currentLevel);
    if (!spendMemoryFragments(cost)) {
      return { success: false, reason: 'insufficient_fragments' };
    }

    const newLevel = currentLevel + 1;
    setTalentLevel(nodeId, newLevel);
    saveMeta();
    return { success: true, nodeId, newLevel, fragmentsSpent: cost };
  }

  /**
   * Percent bonus (e.g. 0.1 = +10%) Vitality contributes to one of
   * BattleHero's final stats - called from BattleHero.computeFinalStat as
   * the multiplicative layer between equipment and the active biome's own
   * modifyHeroStat hook, per step 23's "(基础属性 + 装备加成) * (1 + 天赋
   * 百分比加成)" formula. Every stat besides maxHp returns 0 (no node
   * currently governs them) rather than throwing, so BattleHero can call
   * this unconditionally for every stat key without a switch of its own.
   */
  getStatBonusPercent(statKey: keyof StatModifiers): number {
    if (statKey !== 'maxHp') {
      return 0;
    }
    const node = this.getNode('vitality');
    return node ? this.getLevel('vitality') * node.bonusPerLevel : 0;
  }

  /** Fraction (0..1, capped at 90%) environmental damage (Volcano-style burn - see BattleHero.applyBurn - and, per step 24's deeper integration, a boss's unavoidable AoE pulse damage - see CombatEngine.resolveEnemyAoePulse) is reduced by - Environmental Adaptation. */
  getEnvironmentalDamageReduction(): number {
    const node = this.getNode('environmentalAdaptation');
    if (!node) {
      return 0;
    }
    return Math.min(0.9, this.getLevel('environmentalAdaptation') * node.bonusPerLevel);
  }

  /** Additive bonus (0..1) to an elite/boss kill's loot-drop-chance roll - Loot Luck, stacked on top of (not replacing) whatever the active biome's own modifyLootChance already contributed. */
  getLootChanceBonus(): number {
    const node = this.getNode('lootLuck');
    return node ? this.getLevel('lootLuck') * node.bonusPerLevel : 0;
  }
}

export const talentManager = new TalentManager();
