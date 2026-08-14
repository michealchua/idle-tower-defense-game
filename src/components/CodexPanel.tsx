import { useState } from 'react';
import { heroRosterConfig } from '../data/heroRosterConfig';
import { petRosterConfig, type PetDefinition } from '../data/petRosterConfig';
import type { HeroDefinition } from '../data/heroRosterConfig';
import type { GachaRarity } from '../data/gachaConfig';
import type { UpgradeableStat } from '../data/heroConfig';
import { enemyArchetypes, type EnemyArchetypeId } from '../data/enemyArchetypes';
import { enemyLoreConfig } from '../data/enemyLoreConfig';
import { MAX_STAR_LEVEL } from '../data/gachaConfig';
import { getConditionStatuses } from '../engine/systems/UnlockSystem';
import { formatUnlockCondition } from './formatUnlockCondition';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';
import SpriteAvatar from './SpriteAvatar';
import { getHeroSpriteSrc, getPetSpriteSrc, getEnemySpriteSrc } from '../render/assetLoader';
import { ENEMY_SPRITE_TYPE } from '../render/CanvasRenderer';

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

// Roster ids are `<rarity>-<n>` - used as the fallback label for anything
// not yet unlocked (no HeroState instance exists to have a real name).
function rarityNumberLabel(rarity: GachaRarity, id: string): string {
  return `${t(RARITY_LABEL_KEYS[rarity])}${id.split('-')[1]}`;
}

function CodexPanel() {
  const heroes = useGameStore((state) => state.heroes);
  const unlockedHeroIds = useGameStore((state) => state.unlockedHeroIds);
  const unlockedPetIds = useGameStore((state) => state.unlockedPetIds);
  const heroStars = useGameStore((state) => state.heroStars);
  const petStars = useGameStore((state) => state.petStars);
  const goldSpentTotal = useGameStore((state) => state.goldSpentTotal);
  const ascensionLevel = useGameStore((state) => state.ascensionLevel);
  const unlockHeroByCondition = useGameStore((state) => state.unlockHeroByCondition);
  const unlockPetByCondition = useGameStore((state) => state.unlockPetByCondition);
  const [activeTab, setActiveTab] = useState<CodexTab>('hero');
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [selectedEnemyId, setSelectedEnemyId] = useState<EnemyArchetypeId | null>(null);

  const conditionState = { unlockedHeroIds, unlockedPetIds, heroes, goldSpentTotal, ascensionLevel };

  function switchTab(tab: CodexTab): void {
    setActiveTab(tab);
  }

  // --- Hero tab ------------------------------------------------------

  const effectiveHeroId = selectedHeroId && heroRosterConfig.some((d) => d.id === selectedHeroId) ? selectedHeroId : heroRosterConfig[0]?.id ?? null;
  const selectedHeroDefinition = heroRosterConfig.find((d) => d.id === effectiveHeroId);

  function renderHeroGridItem(definition: HeroDefinition) {
    const isUnlocked = unlockedHeroIds.includes(definition.id);
    const isSelected = definition.id === effectiveHeroId;

    return (
      <button
        key={definition.id}
        type="button"
        className={`roster-grid-item selectable ${RARITY_BORDER_CLASS[definition.rarity]}${isSelected ? ' active' : ''}${isUnlocked ? '' : ' locked'}`}
        onClick={() => setSelectedHeroId(definition.id)}
      >
        <SpriteAvatar src={getHeroSpriteSrc(definition.class)} size={56} />
        <div className={`roster-grid-item-name ${RARITY_CLASS[definition.rarity]}`}>{definition.name}</div>
        <div className="roster-grid-item-sub">{isUnlocked ? `★${heroStars[definition.id] ?? 0}/${MAX_STAR_LEVEL}` : t('heroRoster.locked')}</div>
      </button>
    );
  }

  function renderHeroDetail(definition: HeroDefinition) {
    const isUnlocked = unlockedHeroIds.includes(definition.id);
    const heroInstance = isUnlocked ? heroes.find((hero) => hero.id === definition.id) : undefined;
    const rarityLabel = t(RARITY_LABEL_KEYS[definition.rarity]);

    if (isUnlocked && heroInstance) {
      return (
        <div className={`detail-card ${RARITY_BORDER_CLASS[definition.rarity]}`}>
          <div className={`detail-title ${RARITY_CLASS[definition.rarity]}`}>{definition.name}</div>
          <div className="item-detail">
            {rarityLabel} · {t('codex.obtained')}
          </div>
          <div className="item-detail">
            ★{heroStars[definition.id] ?? 0}/{MAX_STAR_LEVEL} · Lv.{heroInstance.level}
          </div>
        </div>
      );
    }

    if (definition.unlockConditions) {
      const statuses = getConditionStatuses(conditionState, definition.unlockConditions);
      const allMet = statuses.every((status) => status.isMet);

      return (
        <div className={`detail-card locked ${RARITY_BORDER_CLASS[definition.rarity]}`}>
          <div className={`detail-title ${RARITY_CLASS[definition.rarity]}`}>{definition.name}</div>
          <div className="item-detail">{t('unlock.conditionLocked')}</div>
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
      <div className={`detail-card locked ${RARITY_BORDER_CLASS[definition.rarity]}`}>
        <div className={`detail-title ${RARITY_CLASS[definition.rarity]}`}>{definition.name}</div>
        <div className="item-detail">{t('heroRoster.locked')}</div>
        <div className="item-detail">{t('codex.gachaSource')}</div>
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
            onClick={() => switchTab(tab.id)}
          >
            {t(tab.labelKey)}
            {tab.count && ` (${tab.count})`}
          </button>
        ))}
      </div>
      <div className="card">
        {activeTab === 'hero' && (
          <div className="roster-grid-detail">
            <div className="roster-grid">{heroRosterConfig.map(renderHeroGridItem)}</div>
            <div className="detail-pane">{selectedHeroDefinition && renderHeroDetail(selectedHeroDefinition)}</div>
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
