import {
  ascensionShopConfig,
  getAscensionShopCost,
  getAscensionShopFlatBonus,
  getAscensionShopLevel,
  getAscensionShopMultiplier,
  isAscensionShopMaxed,
  type AscensionShopId,
} from '../data/ascensionShopConfig';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';

const ASCENSION_SHOP_ORDER: AscensionShopId[] = [
  'attackDamage',
  'maxHp',
  'goldGain',
  'expGain',
  'criticalChance',
  'damageReduction',
];

const ASCENSION_SHOP_LABEL_KEYS: Record<AscensionShopId, string> = {
  attackDamage: 'ascensionShop.attackDamage',
  maxHp: 'ascensionShop.maxHp',
  goldGain: 'ascensionShop.goldGain',
  expGain: 'ascensionShop.expGain',
  damageReduction: 'ascensionShop.damageReduction',
  criticalChance: 'ascensionShop.criticalChance',
};

// criticalChance/damageReduction are flat +X per level (see
// ascensionShopConfig.getAscensionShopFlatBonus); everything else is a "+X%" multiplier.
const FLAT_ASCENSION_SHOP_IDS = new Set<AscensionShopId>(['criticalChance', 'damageReduction']);

function formatAscensionShopBonus(id: AscensionShopId, levels: Record<string, number>): string {
  if (FLAT_ASCENSION_SHOP_IDS.has(id)) {
    return `+${Math.round(getAscensionShopFlatBonus(levels, id) * 100)}%`;
  }
  return `+${Math.round((getAscensionShopMultiplier(levels, id) - 1) * 100)}%`;
}

function AscensionShopPanel() {
  const ascensionShopLevels = useGameStore((state) => state.ascensionShopLevels);
  const ascensionPoints = useGameStore((state) => state.ascensionPoints);
  const upgradeAscensionShopNode = useGameStore((state) => state.upgradeAscensionShopNode);

  return (
    <div className="card">
      <div className="card-title">
        {t('ascensionShop.title')} · {t('ascensionShop.points')}: {ascensionPoints}
      </div>
      <div className="card-subtitle">{t('ascensionShop.hint')}</div>
      <div className="list">
        {ASCENSION_SHOP_ORDER.map((id) => {
          const level = getAscensionShopLevel(ascensionShopLevels, id);
          const maxed = isAscensionShopMaxed(ascensionShopLevels, id);
          const cost = getAscensionShopCost(id, level);
          const canUpgrade = !maxed && ascensionPoints >= cost;

          return (
            <div key={id} className="item-card">
              <div className="item-name">
                {t(ASCENSION_SHOP_LABEL_KEYS[id])} Lv.{level}/{ascensionShopConfig[id].maxLevel}
              </div>
              <div className="item-detail">{formatAscensionShopBonus(id, ascensionShopLevels)}</div>
              <div className="item-actions">
                <button className="btn btn-sm" disabled={!canUpgrade} onClick={() => upgradeAscensionShopNode(id)}>
                  {maxed ? t('star.maxed') : `${t('talent.upgrade')} (${cost} ${t('ascensionShop.points')})`}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AscensionShopPanel;
