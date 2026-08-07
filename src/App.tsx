import { useEffect, useRef, useState } from 'react';
import BattleScreen from './components/BattleScreen';
import TitleScreen from './components/TitleScreen';
import StoryDialog from './components/StoryDialog';
import DebugPanel from './components/DebugPanel';
import HeroPanel from './components/HeroPanel';
import EquipmentPanel from './components/EquipmentPanel';
import TalentPanel from './components/TalentPanel';
import PetPanel from './components/PetPanel';
import GachaPanel from './components/GachaPanel';
import CodexPanel from './components/CodexPanel';
import CastlePanel from './components/CastlePanel';
import AscensionPanel from './components/AscensionPanel';
import AscensionShopPanel from './components/AscensionShopPanel';
import { getBiomeForChapter } from './data/biomeConfig';
import { formatBigNumber } from './data/scaling';
import { isPanelUnlocked, type PanelId } from './data/unlockConditionConfig';
import { getGlobalWaveNumber } from './engine/systems/WaveSystem';
import { t } from './locales/i18n';
import { audioManager } from './audio/AudioManager';
import { useGameStore } from './store/useGameStore';

interface TabDef {
  id: PanelId;
  labelKey: string;
  icon: string;
}

// Split the same 9 panels the old bottom-nav exposed into two HUD groups -
// long-term base building bottom-left, high-frequency roster/gacha upkeep
// bottom-right. Every id here must have a case in renderPanel below.
const GROWTH_TABS: TabDef[] = [
  { id: 'castle', labelKey: 'castle.title', icon: '🏰' },
  { id: 'ascension', labelKey: 'ascension.title', icon: '🌟' },
  { id: 'ascensionShop', labelKey: 'ascensionShop.title', icon: '💎' },
  { id: 'codex', labelKey: 'codex.title', icon: '📖' },
];

const CORE_TABS: TabDef[] = [
  { id: 'gacha', labelKey: 'gacha.title', icon: '🎰' },
  { id: 'pet', labelKey: 'petRoster.title', icon: '🐾' },
  { id: 'talent', labelKey: 'talent.title', icon: '✨' },
  { id: 'equipment', labelKey: 'equipment.title', icon: '🎒' },
  { id: 'hero', labelKey: 'heroRoster.title', icon: '⚔️' },
];

const ALL_TABS = [...GROWTH_TABS, ...CORE_TABS];

function App() {
  // TitleScreen is the default route (see SaveSystem/useGameStore for the
  // save-slot flow that transitions this to 'game') - the whole existing
  // app shell below only mounts once a slot has been loaded/started.
  const [screen, setScreen] = useState<'title' | 'game'>('title');
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);
  const [isMuted, setIsMuted] = useState(() => audioManager.isMuted());
  const [justSaved, setJustSaved] = useState(false);
  // Owned here (not by BattleScreen) because HeroPanel now renders inside
  // this component's modal - a sibling of BattleScreen, not a child - but
  // still needs the battle canvas's bounding rect for drag-to-deploy
  // hit-testing (see useDeploySlotDrag).
  const stageRef = useRef<HTMLDivElement>(null);

  const activeSlot = useGameStore((state) => state.activeSlot);
  const saveGame = useGameStore((state) => state.saveGame);
  const gold = useGameStore((state) => state.gold);
  const diamonds = useGameStore((state) => state.diamonds);
  const buildMaterials = useGameStore((state) => state.buildMaterials);
  const difficultyScore = useGameStore((state) => state.difficultyScore);
  const castleLevel = useGameStore((state) => state.castleLevel);
  const wave = useGameStore((state) => state.wave);
  const biome = getBiomeForChapter(wave.chapter);
  // "剥洋葱" pacing (unlockConditionConfig.panelUnlockWave) - only render tab
  // buttons for panels the run has actually reached, instead of exposing
  // every system from wave 1.
  const globalWave = getGlobalWaveNumber(wave);
  const visibleGrowthTabs = GROWTH_TABS.filter((tab) => isPanelUnlocked(tab.id, globalWave));
  const visibleCoreTabs = CORE_TABS.filter((tab) => isPanelUnlocked(tab.id, globalWave));

  // Browsers block audio.play() until a user gesture happens anywhere on the
  // page - this listens once for the first pointer interaction and unlocks
  // whatever biome track is already loaded.
  useEffect(() => {
    const unlock = () => audioManager.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  function handleSaveClick(): void {
    if (activeSlot === null) {
      return;
    }
    saveGame(activeSlot);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1500);
  }

  if (screen === 'title') {
    return <TitleScreen onEnterGame={() => setScreen('game')} />;
  }

  function renderPanel(id: PanelId) {
    switch (id) {
      case 'castle':
        return <CastlePanel />;
      case 'hero':
        return <HeroPanel gameScreenRef={stageRef} />;
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
    }
  }

  const activeTab = ALL_TABS.find((tab) => tab.id === activePanel);

  return (
    <div className="app-container">
      <div className="battle-layer">
        <BattleScreen stageRef={stageRef} />
      </div>

      <div className="hud-layer">
        {/* Base/progress identity - real castle level and current
            chapter/biome, not a fabricated player name or power score
            (this game has neither concept). */}
        <div className="hud-corner top-left">
          <div className="hud-widget">
            <div className="hud-widget-row">
              <span>🏰 {t('castle.level')} {castleLevel}</span>
              <span>🧱 {formatBigNumber(buildMaterials)}</span>
            </div>
            <div className="hud-label">
              {t('wave.stage')} {wave.chapter}-{wave.waveInChapter} · {t(biome.labelKey)}
            </div>
          </div>
        </div>

        <div className="hud-corner top-right">
          <div className="hud-widget">
            <div className="hud-widget-row">
              <span className="hud-gold">💰 {formatBigNumber(gold)}</span>
              <span className="hud-diamond">💎 {formatBigNumber(diamonds)}</span>
              {activeSlot !== null && (
                <button className="btn btn-sm mute-toggle-btn" onClick={handleSaveClick} title={t('save.saveButton')}>
                  {justSaved ? '✅' : '💾'}
                </button>
              )}
              <button
                className="btn btn-sm mute-toggle-btn"
                onClick={() => setIsMuted(audioManager.toggleMute())}
                title={t(isMuted ? 'battle.unmuteMusic' : 'battle.muteMusic')}
              >
                {isMuted ? '🔇' : '🔊'}
              </button>
            </div>
            <div className="hud-label">
              {t('difficulty.tier')}: {Math.floor(difficultyScore)}
            </div>
          </div>
        </div>

        <div className="hud-corner bottom-left">
          <div className="hud-actions">
            {visibleGrowthTabs.map((tab) => (
              <button key={tab.id} className="hud-btn" onClick={() => setActivePanel(tab.id)}>
                <span className="hud-btn-icon">{tab.icon}</span>
                <span>{t(tab.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="hud-corner bottom-right">
          <div className="hud-actions">
            {visibleCoreTabs.map((tab) => (
              <button key={tab.id} className="hud-btn" onClick={() => setActivePanel(tab.id)}>
                <span className="hud-btn-icon">{tab.icon}</span>
                <span>{t(tab.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab && (
        <div className="modal-backdrop" onClick={() => setActivePanel(null)}>
          <div className="modal-container" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                {activeTab.icon} {t(activeTab.labelKey)}
              </span>
              <button className="modal-close" onClick={() => setActivePanel(null)}>
                ×
              </button>
            </div>
            <div className="modal-content">{renderPanel(activeTab.id)}</div>
          </div>
        </div>
      )}

      <StoryDialog />

      <DebugPanel />
    </div>
  );
}

export default App;
