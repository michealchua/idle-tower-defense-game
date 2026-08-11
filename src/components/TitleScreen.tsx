import { useEffect, useState } from 'react';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';
import { SAVE_SLOTS, getSaveMetadata, hasSave, getMostRecentSlot, type SaveMetadata, type SaveSlot } from '../engine/core/SaveSystem';
import { IconSave } from './icons';

interface TitleScreenProps {
  onEnterGame: () => void;
}

interface PendingConfirm {
  slot: SaveSlot;
  action: 'overwrite' | 'delete';
}

function formatSavedAt(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Default route/screen at game start (see App.tsx) - a blinking "press
// start" prompt plus an edge-anchored save-slot management panel. Slot
// mutations go through useGameStore's saveGame/loadGame/deleteSave/
// startNewGame actions (which own the live gameState singleton);
// read-only slot metadata for display is pulled directly from SaveSystem
// since it doesn't need the store at all.
function TitleScreen({ onEnterGame }: TitleScreenProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  const loadGame = useGameStore((state) => state.loadGame);
  const startNewGame = useGameStore((state) => state.startNewGame);
  const deleteSave = useGameStore((state) => state.deleteSave);

  function handleQuickStart(): void {
    const recentSlot = getMostRecentSlot();
    if (recentSlot !== null) {
      loadGame(recentSlot);
    } else {
      startNewGame(1);
    }
    onEnterGame();
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.code === 'Space' && !isPanelOpen) {
        event.preventDefault();
        handleQuickStart();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  function handleSlotPrimaryAction(slot: SaveSlot): void {
    if (hasSave(slot)) {
      loadGame(slot);
    } else {
      startNewGame(slot);
    }
    onEnterGame();
  }

  function handleConfirm(): void {
    if (!pendingConfirm) {
      return;
    }
    if (pendingConfirm.action === 'overwrite') {
      startNewGame(pendingConfirm.slot);
      setPendingConfirm(null);
      onEnterGame();
      return;
    }
    deleteSave(pendingConfirm.slot);
    setPendingConfirm(null);
  }

  return (
    <div className="title-screen" onClick={() => !isPanelOpen && handleQuickStart()}>
      <div className="title-background" />
      {/* Relative (no leading "/") - see assetLoader.getHeroSpriteSrc's doc
          comment for why a root-absolute path breaks under the packaged
          desktop app's file:// loading. */}
      <img className="title-hero-idle" src="sprites/heroes/paladin_walk.png" alt="" />

      <div className="title-logo">
        <div className="title-name">{t('title.gameName')}</div>
        <div className="title-subtitle">{t('title.gameSubtitle')}</div>
      </div>

      <div className="title-narration">{t('title.narration')}</div>

      <div className="title-press-start">{t('title.pressStart')}</div>

      <button
        className="title-save-toggle"
        onClick={(event) => {
          event.stopPropagation();
          setIsPanelOpen((open) => !open);
        }}
      >
        <IconSave /> {t('title.slotManagement')}
      </button>

      {isPanelOpen && (
        <div className="title-save-panel" onClick={(event) => event.stopPropagation()}>
          {SAVE_SLOTS.map((slot) => {
            const metadata: SaveMetadata | null = getSaveMetadata(slot);
            return (
              <div className="save-slot-row" key={slot}>
                <div className="save-slot-info">
                  <div className="save-slot-title">
                    {t('title.slotLabel')} {slot}
                  </div>
                  {metadata ? (
                    <div className="save-slot-detail">
                      {t('title.savedAt')} {formatSavedAt(metadata.savedAt)} · {t('castle.title')} {metadata.castleLevel} ·{' '}
                      {metadata.globalWaveLabel}
                    </div>
                  ) : (
                    <div className="save-slot-detail text-faint">{t('title.slotEmpty')}</div>
                  )}
                </div>

                {pendingConfirm?.slot === slot ? (
                  <div className="save-slot-confirm">
                    <span>{t(pendingConfirm.action === 'overwrite' ? 'title.overwriteConfirm' : 'title.deleteConfirm')}</span>
                    <div className="save-slot-actions">
                      <button className="btn btn-sm btn-danger" onClick={handleConfirm}>
                        {t('common.confirm')}
                      </button>
                      <button className="btn btn-sm" onClick={() => setPendingConfirm(null)}>
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="save-slot-actions">
                    {metadata ? (
                      <>
                        <button className="btn btn-sm btn-primary" onClick={() => handleSlotPrimaryAction(slot)}>
                          {t('title.loadGame')}
                        </button>
                        <button className="btn btn-sm" onClick={() => setPendingConfirm({ slot, action: 'overwrite' })}>
                          {t('title.overwrite')}
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => setPendingConfirm({ slot, action: 'delete' })}>
                          {t('title.deleteGame')}
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-sm btn-primary" onClick={() => handleSlotPrimaryAction(slot)}>
                        {t('title.newGame')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TitleScreen;
