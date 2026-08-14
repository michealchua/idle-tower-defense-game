import { useEffect, useState, type ChangeEvent } from 'react';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';
import { getSaveMetadata } from '../engine/core/SaveSystem';
import type { UpdateStatus } from '../utils/updater';
import { sfxManager } from '../audio/SfxManager';
import { audioManager } from '../audio/AudioManager';

function formatSavedAt(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface SettingsPanelProps {
  onClose: () => void;
  onReturnToTitle: () => void;
}

// ESC-triggered pause/settings modal (see App.tsx's keydown handler) -
// bundles the things that were previously scattered one-offs (the HUD save
// icon, no exit path at all) instead of adding more permanent icons to the
// already-busy HUD corners. The display-scale control used to live here too
// (a free slider) - now a single always-visible stealth-mode toggle button
// in App.tsx instead, see its own doc comment for why.
function SettingsPanel({ onClose, onReturnToTitle }: SettingsPanelProps) {
  const activeSlot = useGameStore((state) => state.activeSlot);
  const saveGame = useGameStore((state) => state.saveGame);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmingReturn, setConfirmingReturn] = useState(false);
  const [confirmingExit, setConfirmingExit] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [sfxMuted, setSfxMuted] = useState(sfxManager.isMuted());
  const [bgmMuted, setBgmMuted] = useState(audioManager.isMuted());
  const [bgmVolume, setBgmVolume] = useState(audioManager.getVolume());

  const metadata = activeSlot !== null ? getSaveMetadata(activeSlot) : null;

  function handleToggleSfx(): void {
    setSfxMuted(sfxManager.toggleMute());
  }

  function handleToggleBgm(): void {
    setBgmMuted(audioManager.toggleMute());
  }

  function handleBgmVolumeChange(event: ChangeEvent<HTMLInputElement>): void {
    const next = Number(event.target.value);
    audioManager.setVolume(next);
    setBgmVolume(next);
  }

  // No automatic check-on-launch anymore (see electron/main.cjs's
  // app.whenReady) - this is the only way a check ever fires, so this
  // effect just listens for whatever the button below triggers, not
  // something that runs on its own.
  useEffect(() => {
    return window.tataKAIUpdater?.onStatus(setUpdateStatus);
  }, []);

  function handleSaveNow(): void {
    if (activeSlot === null) {
      return;
    }
    saveGame(activeSlot);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1500);
  }

  function handleCheckUpdate(): void {
    setUpdateStatus({ state: 'checking' });
    window.tataKAIUpdater?.checkNow();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container settings-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{t('settings.title')}</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-content settings-content">
          <div className="settings-section">
            <div className="settings-section-title">{t('settings.saveSection')}</div>
            <div className="item-detail">
              {metadata ? `${t('settings.lastSaved')} ${formatSavedAt(metadata.savedAt)}` : t('settings.neverSaved')}
            </div>
            <button className="btn btn-sm btn-primary" onClick={handleSaveNow} disabled={activeSlot === null}>
              {justSaved ? t('save.saved') : t('settings.saveNow')}
            </button>
            {confirmingReturn ? (
              <div className="save-slot-confirm">
                <span>{t('settings.returnToTitleConfirm')}</span>
                <div className="save-slot-actions">
                  <button className="btn btn-sm btn-danger" onClick={onReturnToTitle}>
                    {t('common.confirm')}
                  </button>
                  <button className="btn btn-sm" onClick={() => setConfirmingReturn(false)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn btn-sm" onClick={() => setConfirmingReturn(true)}>
                {t('settings.returnToTitle')}
              </button>
            )}
          </div>

          <div className="settings-section">
            <div className="settings-section-title">{t('settings.soundSection')}</div>
            <button className="btn btn-sm" onClick={handleToggleBgm}>
              {t(bgmMuted ? 'settings.bgmOff' : 'settings.bgmOn')}
            </button>
            <div className="settings-volume-row">
              <span className="item-detail">{t('settings.bgmVolume')}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={bgmVolume}
                disabled={bgmMuted}
                onChange={handleBgmVolumeChange}
                className="settings-volume-slider"
              />
            </div>
            <button className="btn btn-sm" onClick={handleToggleSfx}>
              {t(sfxMuted ? 'settings.sfxOff' : 'settings.sfxOn')}
            </button>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">{t('settings.updateSection')}</div>
            <button className="btn btn-sm" onClick={handleCheckUpdate} disabled={updateStatus?.state === 'checking'}>
              {t('settings.checkUpdate')}
            </button>
            {updateStatus?.state === 'checking' && <div className="item-detail">{t('update.checking')}</div>}
            {updateStatus?.state === 'up-to-date' && <div className="item-detail">{t('update.upToDate')}</div>}
            {updateStatus?.state === 'available' && (
              <div className="item-detail">
                {t('update.downloading')} v{updateStatus.version}
              </div>
            )}
            {updateStatus?.state === 'downloading' && (
              <div className="item-detail">
                {t('update.downloading')} {updateStatus.percent}%
              </div>
            )}
            {updateStatus?.state === 'downloaded' && (
              <div className="item-detail">
                {t('update.downloaded')} v{updateStatus.version}{' '}
                <button className="btn btn-sm btn-primary" onClick={() => window.tataKAIUpdater?.installNow()}>
                  {t('update.restartNow')}
                </button>
              </div>
            )}
            {updateStatus?.state === 'error' && (
              <div className="item-detail">
                {t('update.checkFailed')}
                {updateStatus.message && (
                  <>
                    <br />
                    <span className="text-faint">{updateStatus.message}</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="settings-section">
            <div className="settings-section-title">{t('settings.exitSection')}</div>
            {confirmingExit ? (
              <div className="save-slot-confirm">
                <span>{t('settings.exitGameConfirm')}</span>
                <div className="save-slot-actions">
                  <button className="btn btn-sm btn-danger" onClick={() => window.tataKAIApp?.quit()}>
                    {t('common.confirm')}
                  </button>
                  <button className="btn btn-sm" onClick={() => setConfirmingExit(false)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn btn-sm btn-danger" onClick={() => setConfirmingExit(true)}>
                {t('settings.exitGame')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
