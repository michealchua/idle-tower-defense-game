import { useEffect, useState } from 'react';
import { t } from '../locales/i18n';
import type { UpdateStatus } from '../utils/updater';

// Real in-app update UI - "just push a commit and the installed app updates
// itself" only actually feels that way to the player if something visible
// tells them it happened. Replaces relying on electron-updater's bare OS
// notification (checkForUpdatesAndNotify), which an idle-game session left
// running for hours could easily never surface at all. Silent for
// 'available' (autoDownload is on by default, so it's about to become
// 'downloading' anyway); 'checking'/'up-to-date' are surfaced inline by
// SettingsPanel's manual check button instead, not here - only
// 'downloading'/'downloaded'/'error' get this corner banner.
function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    return window.tataKAIUpdater?.onStatus(setStatus);
  }, []);

  if (!status || status.state === 'available' || status.state === 'checking' || status.state === 'up-to-date') {
    return null;
  }

  return (
    <div className="update-banner">
      {status.state === 'downloading' && (
        <>
          <span>
            {t('update.downloading')} {status.percent}%
          </span>
          <div className="bar-track" style={{ width: 120 }}>
            <div className="bar-fill bar-fill-exp" style={{ width: `${status.percent}%` }} />
          </div>
        </>
      )}
      {status.state === 'downloaded' && (
        <>
          <span>
            {t('update.downloaded')} v{status.version}
          </span>
          <button className="btn btn-primary btn-sm" onClick={() => window.tataKAIUpdater?.installNow()}>
            {t('update.restartNow')}
          </button>
        </>
      )}
      {status.state === 'error' && <span className="text-faint">{t('update.checkFailed')}</span>}
    </div>
  );
}

export default UpdateBanner;
