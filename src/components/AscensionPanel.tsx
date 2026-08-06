import { ascensionConfig } from '../data/ascensionConfig';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';

function AscensionPanel() {
  const ascensionLevel = useGameStore((state) => state.ascensionLevel);
  const eligible = useGameStore((state) => state.canAscend);
  const ascend = useGameStore((state) => state.ascend);

  const bonusPercent = Math.round(ascensionLevel * ascensionConfig.bonusMultiplierPerLevel * 100);

  return (
    <div className="card">
      <div className="card-title">{t('ascension.title')}</div>
      <div className="row">
        <span>{t('ascension.level')}</span>
        <span className="hud-gold">{ascensionLevel}</span>
      </div>
      <div className="row" style={{ marginTop: 4 }}>
        <span>{t('ascension.bonus')}</span>
        <span>+{bonusPercent}%</span>
      </div>
      <div className="card-subtitle" style={{ marginTop: 8 }}>
        {t('ascension.resetNotice')}
      </div>
      <button className="btn btn-primary btn-block" onClick={() => ascend()} disabled={!eligible}>
        {eligible ? t('ascension.ascend') : `${t('ascension.requirement')} ${ascensionConfig.unlockHeroLevel}`}
      </button>
    </div>
  );
}

export default AscensionPanel;
