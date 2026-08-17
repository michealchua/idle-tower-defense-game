import { useState } from 'react';
import { heroRosterConfig, type HeroEvolutionBranch } from '../data/heroRosterConfig';
import { petRosterConfig, type PetDefinition } from '../data/petRosterConfig';
import { skillDefinitions, type SkillDefinition } from '../data/skillConfig';
import type { GachaRarity } from '../data/gachaConfig';
import type { HeroClass, UpgradeableStat } from '../data/heroConfig';
import { enemyArchetypes, type EnemyArchetypeId } from '../data/enemyArchetypes';
import { enemyLoreConfig } from '../data/enemyLoreConfig';
import { MAX_STAR_LEVEL } from '../data/gachaConfig';
import { getConditionStatuses } from '../engine/systems/UnlockSystem';
import { getAvailableEvolutionBranches } from '../engine/systems/HeroSystem';
import { formatUnlockCondition } from './formatUnlockCondition';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';
import SpriteAvatar from './SpriteAvatar';
import { getPetSpriteSrc, getEnemySpriteSrc } from '../render/assetLoader';
import { ENEMY_SPRITE_TYPE } from '../render/CanvasRenderer';
import { IconStar } from './icons';
import { getSkillIcon } from './SkillIcon';

const ENEMY_ARCHETYPE_IDS = Object.keys(enemyArchetypes) as EnemyArchetypeId[];
// Single-protagonist redesign: the old 'hero' tab (100-entry roster, locked
// vs owned) doesn't apply anymore - there's exactly one hero, always owned.
// 'evolution' (the branch tree) and 'skill' (the gacha-drawn skill pool)
// replace it as the two collection concepts that now actually vary per run.
type CodexTab = 'evolution' | 'skill' | 'pet' | 'enemy';

const CLASS_LABEL_KEYS: Record<HeroClass, string> = {
  warrior: 'class.warrior',
  mage: 'class.mage',
  paladin: 'class.paladin',
  summoner: 'class.summoner',
  archer: 'class.archer',
  assassin: 'class.assassin',
  priest: 'class.priest',
  special: 'class.special',
};

const RARITY_LABEL_KEYS: Record<GachaRarity, string> = {
  white: 'rarity.white',
  green: 'rarity.green',
  blue: 'rarity.blue',
  purple: 'rarity.purple',
  gold: 'rarity.gold',
  red: 'rarity.red',
  rainbow: 'rarity.rainbow',
};

const RARITY_CLASS: Record<GachaRarity, string> = {
  white: 'rarity-white',
  green: 'rarity-green',
  blue: 'rarity-blue',
  purple: 'rarity-purple',
  gold: 'rarity-gold',
  red: 'rarity-red',
  rainbow: 'rarity-rainbow',
};

const RARITY_BORDER_CLASS: Record<GachaRarity, string> = {
  white: 'border-rarity-white',
  green: 'border-rarity-green',
  blue: 'border-rarity-blue',
  purple: 'border-rarity-purple',
  gold: 'border-rarity-gold',
  red: 'border-rarity-red',
  rainbow: 'border-rarity-rainbow',
};

const STAT_LABEL_KEYS: Record<UpgradeableStat, string> = {
  attackDamage: 'hero.attackDamage',
  attackSpeed: 'hero.attackSpeed',
  maxHp: 'hero.maxHp',
  criticalChance: 'hero.criticalChance',
};

function formatBonusValue(stat: UpgradeableStat, value: number): string {
  if (stat === 'criticalChance') {
    return `+${Math.round(value * 100)}%`;
  }
  if (stat === 'attackSpeed') {
    return `+${value.toFixed(2)}`;
  }
  return `+${value}`;
}

// Roster ids are `<rarity>-<n>` - used as the fallback label for anything
// not yet unlocked (no HeroState instance exists to have a real name).
function rarityNumberLabel(rarity: GachaRarity, id: string): string {
  return `${t(RARITY_LABEL_KEYS[rarity])}${id.split('-')[1]}`;
}

function CodexPanel() {
  const heroes = useGameStore((state) => state.heroes);
  const unlockedHeroIds = useGameStore((state) => state.unlockedHeroIds);
  const unlockedPetIds = useGameStore((state) => state.unlockedPetIds);
  const petStars = useGameStore((state) => state.petStars);
  const goldSpentTotal = useGameStore((state) => state.goldSpentTotal);
  const ascensionLevel = useGameStore((state) => state.ascensionLevel);
  const unlockPetByCondition = useGameStore((state) => state.unlockPetByCondition);
  const [activeTab, setActiveTab] = useState<CodexTab>('evolution');
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [selectedEnemyId, setSelectedEnemyId] = useState<EnemyArchetypeId | null>(null);

  const conditionState = { unlockedHeroIds, unlockedPetIds, heroes, goldSpentTotal, ascensionLevel };

  function switchTab(tab: CodexTab): void {
    setActiveTab(tab);
  }

  // --- Evolution tab -----------------------------------------------------
  // Protagonist's whole branch tree (heroRosterConfig[0].evolutionBranches,
  // see HeroSystem's doc comments) - single-protagonist redesign replaced
  // "which of 100 heroes have you pulled" with "how far down the one hero's
  // tree have you gotten", so this tab shows every node's tier/chosen/
  // reachable-next/still-locked status instead of a locked/owned roster.

  const protagonist = heroes[0];
  const evolutionBranches = heroRosterConfig[0]?.evolutionBranches ?? [];
  const reachableBranchIds = protagonist ? new Set(getAvailableEvolutionBranches(protagonist).map((branch) => branch.id)) : new Set<string>();
  const effectiveBranchId =
    selectedBranchId && evolutionBranches.some((branch) => branch.id === selectedBranchId) ? selectedBranchId : evolutionBranches[0]?.id ?? null;
  const selectedBranch = evolutionBranches.find((branch) => branch.id === effectiveBranchId);

  function branchStatus(branch: HeroEvolutionBranch): 'chosen' | 'reachable' | 'locked' {
    if (protagonist?.evolutionPath.includes(branch.id)) {
      return 'chosen';
    }
    return reachableBranchIds.has(branch.id) ? 'reachable' : 'locked';
  }

  function renderBranchGridItem(branch: HeroEvolutionBranch) {
    const status = branchStatus(branch);
    const isSelected = branch.id === effectiveBranchId;

    return (
      <button
        key={branch.id}
        type="button"
        className={`roster-grid-item selectable${isSelected ? ' active' : ''}${status === 'locked' ? ' locked' : ''}`}
        onClick={() => setSelectedBranchId(branch.id)}
      >
        <IconStar />
        <div className="roster-grid-item-name">{t(branch.nameKey)}</div>
        <div className="roster-grid-item-sub">
          {t('codex.evolutionTier')} {branch.tier} ·{' '}
          {status === 'chosen' ? t('codex.obtained') : status === 'reachable' ? `Lv.${branch.unlockLevel}` : t('heroRoster.locked')}
        </div>
      </button>
    );
  }

  function renderBranchDetail(branch: HeroEvolutionBranch) {
    const status = branchStatus(branch);
    return (
      <div className={`detail-card${status === 'locked' ? ' locked' : ''}`}>
        <div className="detail-title">{t(branch.nameKey)}</div>
        <div className="item-detail">
          {t('codex.evolutionTier')} {branch.tier} · {t(CLASS_LABEL_KEYS[branch.resultClass])} · Lv.{branch.unlockLevel}
        </div>
        <div className="item-detail">
          {t('hero.attackDamage')} ×{branch.statMultiplier.attackDamage} · {t('hero.maxHp')} ×{branch.statMultiplier.maxHp}
        </div>
        <div className="item-detail">
          {t('hero.attackSpeed')} ×{branch.statMultiplier.attackSpeed} · {t('hero.criticalChance')} ×{branch.statMultiplier.criticalChance}
        </div>
        <div className="item-detail">
          {t('codex.evolutionSkillReward')}: {t(skillDefinitions[branch.skillUnlock.skillId]?.nameKey ?? '')}
        </div>
        <div className="item-detail">
          {status === 'chosen' ? t('codex.obtained') : status === 'reachable' ? t('hero.evolveButton') : t('heroRoster.locked')}
        </div>
      </div>
    );
  }

  // --- Skill tab -----------------------------------------------------
  // Every skillConfig.ts entry - owned (hero.ownedSkillIds) vs not yet
  // pulled from the skill gacha (GachaSystem.pullSkill/pullSkillPremium).

  const skillIds = Object.keys(skillDefinitions);
  const ownedSkillIds = new Set(protagonist?.ownedSkillIds ?? []);
  const effectiveSkillId = selectedSkillId && skillDefinitions[selectedSkillId] ? selectedSkillId : skillIds[0] ?? null;
  const selectedSkill = effectiveSkillId ? skillDefinitions[effectiveSkillId] : undefined;

  function renderSkillGridItem(definition: SkillDefinition) {
    const isOwned = ownedSkillIds.has(definition.id);
    const isSelected = definition.id === effectiveSkillId;
    const SkillIcon = getSkillIcon(definition.id);

    return (
      <button
        key={definition.id}
        type="button"
        className={`roster-grid-item selectable ${RARITY_BORDER_CLASS[definition.rarity]}${isSelected ? ' active' : ''}${isOwned ? '' : ' locked'}`}
        onClick={() => setSelectedSkillId(definition.id)}
      >
        <span style={{ color: definition.color, fontSize: 24 }}>
          <SkillIcon />
        </span>
        <div className={`roster-grid-item-name ${RARITY_CLASS[definition.rarity]}`}>{t(definition.nameKey)}</div>
        <div className="roster-grid-item-sub">{isOwned ? t('codex.obtained') : t('petRoster.locked')}</div>
      </button>
    );
  }

  function renderSkillDetail(definition: SkillDefinition) {
    const isOwned = ownedSkillIds.has(definition.id);
    const SkillIcon = getSkillIcon(definition.id);
    return (
      <div className={`detail-card ${RARITY_BORDER_CLASS[definition.rarity]}${isOwned ? '' : ' locked'}`}>
        <div className={`detail-title ${RARITY_CLASS[definition.rarity]}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: definition.color }}>
            <SkillIcon />
          </span>
          {t(definition.nameKey)}
        </div>
        <div className="item-detail">
          {t(RARITY_LABEL_KEYS[definition.rarity])} · {isOwned ? t('codex.obtained') : t('codex.gachaSource')}
        </div>
        <div className="item-detail">
          {t('codex.skillCooldown')} {definition.cooldownSeconds}s · {t('codex.skillRange')} {definition.range}
        </div>
      </div>
    );
  }

  // --- Pet tab ---------------------------------------------------------

  const effectivePetId = selectedPetId && petRosterConfig.some((d) => d.id === selectedPetId) ? selectedPetId : petRosterConfig[0]?.id ?? null;
  const selectedPetDefinition = petRosterConfig.find((d) => d.id === effectivePetId);

  function petBonusLabel(definition: PetDefinition): string {
    return Object.entries(definition.passiveBonus)
      .map(([stat, value]) => `${t(STAT_LABEL_KEYS[stat as UpgradeableStat])} ${formatBonusValue(stat as UpgradeableStat, value ?? 0)}`)
      .join(', ');
  }

  function renderPetGridItem(definition: PetDefinition) {
    const isUnlocked = unlockedPetIds.includes(definition.id);
    const isSelected = definition.id === effectivePetId;

    return (
      <button
        key={definition.id}
        type="button"
        className={`roster-grid-item selectable ${RARITY_BORDER_CLASS[definition.rarity]}${isSelected ? ' active' : ''}${isUnlocked ? '' : ' locked'}`}
        onClick={() => setSelectedPetId(definition.id)}
      >
        <SpriteAvatar src={getPetSpriteSrc(definition.spriteId ?? definition.id)} size={56} />
        <div className={`roster-grid-item-name ${RARITY_CLASS[definition.rarity]}`}>{rarityNumberLabel(definition.rarity, definition.id)}</div>
        <div className="roster-grid-item-sub">{isUnlocked ? `★${petStars[definition.id] ?? 0}/${MAX_STAR_LEVEL}` : t('petRoster.locked')}</div>
      </button>
    );
  }

  function renderPetDetail(definition: PetDefinition) {
    const isUnlocked = unlockedPetIds.includes(definition.id);
    const rarityLabel = t(RARITY_LABEL_KEYS[definition.rarity]);
    const bonusLabel = petBonusLabel(definition);

    if (isUnlocked) {
      return (
        <div className={`detail-card ${RARITY_BORDER_CLASS[definition.rarity]}`}>
          <div className={`detail-title ${RARITY_CLASS[definition.rarity]}`}>{rarityNumberLabel(definition.rarity, definition.id)}</div>
          <div className="item-detail">
            {rarityLabel} · {t('codex.obtained')}
          </div>
          <div className="item-detail">★{petStars[definition.id] ?? 0}/{MAX_STAR_LEVEL}</div>
          <div className="item-detail">
            {t('petRoster.passiveBonus')}: {bonusLabel}
          </div>
        </div>
      );
    }

    if (definition.unlockConditions) {
      const statuses = getConditionStatuses(conditionState, definition.unlockConditions);
      const allMet = statuses.every((status) => status.isMet);

      return (
        <div className={`detail-card locked ${RARITY_BORDER_CLASS[definition.rarity]}`}>
          <div className={`detail-title ${RARITY_CLASS[definition.rarity]}`}>{rarityNumberLabel(definition.rarity, definition.id)}</div>
          <div className="item-detail">{t('unlock.conditionLocked')}</div>
          <div className="item-detail">
            {t('petRoster.passiveBonus')}: {bonusLabel}
          </div>
          {statuses.map((status, index) => (
            <div key={index} className={status.isMet ? 'text-faint' : 'text-muted'}>
              {status.isMet ? '✓' : '✗'} {formatUnlockCondition(status.condition)}
            </div>
          ))}
          <div className="item-actions">
            <button className="btn btn-sm" disabled={!allMet} onClick={() => unlockPetByCondition(definition.id)}>
              {t('unlock.unlockButton')}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={`detail-card locked ${RARITY_BORDER_CLASS[definition.rarity]}`}>
        <div className={`detail-title ${RARITY_CLASS[definition.rarity]}`}>{rarityNumberLabel(definition.rarity, definition.id)}</div>
        <div className="item-detail">{t('petRoster.locked')}</div>
        <div className="item-detail">
          {t('petRoster.passiveBonus')}: {bonusLabel} · {t('codex.gachaSource')}
        </div>
      </div>
    );
  }

  // --- Enemy tab ---------------------------------------------------------
  // Always visible, no lock state - this game has no "have you fought this
  // archetype yet" tracking (out of scope to add just for the codex), so
  // every enemy's lore is readable from the start.

  const effectiveEnemyId = selectedEnemyId && ENEMY_ARCHETYPE_IDS.includes(selectedEnemyId) ? selectedEnemyId : ENEMY_ARCHETYPE_IDS[0];
  const selectedEnemyLore = enemyLoreConfig[effectiveEnemyId];

  function renderEnemyGridItem(archetypeId: EnemyArchetypeId) {
    const lore = enemyLoreConfig[archetypeId];
    const isSelected = archetypeId === effectiveEnemyId;
    return (
      <button
        key={archetypeId}
        type="button"
        className={`roster-grid-item selectable${isSelected ? ' active' : ''}`}
        onClick={() => setSelectedEnemyId(archetypeId)}
      >
        <SpriteAvatar src={getEnemySpriteSrc(ENEMY_SPRITE_TYPE[archetypeId])} size={56} />
        <div className="roster-grid-item-name">{t(lore.nameKey)}</div>
      </button>
    );
  }

  const chosenBranchCount = protagonist?.evolutionPath.length ?? 0;
  const ownedSkillCount = ownedSkillIds.size;

  const TABS: { id: CodexTab; labelKey: string; count?: string }[] = [
    { id: 'evolution', labelKey: 'codex.evolutionSection', count: `${chosenBranchCount}/${evolutionBranches.length}` },
    { id: 'skill', labelKey: 'codex.skillSection', count: `${ownedSkillCount}/${skillIds.length}` },
    { id: 'pet', labelKey: 'codex.petSection', count: `${unlockedPetIds.length}/${petRosterConfig.length}` },
    { id: 'enemy', labelKey: 'codex.enemySection' },
  ];

  return (
    <div>
      <div className="filter-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`btn btn-sm${activeTab === tab.id ? ' btn-primary' : ''}`}
            onClick={() => switchTab(tab.id)}
          >
            {t(tab.labelKey)}
            {tab.count && ` (${tab.count})`}
          </button>
        ))}
      </div>
      <div className="card">
        {activeTab === 'evolution' && (
          <div className="roster-grid-detail">
            <div className="roster-grid">{evolutionBranches.map(renderBranchGridItem)}</div>
            <div className="detail-pane">{selectedBranch && renderBranchDetail(selectedBranch)}</div>
          </div>
        )}
        {activeTab === 'skill' && (
          <div className="roster-grid-detail">
            <div className="roster-grid">{Object.values(skillDefinitions).map(renderSkillGridItem)}</div>
            <div className="detail-pane">{selectedSkill && renderSkillDetail(selectedSkill)}</div>
          </div>
        )}
        {activeTab === 'pet' && (
          <div className="roster-grid-detail">
            <div className="roster-grid">{petRosterConfig.map(renderPetGridItem)}</div>
            <div className="detail-pane">{selectedPetDefinition && renderPetDetail(selectedPetDefinition)}</div>
          </div>
        )}
        {activeTab === 'enemy' && (
          <div className="roster-grid-detail">
            <div className="roster-grid">{ENEMY_ARCHETYPE_IDS.map(renderEnemyGridItem)}</div>
            <div className="detail-pane">
              {selectedEnemyLore && (
                <div className="detail-card">
                  <div className="detail-title">{t(selectedEnemyLore.nameKey)}</div>
                  <div className="item-detail">{t(selectedEnemyLore.descriptionKey)}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CodexPanel;
