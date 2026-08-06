import { heroRosterConfig } from '../data/heroRosterConfig';
import { petRosterConfig, type PetDefinition } from '../data/petRosterConfig';
import type { HeroDefinition } from '../data/heroRosterConfig';
import type { GachaRarity } from '../data/gachaConfig';
import type { UpgradeableStat } from '../data/heroConfig';
import { getConditionStatuses } from '../engine/systems/UnlockSystem';
import { formatUnlockCondition } from './formatUnlockCondition';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';

const RARITY_LABEL_KEYS: Record<GachaRarity, string> = {
  white: 'rarity.white',
  green: 'rarity.green',
  blue: 'rarity.blue',
  purple: 'rarity.purple',
  gold: 'rarity.gold',
};

const RARITY_CLASS: Record<GachaRarity, string> = {
  white: 'rarity-white',
  green: 'rarity-green',
  blue: 'rarity-blue',
  purple: 'rarity-purple',
  gold: 'rarity-gold',
};

const RARITY_BORDER_CLASS: Record<GachaRarity, string> = {
  white: 'border-rarity-white',
  green: 'border-rarity-green',
  blue: 'border-rarity-blue',
  purple: 'border-rarity-purple',
  gold: 'border-rarity-gold',
};

const STAT_LABEL_KEYS: Record<UpgradeableStat, string> = {
  attackDamage: 'hero.attackDamage',
  attackSpeed: 'hero.attackSpeed',
  maxHp: 'hero.maxHp',
  criticalChance: 'hero.criticalChance',
  attackRange: 'hero.attackRange',
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
  const globalUpgrades = useGameStore((state) => state.globalUpgrades);
  const goldSpentTotal = useGameStore((state) => state.goldSpentTotal);
  const ascensionLevel = useGameStore((state) => state.ascensionLevel);
  const unlockHeroByCondition = useGameStore((state) => state.unlockHeroByCondition);
  const unlockPetByCondition = useGameStore((state) => state.unlockPetByCondition);

  const conditionState = { unlockedHeroIds, unlockedPetIds, heroes, globalUpgrades, goldSpentTotal, ascensionLevel };

  function renderHeroEntry(definition: HeroDefinition) {
    const isUnlocked = unlockedHeroIds.includes(definition.id);
    const rarityLabel = t(RARITY_LABEL_KEYS[definition.rarity]);

    if (isUnlocked) {
      return (
        <div key={definition.id} className={`item-card ${RARITY_BORDER_CLASS[definition.rarity]}`}>
          <span className={RARITY_CLASS[definition.rarity]}>
            {rarityLabel}·{definition.id}
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
            {rarityLabel}·{definition.id}
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
          {rarityLabel}·{definition.id}
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
            {rarityLabel}·{definition.id}
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
            {rarityLabel}·{definition.id}
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
          {rarityLabel}·{definition.id}
        </span>
        <span className="text-muted"> ({t('petRoster.locked')})</span>
        <div className="item-detail">
          {t('petRoster.passiveBonus')}: {bonusLabel} · {t('codex.gachaSource')}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <div className="card-title">
          {t('codex.heroSection')} ({unlockedHeroIds.length}/{heroRosterConfig.length})
        </div>
        <div className="list">{heroRosterConfig.map(renderHeroEntry)}</div>
      </div>
      <div className="card">
        <div className="card-title">
          {t('codex.petSection')} ({unlockedPetIds.length}/{petRosterConfig.length})
        </div>
        <div className="list">{petRosterConfig.map(renderPetEntry)}</div>
      </div>
    </div>
  );
}

export default CodexPanel;
