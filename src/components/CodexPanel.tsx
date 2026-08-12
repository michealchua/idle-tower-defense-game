import { useState } from 'react';
import { heroRosterConfig } from '../data/heroRosterConfig';
import { petRosterConfig, type PetDefinition } from '../data/petRosterConfig';
import type { HeroDefinition } from '../data/heroRosterConfig';
import type { GachaRarity } from '../data/gachaConfig';
import type { UpgradeableStat } from '../data/heroConfig';
import { enemyArchetypes, type EnemyArchetypeId } from '../data/enemyArchetypes';
import { enemyLoreConfig } from '../data/enemyLoreConfig';
import { getConditionStatuses } from '../engine/systems/UnlockSystem';
import { formatUnlockCondition } from './formatUnlockCondition';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';

const ENEMY_ARCHETYPE_IDS = Object.keys(enemyArchetypes) as EnemyArchetypeId[];
type CodexTab = 'hero' | 'pet' | 'enemy';

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

function CodexPanel() {
  const heroes = useGameStore((state) => state.heroes);
  const unlockedHeroIds = useGameStore((state) => state.unlockedHeroIds);
  const unlockedPetIds = useGameStore((state) => state.unlockedPetIds);
  const goldSpentTotal = useGameStore((state) => state.goldSpentTotal);
  const ascensionLevel = useGameStore((state) => state.ascensionLevel);
  const unlockHeroByCondition = useGameStore((state) => state.unlockHeroByCondition);
  const unlockPetByCondition = useGameStore((state) => state.unlockPetByCondition);
  const [activeTab, setActiveTab] = useState<CodexTab>('hero');

  const conditionState = { unlockedHeroIds, unlockedPetIds, heroes, goldSpentTotal, ascensionLevel };

  function renderHeroEntry(definition: HeroDefinition) {
    const isUnlocked = unlockedHeroIds.includes(definition.id);
    const rarityLabel = t(RARITY_LABEL_KEYS[definition.rarity]);

    if (isUnlocked) {
      return (
        <div key={definition.id} className={`item-card ${RARITY_BORDER_CLASS[definition.rarity]}`}>
          <span className={RARITY_CLASS[definition.rarity]}>
            {rarityLabel}
            {definition.id.split('-')[1]}
          </span>
          <span className="text-muted"> ({t('codex.obtained')})</span>
        </div>
      );
    }

    if (definition.unlockConditions) {
      const statuses = getConditionStatuses(conditionState, definition.unlockConditions);
      const allMet = statuses.every((status) => status.isMet);

      return (
        <div key={definition.id} className={`item-card locked ${RARITY_BORDER_CLASS[definition.rarity]}`}>
          <span className={RARITY_CLASS[definition.rarity]}>
            {rarityLabel}
            {definition.id.split('-')[1]}
          </span>
          <span className="text-muted"> ({t('unlock.conditionLocked')})</span>
          {statuses.map((status, index) => (
            <div key={index} className={status.isMet ? 'text-faint' : 'text-muted'}>
              {status.isMet ? '✓' : '✗'} {formatUnlockCondition(status.condition)}
            </div>
          ))}
          <div className="item-actions">
            <button className="btn btn-sm" disabled={!allMet} onClick={() => unlockHeroByCondition(definition.id)}>
              {t('unlock.unlockButton')}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div key={definition.id} className={`item-card locked ${RARITY_BORDER_CLASS[definition.rarity]}`}>
        <span className={RARITY_CLASS[definition.rarity]}>
          {rarityLabel}
          {definition.id.split('-')[1]}
        </span>
        <span className="text-muted"> ({t('heroRoster.locked')})</span>
        <div className="item-detail">{t('codex.gachaSource')}</div>
      </div>
    );
  }

  function renderPetEntry(definition: PetDefinition) {
    const isUnlocked = unlockedPetIds.includes(definition.id);
    const rarityLabel = t(RARITY_LABEL_KEYS[definition.rarity]);
    const bonusLabel = Object.entries(definition.passiveBonus)
      .map(([stat, value]) => `${t(STAT_LABEL_KEYS[stat as UpgradeableStat])} ${formatBonusValue(stat as UpgradeableStat, value ?? 0)}`)
      .join(', ');

    if (isUnlocked) {
      return (
        <div key={definition.id} className={`item-card ${RARITY_BORDER_CLASS[definition.rarity]}`}>
          <span className={RARITY_CLASS[definition.rarity]}>
            {rarityLabel}
            {definition.id.split('-')[1]}
          </span>
          <span className="text-muted"> ({t('codex.obtained')})</span>
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
        <div key={definition.id} className={`item-card locked ${RARITY_BORDER_CLASS[definition.rarity]}`}>
          <span className={RARITY_CLASS[definition.rarity]}>
            {rarityLabel}
            {definition.id.split('-')[1]}
          </span>
          <span className="text-muted"> ({t('unlock.conditionLocked')})</span>
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
      <div key={definition.id} className={`item-card locked ${RARITY_BORDER_CLASS[definition.rarity]}`}>
        <span className={RARITY_CLASS[definition.rarity]}>
          {rarityLabel}
          {definition.id.split('-')[1]}
        </span>
        <span className="text-muted"> ({t('petRoster.locked')})</span>
        <div className="item-detail">
          {t('petRoster.passiveBonus')}: {bonusLabel} · {t('codex.gachaSource')}
        </div>
      </div>
    );
  }

  // Always visible, no lock state - this game has no "have you fought this
  // archetype yet" tracking (out of scope to add just for the codex), so
  // every enemy's lore is readable from the start rather than half the tab
  // sitting permanently locked with nothing to unlock it.
  function renderEnemyEntry(archetypeId: EnemyArchetypeId) {
    const lore = enemyLoreConfig[archetypeId];
    return (
      <div key={archetypeId} className="item-card">
        <span>{t(lore.nameKey)}</span>
        <div className="item-detail">{t(lore.descriptionKey)}</div>
      </div>
    );
  }

  const TABS: { id: CodexTab; labelKey: string; count?: string }[] = [
    { id: 'hero', labelKey: 'codex.heroSection', count: `${unlockedHeroIds.length}/${heroRosterConfig.length}` },
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
            onClick={() => setActiveTab(tab.id)}
          >
            {t(tab.labelKey)}
            {tab.count && ` (${tab.count})`}
          </button>
        ))}
      </div>
      <div className="card">
        {activeTab === 'hero' && <div className="list">{heroRosterConfig.map(renderHeroEntry)}</div>}
        {activeTab === 'pet' && <div className="list">{petRosterConfig.map(renderPetEntry)}</div>}
        {activeTab === 'enemy' && <div className="list">{ENEMY_ARCHETYPE_IDS.map(renderEnemyEntry)}</div>}
      </div>
    </div>
  );
}

export default CodexPanel;
