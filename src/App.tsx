import { useEffect, useRef, useState } from 'react';
import BattleScreen from './components/BattleScreen';
import TitleScreen from './components/TitleScreen';
import StoryDialog from './components/StoryDialog';
import TutorialOverlay from './components/TutorialOverlay';
import HeroPanel from './components/HeroPanel';
import EquipmentPanel from './components/EquipmentPanel';
import TalentPanel from './components/TalentPanel';
import PetPanel from './components/PetPanel';
import GachaPanel from './components/GachaPanel';
import CodexPanel from './components/CodexPanel';
import AscensionPanel from './components/AscensionPanel';
import AscensionShopPanel from './components/AscensionShopPanel';
import RecordsPanel from './components/RecordsPanel';
import UpdateBanner from './components/UpdateBanner';
import SettingsPanel from './components/SettingsPanel';
import EquipmentDropToast from './components/EquipmentDropToast';
import { getBiomeForChapter } from './data/biomeConfig';
import { formatBigNumber } from './utils/scaling';
import { isPanelUnlocked, type PanelId } from './data/unlockConditionConfig';
import { dailyQuestIds, dailyQuestConfig } from './data/dailyQuestConfig';
import { getActiveTutorialStep } from './data/tutorialConfig';
import { getGlobalWaveNumber } from './engine/systems/WaveSystem';
import { setWindowMode as applyWindowMode } from './utils/windowMode';
import { t } from './locales/i18n';
import { useGameStore } from './store/useGameStore';
import { sfxManager } from './audio/SfxManager';
import { audioManager } from './audio/AudioManager';
import { useAnimatedNumber } from './components/useAnimatedNumber';
import {
  IconStar,
  IconDiamond,
  IconBook,
  IconTrophy,
  IconGiftBox,
  IconPaw,
  IconBag,
  IconSword,
  IconCoin,
  IconSave,
  IconGear,
  IconEye,
  IconEyeOff,
  IconExpand,
  IconCollapse,
  type IconProps,
} from './components/icons';

interface TabDef {
  id: PanelId;
  labelKey: string;
  Icon: (props: IconProps) => JSX.Element;
}

// Split the same 9 panels the old bottom-nav exposed into two HUD groups -
// long-term base building bottom-left, high-frequency roster/gacha upkeep
// bottom-right. Every id here must have a case in renderPanel below.
const GROWTH_TABS: TabDef[] = [
  { id: 'ascension', labelKey: 'ascension.title', Icon: IconStar },
  { id: 'ascensionShop', labelKey: 'ascensionShop.title', Icon: IconDiamond },
  { id: 'codex', labelKey: 'codex.title', Icon: IconBook },
  { id: 'records', labelKey: 'records.title', Icon: IconTrophy },
];

const CORE_TABS: TabDef[] = [
  { id: 'gacha', labelKey: 'gacha.title', Icon: IconGiftBox },
  { id: 'pet', labelKey: 'petRoster.title', Icon: IconPaw },
  { id: 'talent', labelKey: 'talent.title', Icon: IconStar },
  { id: 'equipment', labelKey: 'equipment.title', Icon: IconBag },
  { id: 'hero', labelKey: 'heroRoster.title', Icon: IconSword },
];

const ALL_TABS = [...GROWTH_TABS, ...CORE_TABS];

function App() {
  // TitleScreen is the default route (see SaveSystem/useGameStore for the
  // save-slot flow that transitions this to 'game') - the whole existing
  // app shell below only mounts once a slot has been loaded/started.
  const [screen, setScreen] = useState<'title' | 'game'>('title');
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // Owned here (not by BattleScreen) so it can be handed down as a prop -
  // BattleScreen attaches it to the actual `.canvas-stage` div for its own
  // ResizeObserver.
  const stageRef = useRef<HTMLDivElement>(null);

  const activeSlot = useGameStore((state) => state.activeSlot);
  const saveGame = useGameStore((state) => state.saveGame);
  const gold = useGameStore((state) => state.gold);
  const diamonds = useGameStore((state) => state.diamonds);
  const teamPower = useGameStore((state) => state.teamPower);
  // Eased count-up instead of an instant digit snap - see
  // components/useAnimatedNumber.ts.
  const displayedGold = useAnimatedNumber(gold);
  const displayedDiamonds = useAnimatedNumber(diamonds);
  const displayedTeamPower = useAnimatedNumber(teamPower);
  const wave = useGameStore((state) => state.wave);
  const activeTutorialStep = useGameStore((state) => getActiveTutorialStep(state));
  const completeTutorialStep = useGameStore((state) => state.completeTutorialStep);
  const windowMode = useGameStore((state) => state.windowMode);
  const setWindowModeState = useGameStore((state) => state.setWindowMode);
  const pendingSfxEvents = useGameStore((state) => state.pendingSfxEvents);
  const biome = getBiomeForChapter(wave.chapter);

  // Nav-tab red-dot inputs - see NotificationSystem.ts for skill/pet/
  // equipment, otherwise a plain "is this actionable right now" read.
  const skillPoints = useGameStore((state) => state.skillPoints);
  const canAscendNow = useGameStore((state) => state.canAscend);
  const hasUnseenSkills = useGameStore((state) => state.hasUnseenSkills);
  const hasUnseenPets = useGameStore((state) => state.hasUnseenPets);
  const unseenEquipmentCount = useGameStore((state) => state.unseenEquipmentCount);
  const dailyQuestProgress = useGameStore((state) => state.dailyQuestProgress);
  const dailyQuestClaimed = useGameStore((state) => state.dailyQuestClaimed);
  const markSkillsSeen = useGameStore((state) => state.markSkillsSeen);
  const markPetsSeen = useGameStore((state) => state.markPetsSeen);
  const markEquipmentSeen = useGameStore((state) => state.markEquipmentSeen);
  const hasUnclaimedDailyQuest = dailyQuestIds.some(
    (id) => (dailyQuestProgress[id] ?? 0) >= dailyQuestConfig[id].targetAmount && !dailyQuestClaimed[id],
  );
  const tabNotification: Partial<Record<PanelId, boolean>> = {
    hero: hasUnseenSkills,
    pet: hasUnseenPets,
    equipment: unseenEquipmentCount > 0,
    talent: skillPoints > 0,
    ascension: canAscendNow,
    records: hasUnclaimedDailyQuest,
  };

  // Drains GameState.pendingSfxEvents every time GameLoop's onTick produces a
  // new snapshot with a non-empty queue - the engine only ever pushes event
  // ids onto it (see EffectsSystem.queueSfx), this is the one place they
  // actually turn into sound. Keyed on the array reference itself (a fresh
  // array every tick, see useGameStore's snapshotGameState), not its
  // contents, so an empty-to-empty tick is a no-op dependency change.
  useEffect(() => {
    for (const event of pendingSfxEvents) {
      sfxManager.play(event);
    }
  }, [pendingSfxEvents]);

  // Click feedback on every .btn-class button in the app, without touching
  // each of the ~40 call sites individually - capture-phase so it still
  // fires even when a button's own onClick calls stopPropagation (several
  // modal buttons do, see e.g. SettingsPanel's confirm/cancel rows).
  useEffect(() => {
    function handleClickSfx(event: MouseEvent): void {
      if (event.target instanceof Element && event.target.closest('.btn, .hud-btn')) {
        sfxManager.playClick();
      }
    }
    document.addEventListener('click', handleClickSfx, true);
    return () => document.removeEventListener('click', handleClickSfx, true);
  }, []);

  // Background mute - silences BGM/SFX whenever the window isn't the one
  // the player is actually looking at (OS-level focus lost, tab/window
  // hidden) or the game is in stealth mode (shrunk to a corner, meant to run
  // unobtrusively). Layered on top of, not instead of, the player's own
  // mute toggle - see AudioManager/SfxManager's backgroundMuted doc comment.
  // window.blur/focus and document.visibilitychange are plain DOM APIs that
  // work the same in the packaged Electron shell (BrowserWindow's renderer
  // is just a webpage) and the web build, so no Electron IPC is needed here.
  useEffect(() => {
    function applyBackgroundMuted(): void {
      const shouldMute = document.hidden || !document.hasFocus() || windowMode === 'stealth';
      audioManager.setBackgroundMuted(shouldMute);
      sfxManager.setBackgroundMuted(shouldMute);
    }
    applyBackgroundMuted();
    window.addEventListener('blur', applyBackgroundMuted);
    window.addEventListener('focus', applyBackgroundMuted);
    document.addEventListener('visibilitychange', applyBackgroundMuted);
    return () => {
      window.removeEventListener('blur', applyBackgroundMuted);
      window.removeEventListener('focus', applyBackgroundMuted);
      document.removeEventListener('visibilitychange', applyBackgroundMuted);
    };
  }, [windowMode]);
  // "剥洋葱" pacing (unlockConditionConfig.panelUnlockWave) - only render tab
  // buttons for panels the run has actually reached, instead of exposing
  // every system from wave 1.
  const globalWave = getGlobalWaveNumber(wave);
  const visibleGrowthTabs = GROWTH_TABS.filter((tab) => isPanelUnlocked(tab.id, globalWave));
  const visibleCoreTabs = CORE_TABS.filter((tab) => isPanelUnlocked(tab.id, globalWave));

  // Esc backs out one level at a time: exits stealth mode first if that's
  // active (its whole point is hiding every button, so a keyboard escape
  // hatch matters more here than anywhere else), then fullscreen (the usual
  // OS convention), then closes a growth/core panel modal if one's open,
  // otherwise toggles the settings panel itself - same "esc always does
  // something sensible" convention as any pause menu.
  useEffect(() => {
    if (screen !== 'game') {
      return;
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') {
        return;
      }
      if (windowMode !== 'default') {
        setWindowModeState('default');
        applyWindowMode('default');
        return;
      }
      if (activePanel !== null) {
        setActivePanel(null);
        return;
      }
      setIsSettingsOpen((open) => !open);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen, activePanel, windowMode, setWindowModeState]);

  // Entering stealth force-closes any open panel/settings first - nothing
  // would be left to show it, since stealth hides every button that could
  // have opened one of these. Fullscreen<->default has no such concern.
  function handleSetWindowMode(mode: 'default' | 'fullscreen' | 'stealth'): void {
    if (mode === 'stealth') {
      setActivePanel(null);
      setIsSettingsOpen(false);
    }
    setWindowModeState(mode);
    applyWindowMode(mode);
  }

// Opening the exact panel a tutorial step is pointing at counts as having
  // acted on it - dismisses the bubble the same as its own "知道了" button,
  // so the player isn't left with a stale spotlight ring around a nav
  // button they already clicked.
  function handleTabClick(tabId: PanelId): void {
    setActivePanel(tabId);
    if (activeTutorialStep?.targetSelector === `nav-${tabId}`) {
      completeTutorialStep(activeTutorialStep.id);
    }
    // Clears that tab's red dot - talent/ascension/records need no explicit
    // clear here, their dot is a direct read of actionable state that clears
    // itself when spent/ascended/claimed (see tabNotification above).
    if (tabId === 'hero') {
      markSkillsSeen();
    } else if (tabId === 'pet') {
      markPetsSeen();
    } else if (tabId === 'equipment') {
      markEquipmentSeen();
    }
  }

  function handleSaveClick(): void {
    if (activeSlot === null) {
      return;
    }
    saveGame(activeSlot);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1500);
    if (activeTutorialStep?.targetSelector === 'save-button') {
      completeTutorialStep(activeTutorialStep.id);
    }
  }

  if (screen === 'title') {
    return (
      <>
        <TitleScreen onEnterGame={() => setScreen('game')} />
        <UpdateBanner />
      </>
    );
  }

  function renderPanel(id: PanelId) {
    switch (id) {
      case 'hero':
        return <HeroPanel />;
      case 'pet':
        return <PetPanel />;
      case 'equipment':
        return <EquipmentPanel />;
      case 'gacha':
        return <GachaPanel />;
      case 'codex':
        return <CodexPanel />;
      case 'talent':
        return <TalentPanel />;
      case 'ascension':
        return <AscensionPanel />;
      case 'ascensionShop':
        return <AscensionShopPanel />;
      case 'records':
        return <RecordsPanel />;
    }
  }

  const activeTab = ALL_TABS.find((tab) => tab.id === activePanel);

  return (
    <div className="app-container">
      <div className="battle-layer">
        <BattleScreen stageRef={stageRef} />
      </div>

      <div className="window-mode-cluster">
        {windowMode === 'stealth' ? (
          <button className="window-mode-btn" onClick={() => handleSetWindowMode('default')} title={t('battle.stealthModeOff')}>
            <IconEyeOff />
          </button>
        ) : (
          <>
            <button
              className="window-mode-btn"
              onClick={() => handleSetWindowMode(windowMode === 'fullscreen' ? 'default' : 'fullscreen')}
              title={t(windowMode === 'fullscreen' ? 'battle.fullscreenOff' : 'battle.fullscreenOn')}
            >
              {windowMode === 'fullscreen' ? <IconCollapse /> : <IconExpand />}
            </button>
            <button className="window-mode-btn" onClick={() => handleSetWindowMode('stealth')} title={t('battle.stealthModeOn')}>
              <IconEye />
            </button>
          </>
        )}
      </div>

      {windowMode !== 'stealth' && (
      <div className="hud-layer">
        {/* Progress identity - current chapter/biome, not a fabricated
            player name or power score (this game has neither concept).
            Single-protagonist redesign removed the old squad-size readout
            here (deployedHeroIds.length/maxDeployedHeroes) - always 1/9 now
            that there's exactly one hero, so it stopped conveying anything. */}
        <div className="hud-corner top-left">
          <div className="hud-widget">
            <div className="hud-label">
              {t('wave.stage')} {wave.chapter}-{wave.waveInChapter} · {t(biome.labelKey)}
            </div>
          </div>
        </div>

        <div className="hud-corner top-right">
          <div className="hud-widget">
            <div className="hud-widget-row">
              <span className="hud-gold"><IconCoin /> {formatBigNumber(displayedGold)}</span>
              <span className="hud-diamond"><IconDiamond /> {formatBigNumber(displayedDiamonds)}</span>
              {activeSlot !== null && (
                <button className="btn btn-sm mute-toggle-btn" data-tutorial="save-button" onClick={handleSaveClick} title={t('save.saveButton')}>
                  {justSaved ? '✓' : <IconSave />}
                </button>
              )}
              <button className="btn btn-sm mute-toggle-btn" onClick={() => setIsSettingsOpen(true)} title={t('settings.title')}>
                <IconGear />
              </button>
            </div>
            <div className="hud-label">
              {t('power.team')}: {formatBigNumber(displayedTeamPower)}
            </div>
          </div>
        </div>

        <div className="hud-corner bottom-left">
          <div className="hud-actions">
            {visibleGrowthTabs.map((tab) => (
              <button key={tab.id} className="hud-btn" data-tutorial={`nav-${tab.id}`} onClick={() => handleTabClick(tab.id)}>
                <span className="hud-btn-icon">
                  <tab.Icon />
                  {tabNotification[tab.id] && <span className="nav-notification-dot" />}
                </span>
                <span>{t(tab.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="hud-corner bottom-right">
          <div className="hud-actions">
            {visibleCoreTabs.map((tab) => (
              <button key={tab.id} className="hud-btn" data-tutorial={`nav-${tab.id}`} onClick={() => handleTabClick(tab.id)}>
                <span className="hud-btn-icon">
                  <tab.Icon />
                  {tabNotification[tab.id] && <span className="nav-notification-dot" />}
                </span>
                <span>{t(tab.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      )}

      {activeTab && (
        <div className="modal-backdrop" onClick={() => setActivePanel(null)}>
          <div className="modal-container" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                <activeTab.Icon /> {t(activeTab.labelKey)}
              </span>
              <button className="modal-close" onClick={() => setActivePanel(null)}>
                ×
              </button>
            </div>
            <div className="modal-content">{renderPanel(activeTab.id)}</div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <SettingsPanel
          onClose={() => setIsSettingsOpen(false)}
          onReturnToTitle={() => {
            setIsSettingsOpen(false);
            setActivePanel(null);
            setScreen('title');
          }}
        />
      )}

      <EquipmentDropToast />
      <StoryDialog />
      {activePanel === null && !isSettingsOpen && <TutorialOverlay />}
      <UpdateBanner />
    </div>
  );
}

export default App;
