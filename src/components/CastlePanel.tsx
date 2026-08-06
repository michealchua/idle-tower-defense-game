import { getBaseMaxHpForCastleLevel, getCastleUpgradeCost, getMaxDeployedHeroes } from '../data/castleConfig';
import {
  castleTypeConfig,
  castleTypeIds,
  getCastleAttackMultiplier,
  getCastleBuildMaterialsPerSecond,
  getCastleCriticalChanceBonus,
  getCastleDamageReductionBonus,
  type CastleTypeId,
} from '../data/castleTypeConfig';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';

const CASTLE_TYPE_ICON: Record<CastleTypeId, string> = {
  military: '⚔️',
  economic: '💰',
  defense: '🛡️',
  arcane: '🔮',
};

// Each type's headline bonus at a given level, formatted for display -
// passing the type itself as the "active" arg to these getters is
// deliberate (see castleTypeConfig.ts) so every type's preview can be
// computed the same way regardless of which one is actually selected.
function formatCastleTypeBonus(id: CastleTypeId, castleLevel: number): string {
  switch (id) {
    case 'military':
      return `+${Math.round((getCastleAttackMultiplier(id, castleLevel) - 1) * 100)}%`;
    case 'economic':
      return `+${getCastleBuildMaterialsPerSecond(id, castleLevel).toFixed(1)}/s`;
    case 'defense':
      return `+${Math.round(getCastleDamageReductionBonus(id, castleLevel) * 100)}%`;
    case 'arcane':
      return `+${Math.round(getCastleCriticalChanceBonus(id, castleLevel) * 100)}%`;
  }
}

function CastlePanel() {
  const castleLevel = useGameStore((state) => state.castleLevel);
  const castleType = useGameStore((state) => state.castleType);
  const buildMaterials = useGameStore((state) => state.buildMaterials);
  const upgradeCastle = useGameStore((state) => state.upgradeCastle);
  const setCastleType = useGameStore((state) => state.setCastleType);

  const cost = getCastleUpgradeCost(castleLevel);
  const canAfford = buildMaterials >= cost;

  return (
    <div className="card">
      <div className="card-title">
        {t('castle.title')} · {t('castle.level')} {castleLevel}
      </div>

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-tile-label">{t('base.hp')}</div>
          <div className="stat-tile-value">{getBaseMaxHpForCastleLevel(castleLevel)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">{t('castle.heroSlots')}</div>
          <div className="stat-tile-value">{getMaxDeployedHeroes(castleLevel)}</div>
        </div>
      </div>

      <button className="btn btn-primary btn-block" onClick={() => upgradeCastle()} disabled={!canAfford}>
        {t('castle.upgrade')} → Lv.{castleLevel + 1} ({cost} {t('battle.buildMaterials')})
      </button>

      <div className="card-subtitle" style={{ marginTop: 12 }}>
        {t('castle.currentType')}: {t(castleTypeConfig[castleType].labelKey)}
      </div>
      <div className="card-grid-sm">
        {castleTypeIds.map((id) => {
          const isActive = id === castleType;
          const def = castleTypeConfig[id];
          return (
            <div key={id} className={`mini-card${isActive ? ' active' : ''}`}>
              <div className="mini-card-name" data-tooltip={t(def.descKey)}>
                {CASTLE_TYPE_ICON[id]} {t(def.labelKey)}
              </div>
              <div className="mini-card-sub">{formatCastleTypeBonus(id, castleLevel)}</div>
              <div className="item-actions" style={{ marginTop: 6 }}>
                <button className="btn btn-sm btn-primary" disabled={isActive} onClick={() => setCastleType(id)}>
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
