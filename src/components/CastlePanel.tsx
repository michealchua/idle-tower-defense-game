import { getBaseMaxHpForCastleLevel, getCastleUpgradeCost, getMaxDeployedHeroes } from '../data/castleConfig';
import {
  castleTypeConfig,
  castleTypeIds,
  getCastleAttackMultiplier,
  getCastleCriticalChanceBonus,
  getCastleDamageReductionBonus,
  getCastleGoldPerSecond,
  type CastleTypeId,
} from '../data/castleTypeConfig';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';

// Each type's headline bonus at a given level, formatted for display -
// passing the type itself as the "active" arg to these getters is
// deliberate (see castleTypeConfig.ts) so every type's preview can be
// computed the same way regardless of which one is actually selected.
function formatCastleTypeBonus(id: CastleTypeId, castleLevel: number): string {
  switch (id) {
    case 'military':
      return `+${Math.round((getCastleAttackMultiplier(id, castleLevel) - 1) * 100)}%`;
    case 'economic':
      return `+${getCastleGoldPerSecond(id, castleLevel).toFixed(1)}/s`;
    case 'defense':
      return `+${Math.round(getCastleDamageReductionBonus(id, castleLevel) * 100)}%`;
    case 'arcane':
      return `+${Math.round(getCastleCriticalChanceBonus(id, castleLevel) * 100)}%`;
  }
}

function CastlePanel() {
  const castleLevel = useGameStore((state) => state.castleLevel);
  const castleType = useGameStore((state) => state.castleType);
  const gold = useGameStore((state) => state.gold);
  const upgradeCastle = useGameStore((state) => state.upgradeCastle);
  const setCastleType = useGameStore((state) => state.setCastleType);

  const cost = getCastleUpgradeCost(castleLevel);
  const canAfford = gold >= cost;

  return (
    <div className="card">
      <div className="card-title">
        {t('castle.title')} · {t('castle.level')} {castleLevel}
      </div>
      <div className="list">
        <div className="row">
          <span className="text-muted">{t('base.hp')}</span>
          <span>{getBaseMaxHpForCastleLevel(castleLevel)}</span>
        </div>
        <div className="row">
          <span className="text-muted">{t('castle.heroSlots')}</span>
          <span>{getMaxDeployedHeroes(castleLevel)}</span>
        </div>
      </div>
      <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={() => upgradeCastle()} disabled={!canAfford}>
        {t('castle.upgrade')} → Lv.{castleLevel + 1} ({cost} {t('battle.gold')})
      </button>

      <div className="card-subtitle" style={{ marginTop: 12 }}>
        {t('castle.currentType')}: {t(castleTypeConfig[castleType].labelKey)}
      </div>
      <div className="list">
        {castleTypeIds.map((id) => {
          const isActive = id === castleType;
          const def = castleTypeConfig[id];
          return (
            <div key={id} className={`item-card${isActive ? '' : ' locked'}`}>
              <div className="item-name">{t(def.labelKey)}</div>
              <div className="item-detail">{t(def.descKey)}</div>
              <div className="item-detail">
                {t('castle.currentBonus')}: {formatCastleTypeBonus(id, castleLevel)}
              </div>
              <div className="item-actions">
                <button className="btn btn-sm" disabled={isActive} onClick={() => setCastleType(id)}>
                  {isActive ? t('squad.deployed') : t('castle.switchType')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CastlePanel;
