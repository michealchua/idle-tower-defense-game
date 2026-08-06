import {
  getBaseMaxHpForCastleLevel,
  getCastleUpgradeCost,
  getMaxDeployedHeroes,
  getMaxDeployedPets,
  getMaxDeployedTowers,
} from '../data/castleConfig';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';

function CastlePanel() {
  const castleLevel = useGameStore((state) => state.castleLevel);
  const gold = useGameStore((state) => state.gold);
  const upgradeCastle = useGameStore((state) => state.upgradeCastle);

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
        <div className="row">
          <span className="text-muted">{t('castle.petSlots')}</span>
          <span>{getMaxDeployedPets(castleLevel)}</span>
        </div>
        <div className="row">
          <span className="text-muted">{t('castle.towerSlots')}</span>
          <span>{getMaxDeployedTowers(castleLevel)}</span>
        </div>
      </div>
      <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={() => upgradeCastle()} disabled={!canAfford}>
        {t('castle.upgrade')} → Lv.{castleLevel + 1} ({cost} {t('battle.gold')})
      </button>
    </div>
  );
}

export default CastlePanel;
