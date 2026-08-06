import { useMemo, useState, type ReactNode } from 'react';
import {
  equipmentRarities,
  getEquipmentMainStatValue,
  getEquipmentStarUpCost,
  legendaryEffects,
  type EquipmentRarity,
  type EquipmentSlot,
} from '../data/equipmentConfig';
import { MAX_STAR_LEVEL } from '../data/gachaConfig';
import type { UpgradeableStat } from '../data/heroConfig';
import type { EquipmentItem } from '../engine/types';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';
import Accordion from './Accordion';

const SLOT_IDS: EquipmentSlot[] = ['weapon', 'armor', 'trinket'];
const RARITY_IDS: EquipmentRarity[] = ['white', 'green', 'blue', 'purple', 'gold', 'red', 'rainbow'];
const RARITY_RANK: Record<EquipmentRarity, number> = Object.fromEntries(
  RARITY_IDS.map((rarity, index) => [rarity, index]),
) as Record<EquipmentRarity, number>;

type SlotFilter = 'all' | EquipmentSlot;
type RarityFilter = 'all' | EquipmentRarity;
type SortMode = 'newest' | 'rarity' | 'star';

const SLOT_LABEL_KEYS: Record<EquipmentSlot, string> = {
  weapon: 'equipment.slotWeapon',
  armor: 'equipment.slotArmor',
  trinket: 'equipment.slotTrinket',
};

const RARITY_LABEL_KEYS: Record<EquipmentRarity, string> = {
  white: 'rarity.white',
  green: 'rarity.green',
  blue: 'rarity.blue',
  purple: 'rarity.purple',
  gold: 'rarity.gold',
  red: 'rarity.red',
  rainbow: 'rarity.rainbow',
};

const RARITY_CLASS: Record<EquipmentRarity, string> = {
  white: 'rarity-white',
  green: 'rarity-green',
  blue: 'rarity-blue',
  purple: 'rarity-purple',
  gold: 'rarity-gold',
  red: 'rarity-red',
  rainbow: 'rarity-rainbow',
};

const RARITY_BORDER_CLASS: Record<EquipmentRarity, string> = {
  white: 'border-rarity-white',
  green: 'border-rarity-green',
  blue: 'border-rarity-blue',
  purple: 'border-rarity-purple',
  gold: 'border-rarity-gold',
  red: 'border-rarity-red',
  rainbow: 'border-rarity-rainbow',
};

const LEGENDARY_EFFECT_LABEL_KEYS: Record<string, string> = Object.fromEntries(
  legendaryEffects.map((effect) => [effect.id, effect.labelKey]),
);

const STAT_LABEL_KEYS: Record<UpgradeableStat, string> = {
  attackDamage: 'hero.attackDamage',
  attackSpeed: 'hero.attackSpeed',
  maxHp: 'hero.maxHp',
  criticalChance: 'hero.criticalChance',
};

function formatStatBonus(stat: UpgradeableStat, value: number): string {
  if (stat === 'criticalChance') {
    return `+${Math.round(value * 100)}%`;
  }
  if (stat === 'attackSpeed') {
    return `+${value.toFixed(2)}`;
  }
  return `+${Math.round(value)}`;
}

function itemTitle(item: EquipmentItem): string {
  const rarity = t(RARITY_LABEL_KEYS[item.rarity]);
  const slot = t(SLOT_LABEL_KEYS[item.slot]);
  return `${rarity}${slot} ★${item.starLevel}/${MAX_STAR_LEVEL}`;
}

// Default view is just icon/name/main-stat/primary-button - the affix list
// and legendary-effect blurb (secondary, only matters once you're deciding
// between two similar items) fold into the Accordion instead of always
// taking up card space.
function ItemCard({ item, actions, labelPrefix }: { item: EquipmentItem; actions: ReactNode; labelPrefix?: string }) {
  const gold = useGameStore((state) => state.gold);
  const starUpEquipment = useGameStore((state) => state.starUpEquipment);
  const nextCost = getEquipmentStarUpCost(item.rarity, item.starLevel);
  const canStarUp = nextCost !== undefined && gold >= nextCost;
  const mainStatValue = getEquipmentMainStatValue(item.rarity, item.value, item.starLevel);
  const hasSecondaryInfo = item.affixes.length > 0 || !!item.legendaryEffectId;

  return (
    <div className={`mini-card ${RARITY_BORDER_CLASS[item.rarity]}`}>
      <div className={`mini-card-name ${RARITY_CLASS[item.rarity]}`}>
        {labelPrefix}
        {itemTitle(item)}
      </div>
      <div className="mini-card-sub">
        {t(STAT_LABEL_KEYS[item.stat])} {formatStatBonus(item.stat, mainStatValue)}
      </div>
      <div className="item-actions" style={{ marginTop: 6 }}>
        <button className="btn btn-sm" onClick={() => starUpEquipment(item.instanceId)} disabled={!nextCost || !canStarUp}>
          {nextCost ? `${t('star.upgrade')} (${nextCost}${t('battle.gold')})` : t('star.maxed')}
        </button>
        {actions}
      </div>
      {hasSecondaryInfo && (
        <Accordion title={t('equipment.details')}>
          {item.affixes.map((affix) => (
            <div key={affix.stat} className="text-faint">
              {t(STAT_LABEL_KEYS[affix.stat])} {formatStatBonus(affix.stat, affix.value)}
            </div>
          ))}
          {item.legendaryEffectId && <div className="item-detail">{t(LEGENDARY_EFFECT_LABEL_KEYS[item.legendaryEffectId])}</div>}
        </Accordion>
      )}
    </div>
  );
}

function EquipmentPanel() {
  const equipped = useGameStore((state) => state.equipped);
  const inventory = useGameStore((state) => state.inventory);
  const equipItem = useGameStore((state) => state.equipItem);
  const unequipSlot = useGameStore((state) => state.unequipSlot);
  const sellItem = useGameStore((state) => state.sellItem);

  const [slotFilter, setSlotFilter] = useState<SlotFilter>('all');
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  const filteredInventory = useMemo(() => {
    const filtered = inventory.filter(
      (item) => (slotFilter === 'all' || item.slot === slotFilter) && (rarityFilter === 'all' || item.rarity === rarityFilter),
    );
    const sorted = [...filtered];
    if (sortMode === 'rarity') {
      sorted.sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.starLevel - a.starLevel);
    } else if (sortMode === 'star') {
      sorted.sort((a, b) => b.starLevel - a.starLevel || RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity]);
    } else {
      sorted.reverse();
    }
    return sorted;
  }, [inventory, slotFilter, rarityFilter, sortMode]);

  const sellFilteredGold = useMemo(
    () => filteredInventory.reduce((sum, item) => sum + equipmentRarities[item.rarity].sellValue, 0),
    [filteredInventory],
  );

  function sellFiltered() {
    for (const item of filteredInventory) {
      sellItem(item.instanceId);
    }
  }

  return (
    <div>
      <div className="card">
        <div className="card-title">{t('equipment.title')}</div>
        <div className="card-grid-sm">
          {SLOT_IDS.map((slot) => {
            const item = equipped[slot];
            return item ? (
              <ItemCard
                key={slot}
                item={item}
                labelPrefix={`${t(SLOT_LABEL_KEYS[slot])}: `}
                actions={
                  <button className="btn btn-sm" onClick={() => unequipSlot(slot)}>
                    {t('equipment.unequip')}
                  </button>
                }
              />
            ) : (
              <div key={slot} className="mini-card">
                <div className="mini-card-name">{t(SLOT_LABEL_KEYS[slot])}</div>
                <div className="mini-card-sub">{t('equipment.empty')}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-title">{t('equipment.inventory')}</div>

        {inventory.length === 0 ? (
          <div className="empty-state">{t('equipment.inventoryEmpty')}</div>
        ) : (
          <>
            <div className="filter-bar">
              <div className="filter-field">
                <span className="filter-label">{t('equipment.filterSlot')}</span>
                <select className="select" value={slotFilter} onChange={(e) => setSlotFilter(e.target.value as SlotFilter)}>
                  <option value="all">{t('equipment.filterAll')}</option>
                  {SLOT_IDS.map((slot) => (
                    <option key={slot} value={slot}>
                      {t(SLOT_LABEL_KEYS[slot])}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-field">
                <span className="filter-label">{t('equipment.filterRarity')}</span>
                <select className="select" value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value as RarityFilter)}>
                  <option value="all">{t('equipment.filterAll')}</option>
                  {RARITY_IDS.map((rarity) => (
                    <option key={rarity} value={rarity}>
                      {t(RARITY_LABEL_KEYS[rarity])}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-field">
                <span className="filter-label">{t('equipment.sortBy')}</span>
                <select className="select" value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                  <option value="newest">{t('equipment.sortNewest')}</option>
                  <option value="rarity">{t('equipment.sortRarity')}</option>
                  <option value="star">{t('equipment.sortStar')}</option>
                </select>
              </div>
              <span className="filter-count">
                {filteredInventory.length}/{inventory.length} {t('equipment.itemCount')}
              </span>
            </div>

            {filteredInventory.length === 0 ? (
              <div className="empty-state">{t('equipment.noMatch')}</div>
            ) : (
              <>
                <div className="card-grid" style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 2 }}>
                  {filteredInventory.map((item) => (
                    <ItemCard
                      key={item.instanceId}
                      item={item}
                      actions={
                        <>
                          <button className="btn btn-sm" onClick={() => equipItem(item.instanceId)}>
                            {t('equipment.equip')}
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => sellItem(item.instanceId)}>
                            {t('equipment.sell')} ({equipmentRarities[item.rarity].sellValue} {t('battle.gold')})
                          </button>
                        </>
                      }
                    />
                  ))}
                </div>
                <button className="btn btn-danger btn-block" style={{ marginTop: 8 }} onClick={sellFiltered}>
                  {t('equipment.sellFiltered')} ({filteredInventory.length} · {sellFilteredGold} {t('battle.gold')})
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default EquipmentPanel;
