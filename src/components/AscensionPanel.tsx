import { ascensionConfig } from '../data/ascensionConfig';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';

function AscensionPanel() {
  const ascensionLevel = useGameStore((state) => state.ascensionLevel);
  const ascensionPoints = useGameStore((state) => state.ascensionPoints);
  const wave = useGameStore((state) => state.wave);
  const eligible = useGameStore((state) => state.canAscend);
  const ascend = useGameStore((state) => state.ascend);

  return (
    <div className="card">
      <div className="card-title">{t('ascension.title')}</div>
      <div className="row">
        <span>{t('ascension.level')}</span>
        <span className="hud-gold">{ascensionLevel}</span>
      </div>
      <div className="row" style={{ marginTop: 4 }}>
        <span>{t('ascension.points')}</span>
        <span className="hud-gold">{ascensionPoints}</span>
      </div>
      <div className="card-subtitle" style={{ marginTop: 8 }}>
        {t('ascension.requirement')} {ascensionConfig.unlockHeroLevel}, {t('ascension.requirementChapter')}{' '}
        {ascensionConfig.requiredChapter} ({t('ascension.currentChapter')} {wave.chapter}-{wave.waveInChapter})
      </div>
      <div className="card-subtitle" style={{ marginTop: 8 }}>
        {t('ascension.resetNotice')}
      </div>
      <button className="btn btn-primary btn-block" onClick={() => ascend()} disabled={!eligible}>
        {t('ascension.ascend')}
      </button>
    </div>
  );
}

export default AscensionPanel;
