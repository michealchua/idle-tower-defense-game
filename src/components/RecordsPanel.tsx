import { dailyQuestConfig, dailyQuestIds, type DailyQuestId } from '../data/dailyQuestConfig';
import { formatBigNumber } from '../utils/scaling';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';
import { IconSword, IconFlag, IconGiftBox, IconDiamond, type IconProps } from './icons';

const DAILY_QUEST_ICON: Record<DailyQuestId, (props: IconProps) => JSX.Element> = {
  killEnemies: IconSword,
  clearWaves: IconFlag,
  pullGacha: IconGiftBox,
};

// Plan section 28's "活动"/"排行榜" - this game has no backend to serve a
// real cross-player leaderboard or a server-driven event calendar, so this
// panel is the honest local equivalent: your own lifetime bests (records)
// plus a small repeatable daily checklist (quests), both entirely
// client-side. See DailyQuestSystem.ts and GameState.highestGlobalWaveReached/
// totalBossKills.
function RecordsPanel() {
  const highestGlobalWaveReached = useGameStore((state) => state.highestGlobalWaveReached);
  const totalBossKills = useGameStore((state) => state.totalBossKills);
  const ascensionLevel = useGameStore((state) => state.ascensionLevel);
  const dailyQuestProgress = useGameStore((state) => state.dailyQuestProgress);
  const dailyQuestClaimed = useGameStore((state) => state.dailyQuestClaimed);
  const diamonds = useGameStore((state) => state.diamonds);
  const claimDailyQuest = useGameStore((state) => state.claimDailyQuest);

  return (
    <div>
      <div className="card">
        <div className="card-title">{t('records.statsTitle')}</div>
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="stat-tile-label">{t('records.highestWave')}</div>
            <div className="stat-tile-value">{highestGlobalWaveReached}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-label">{t('records.totalBossKills')}</div>
            <div className="stat-tile-value">{formatBigNumber(totalBossKills)}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-label">{t('ascension.title')}</div>
            <div className="stat-tile-value">{ascensionLevel}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">{t('records.dailyQuestTitle')}</div>
        <div className="card-subtitle">{t('records.dailyQuestHint')}</div>
        <div className="card-grid">
          {dailyQuestIds.map((id) => {
            const def = dailyQuestConfig[id];
            const progress = Math.min(def.targetAmount, dailyQuestProgress[id] ?? 0);
            const claimed = dailyQuestClaimed[id] ?? false;
            const complete = progress >= def.targetAmount;
            const QuestIcon = DAILY_QUEST_ICON[id];
            return (
              <div key={id} className="mini-card">
                <div className="mini-card-name">
                  <span>
                    <QuestIcon /> {t(def.labelKey)}
                  </span>
                </div>
                <div className="mini-card-sub">
                  {progress}/{def.targetAmount}
                </div>
                <div className="bar-track" style={{ marginTop: 4 }}>
                  <div className="bar-fill bar-fill-exp" style={{ width: `${(progress / def.targetAmount) * 100}%` }} />
                </div>
                <button
                  className="btn btn-primary btn-sm btn-block"
                  style={{ marginTop: 8 }}
                  disabled={!complete || claimed}
                  onClick={() => claimDailyQuest(id)}
                >
                  {claimed
                    ? t('records.claimed')
                    : `${t('records.claim')} (+${def.rewardDiamonds} ${t('battle.diamonds')})`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-faint" style={{ padding: '0 4px' }}>
        {t('records.diamondBalance')}: <IconDiamond /> {formatBigNumber(diamonds)}
      </div>
    </div>
  );
}

export default RecordsPanel;
