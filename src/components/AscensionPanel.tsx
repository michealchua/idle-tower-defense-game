import { ascensionConfig } from '../data/ascensionConfig';
import { getGlobalWaveNumber } from '../engine/systems/WaveSystem';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';
import Accordion from './Accordion';

// No list to select from here, so the panel itself is the "always-visible
// overview" - stat tiles + the eligibility requirement stay on screen by
// default, and only the one-time-read reset notice folds into the Accordion.
function AscensionPanel() {
  const ascensionLevel = useGameStore((state) => state.ascensionLevel);
  const ascensionPoints = useGameStore((state) => state.ascensionPoints);
  const wave = useGameStore((state) => state.wave);
  const eligible = useGameStore((state) => state.canAscend);
  const ascend = useGameStore((state) => state.ascend);

  return (
    <div className="card">
      <div className="card-title">🌟 {t('ascension.title')}</div>

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-tile-label">{t('ascension.level')}</div>
          <div className="stat-tile-value hud-gold">{ascensionLevel}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">{t('ascension.points')}</div>
          <div className="stat-tile-value hud-gold">{ascensionPoints}</div>
        </div>
      </div>

      <div className="card-subtitle">
        {t('ascension.requirement')} {ascensionConfig.unlockHeroLevel} · {t('ascension.requirementWave')} {ascensionConfig.requiredWave}
        {' '}({t('ascension.currentWave')} {getGlobalWaveNumber(wave)})
      </div>

      <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={() => ascend()} disabled={!eligible}>
        {t('ascension.ascend')}
      </button>

      <Accordion title={t('ascension.details')}>
        <div className="text-faint">{t('ascension.resetNotice')}</div>
      </Accordion>
    </div>
  );
}

export default AscensionPanel;
