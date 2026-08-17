import { memo, useMemo, useState, type ReactNode } from 'react';
import {
  equipmentRarities,
  equipmentSets,
  getEquipmentMainStatValue,
  getEquipmentStarUpCost,
  getReforgeCost,
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
import { IconSword, IconShield, IconDiamond, IconBoots, type IconProps } from './icons';

export const SLOT_IDS: EquipmentSlot[] = ['weapon', 'armor', 'trinket', 'boots'];
const RARITY_IDS: EquipmentRarity[] = ['white', 'green', 'blue', 'purple', 'gold', 'red', 'rainbow'];
const RARITY_RANK: Record<EquipmentRarity, number> = Object.fromEntries(
  RARITY_IDS.map((rarity, index) => [rarity, index]),
) as Record<EquipmentRarity, number>;

type SlotFilter = 'all' | EquipmentSlot;
type RarityFilter = 'all' | EquipmentRarity;
type SortMode = 'newest' | 'rarity' | 'star';

export const SLOT_LABEL_KEYS: Record<EquipmentSlot, string> = {
  weapon: 'equipment.slotWeapon',
  armor: 'equipment.slotArmor',
  trinket: 'equipment.slotTrinket',
  boots: 'equipment.slotBoots',
};

export const SLOT_ICON: Record<EquipmentSlot, (props: IconProps) => JSX.Element> = {
  weapon: IconSword,
  armor: IconShield,
  trinket: IconDiamond,
  boots: IconBoots,
};

export const RARITY_LABEL_KEYS: Record<EquipmentRarity, string> = {
  white: 'rarity.white',
  green: 'rarity.green',
  blue: 'rarity.blue',
  purple: 'rarity.purple',
  gold: 'rarity.gold',
  red: 'rarity.red',
  rainbow: 'rarity.rainbow',
};

export const RARITY_CLASS: Record<EquipmentRarity, string> = {
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

// True whenever `item` describes the same equipment in the same state -
// EquipmentPanel/HeroEquipmentSection both hand ItemCard a freshly-cloned
// `item` object every ~100ms (snapshotGameState maps the whole inventory/
// equipment array into new objects every GameLoop tick, whether or not any
// item actually changed), so React.memo's *default* prop comparison (a
// reference check) would never once skip a re-render here - it always sees
// "a new item object" even when every field is identical. Comparing fields
// instead of the object reference is what actually lets memo work.
// Deliberately does NOT compare `actions` (the caller-provided sell/salvage/
// unequip buttons) - in every real call site those are pure functions of
// `item.instanceId`/`item.rarity` alone (see EquipmentPanel/HeroPanel), so
// once `item` itself compares equal, a fresh `actions` element every render
// is guaranteed to render identically anyway. If a future caller ever gives
// `actions` its own independent reactive state, this comparator needs to
// account for that too.
function areItemCardPropsEqual(prev: { item: EquipmentItem; labelPrefix?: string }, next: { item: EquipmentItem; labelPrefix?: string }): boolean {
  if (prev.labelPrefix !== next.labelPrefix) {
    return false;
  }
  const a = prev.item;
  const b = next.item;
  if (
    a.instanceId !== b.instanceId ||
    a.rarity !== b.rarity ||
    a.slot !== b.slot ||
    a.stat !== b.stat ||
    a.value !== b.value ||
    a.starLevel !== b.starLevel ||
    a.setId !== b.setId ||
    a.legendaryEffectId !== b.legendaryEffectId ||
    a.substats.length !== b.substats.length
  ) {
    return false;
  }
  return a.substats.every((substat, index) => substat.stat === b.substats[index].stat && substat.value === b.substats[index].value);
}

// Main stat and substats (副词条) are always visible and clearly separated -
// this is the one place a player judges "is this item worth keeping,"
// so both need to read at a glance rather than hiding behind a fold. Only
// the legendary-effect blurb (flavor text, doesn't affect the decision)
// stays in the Accordion. Exported so HeroPanel's per-hero equipment slots
// render the exact same card instead of duplicating this markup.
export const ItemCard = memo(function ItemCard({ item, actions, labelPrefix }: { item: EquipmentItem; actions: ReactNode; labelPrefix?: string }) {
  const gold = useGameStore((state) => state.gold);
  const reforgeDust = useGameStore((state) => state.reforgeDust);
  const starUpEquipment = useGameStore((state) => state.starUpEquipment);
  const reforgeEquipment = useGameStore((state) => state.reforgeEquipment);
  const nextStarCost = getEquipmentStarUpCost(item.rarity, item.starLevel);
  const canStarUp = nextStarCost !== undefined && gold >= nextStarCost;
  const reforgeCost = getReforgeCost(item.rarity);
  const canReforge = reforgeDust >= reforgeCost;
  const mainStatValue = getEquipmentMainStatValue(item.rarity, item.value, item.starLevel);

  const SlotIcon = SLOT_ICON[item.slot];

  return (
    <div className={`mini-card ${RARITY_BORDER_CLASS[item.rarity]}`}>
      <div className={`mini-card-name ${RARITY_CLASS[item.rarity]}`}>
        {labelPrefix}
        <SlotIcon /> {itemTitle(item)}
      </div>
      {item.setId && <div className="text-faint">{t(equipmentSets[item.setId].nameKey)}</div>}

      <div style={{ marginTop: 4 }}>
        <div className="text-faint">{t('equipment.mainStat')}</div>
        <div className="mini-card-sub">
          {t(STAT_LABEL_KEYS[item.stat])} {formatStatBonus(item.stat, mainStatValue)}
        </div>
      </div>

      {item.substats.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div className="text-faint">{t('equipment.substats')}</div>
          {item.substats.map((substat, index) => (
            <div key={index} className="mini-card-sub">
              {t(STAT_LABEL_KEYS[substat.stat])} {formatStatBonus(substat.stat, substat.value)}
            </div>
          ))}
        </div>
      )}

      <div className="item-card-actions">
        <button className="btn btn-sm" onClick={() => starUpEquipment(item.instanceId)} disabled={!nextStarCost || !canStarUp}>
          {nextStarCost ? `${t('star.upgrade')} (${nextStarCost}${t('battle.gold')})` : t('star.maxed')}
        </button>
        <button className="btn btn-sm" onClick={() => reforgeEquipment(item.instanceId)} disabled={!canReforge}>
          {t('equipment.reforge')} ({reforgeCost}{t('equipment.reforgeDustShort')})
        </button>
        {actions}
      </div>

      {item.legendaryEffectId && (
        <Accordion title={t('equipment.details')}>
          <div className="item-detail">{t(LEGENDARY_EFFECT_LABEL_KEYS[item.legendaryEffectId])}</div>
        </Accordion>
      )}
    </div>
  );
},
areItemCardPropsEqual);

// Rarities the "batch salvage low-rarity gear" button targets - the two
// tiers that never roll a set (see equipmentConfig.SET_ELIGIBLE_RARITIES)
// and are worth the least sold for gold, i.e. the ones piling up unused in a
// bulging inventory.
const LOW_RARITIES: EquipmentRarity[] = ['white', 'green'];

// Equipping now happens per-hero from HeroPanel's detail pane (each hero has
// its own weapon/armor/trinket/boots loadout) - this panel is just the
// shared unequipped-item pool: browse, star-up/reforge, sell/salvage.
function EquipmentPanel() {
  const inventory = useGameStore((state) => state.inventory);
  const reforgeDust = useGameStore((state) => state.reforgeDust);
  const sellItem = useGameStore((state) => state.sellItem);
  const salvageEquipment = useGameStore((state) => state.salvageEquipment);

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
  const salvageFilteredDust = useMemo(
    () => filteredInventory.reduce((sum, item) => sum + equipmentRarities[item.rarity].reforgeDustValue, 0),
    [filteredInventory],
  );

  const lowRarityItems = useMemo(() => inventory.filter((item) => LOW_RARITIES.includes(item.rarity)), [inventory]);
  const lowRarityDust = useMemo(
    () => lowRarityItems.reduce((sum, item) => sum + equipmentRarities[item.rarity].reforgeDustValue, 0),
    [lowRarityItems],
  );

  function sellFiltered() {
    for (const item of filteredInventory) {
      sellItem(item.instanceId);
    }
  }

  // General filter-driven bulk salvage (any slot/rarity combination the
  // filter bar above is set to) - separate from salvageLowRarity below,
  // which stays as a fixed one-tap white+green shortcut (a single rarity
  // dropdown can't express "white AND green" at once). This is the "let me
  // filter first, then salvage whatever matches" the fixed button couldn't do.
  function salvageFiltered() {
    for (const item of filteredInventory) {
      salvageEquipment(item.instanceId);
    }
  }

  function salvageLowRarity() {
    for (const item of lowRarityItems) {
      salvageEquipment(item.instanceId);
    }
  }

  return (
    <div>
      <div className="card">
        <div className="card-title">
          {t('equipment.inventory')} <span className="text-faint">· {t('equipment.reforgeDust')} {reforgeDust}</span>
        </div>
        <div className="card-subtitle">{t('equipment.equipHint')}</div>

        {inventory.length === 0 ? (
          <div className="empty-state">{t('equipment.inventoryEmpty')}</div>
        ) : (
          <>
            {lowRarityItems.length > 0 && (
              <button className="btn btn-primary btn-block" style={{ marginBottom: 8 }} onClick={salvageLowRarity}>
                {t('equipment.salvageLowRarity')} ({lowRarityItems.length} · +{lowRarityDust} {t('equipment.reforgeDustShort')})
              </button>
            )}

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
                <div className="equipment-card-grid" style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 2 }}>
                  {filteredInventory.map((item) => (
                    <ItemCard
                      key={item.instanceId}
                      item={item}
                      actions={
                        <>
                          <button className="btn btn-sm btn-danger" onClick={() => sellItem(item.instanceId)}>
                            {t('equipment.sell')} ({equipmentRarities[item.rarity].sellValue} {t('battle.gold')})
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => salvageEquipment(item.instanceId)}>
                            {t('equipment.salvage')} (+{equipmentRarities[item.rarity].reforgeDustValue} {t('equipment.reforgeDustShort')})
                          </button>
                        </>
                      }
                    />
                  ))}
                </div>
                <div className="item-actions" style={{ marginTop: 8 }}>
                  <button className="btn btn-danger" onClick={sellFiltered}>
                    {t('equipment.sellFiltered')} ({filteredInventory.length} · {sellFilteredGold} {t('battle.gold')})
                  </button>
                  <button className="btn btn-danger" onClick={salvageFiltered}>
                    {t('equipment.salvageFiltered')} ({filteredInventory.length} · +{salvageFilteredDust} {t('equipment.reforgeDustShort')})
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default EquipmentPanel;
