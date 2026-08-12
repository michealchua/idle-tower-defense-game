import { useState } from 'react';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';
import { getSaveMetadata } from '../engine/core/SaveSystem';
import { getDisplayScale, setDisplayScale, MIN_DISPLAY_SCALE, MAX_DISPLAY_SCALE } from '../utils/displayScale';

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
// icon, no exit path at all) plus the new display-scale control, rather than
// adding more permanent icons to the already-busy HUD corners.
function SettingsPanel({ onClose, onReturnToTitle }: SettingsPanelProps) {
  const activeSlot = useGameStore((state) => state.activeSlot);
  const saveGame = useGameStore((state) => state.saveGame);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmingReturn, setConfirmingReturn] = useState(false);
  const [confirmingExit, setConfirmingExit] = useState(false);
  const [scale, setScale] = useState(() => getDisplayScale());

  const metadata = activeSlot !== null ? getSaveMetadata(activeSlot) : null;

  function handleSaveNow(): void {
    if (activeSlot === null) {
      return;
    }
    saveGame(activeSlot);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1500);
  }

  function handleScaleChange(next: number): void {
    setScale(next);
    setDisplayScale(next);
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
            <div className="settings-section-title">{t('settings.displaySection')}</div>
            <div className="item-detail">
              {t('settings.displayScale')} {Math.round(scale * 100)}%
            </div>
            <input
              type="range"
              min={MIN_DISPLAY_SCALE}
              max={MAX_DISPLAY_SCALE}
              step={0.05}
              value={scale}
              onChange={(event) => handleScaleChange(Number(event.target.value))}
              className="settings-scale-slider"
            />
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
