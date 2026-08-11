import { useEffect, useState } from 'react';
import { t } from '../locales/i18n';

// Mirrors the shapes electron/main.cjs's autoUpdater event handlers send -
// kept local (not shared with main.cjs, which is plain JS) since this is
// the only place that needs the type.
type UpdateStatus =
  | { state: 'available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

// Same "only exists in the packaged/dev Electron shell" contract as
// window.tataKAISave - undefined in the plain web build (no preload script
// there, and no installer to update anyway - a browser tab is always
// already on whatever's currently deployed).
declare global {
  interface Window {
    tataKAIUpdater?: {
      onStatus: (callback: (status: UpdateStatus) => void) => () => void;
      installNow: () => void;
    };
  }
}

// Real in-app update UI - "just push a commit and the installed app updates
// itself" only actually feels that way to the player if something visible
// tells them it happened. Replaces relying on electron-updater's bare OS
// notification (checkForUpdatesAndNotify), which an idle-game session left
// running for hours could easily never surface at all. Silent for
// 'available' (autoDownload is on by default, so it's about to become
// 'downloading' anyway) and for a successful up-to-date check (nothing to
// tell the player) - only 'downloading'/'downloaded'/'error' actually
// render anything.
function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    return window.tataKAIUpdater?.onStatus(setStatus);
  }, []);

  if (!status || status.state === 'available') {
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
