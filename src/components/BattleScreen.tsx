import { useEffect, useRef, useState } from 'react';
import { ensureGameLoopStarted, upgradeableStats, useGameStore } from '../store/useGameStore';
import { renderScene } from '../render/CanvasRenderer';
import { t } from '../locales/i18n';
import { heroUpgradeConfig, type UpgradeableStat } from '../data/heroConfig';
import EquipmentPanel from './EquipmentPanel';
import HeroPanel from './HeroPanel';
import PetPanel from './PetPanel';
import AscensionPanel from './AscensionPanel';
import GachaPanel from './GachaPanel';
import CodexPanel from './CodexPanel';
import CastlePanel from './CastlePanel';
import TowerPanel from './TowerPanel';
import TalentPanel from './TalentPanel';

// Logical simulation/coordinate space - every entity position in
// mapConfig.ts and every fixed pixel size in CanvasRenderer.ts is authored
// against this resolution. Never changed at runtime; the canvas is instead
// scaled up to fill whatever screen it's on (see BattleScreen's
// ResizeObserver + ctx.setTransform below), so no engine or renderer code
// needs to know about screen size at all.
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 300;

const STAT_LABEL_KEYS: Record<UpgradeableStat, string> = {
  attackDamage: 'hero.attackDamage',
  attackSpeed: 'hero.attackSpeed',
  maxHp: 'hero.maxHp',
  criticalChance: 'hero.criticalChance',
  attackRange: 'hero.attackRange',
};

type TabId = 'castle' | 'hero' | 'pet' | 'tower' | 'equipment' | 'gacha' | 'codex' | 'talent' | 'ascension';

// Bottom icon-nav order - each opens the same, unmodified panel component as
// an overlay sheet instead of an inline tab. Icons are decorative only; the
// label text is unchanged from the old tab bar.
const TABS: { id: TabId; labelKey: string; icon: string }[] = [
  { id: 'castle', labelKey: 'castle.title', icon: '🏰' },
  { id: 'hero', labelKey: 'heroRoster.title', icon: '⚔️' },
  { id: 'pet', labelKey: 'petRoster.title', icon: '🐾' },
  { id: 'tower', labelKey: 'tower.title', icon: '🗼' },
  { id: 'equipment', labelKey: 'equipment.title', icon: '🎒' },
  { id: 'gacha', labelKey: 'gacha.title', icon: '🎰' },
  { id: 'codex', labelKey: 'codex.title', icon: '📖' },
  { id: 'talent', labelKey: 'talent.title', icon: '✨' },
  { id: 'ascension', labelKey: 'ascension.title', icon: '🌟' },
];

function formatStatValue(stat: UpgradeableStat, value: number): string {
  if (stat === 'criticalChance') {
    return `${Math.round(value * 100)}%`;
  }
  if (stat === 'attackSpeed') {
    return value.toFixed(2);
  }
  return Math.round(value).toString();
}

function renderPanel(id: TabId) {
  switch (id) {
    case 'castle':
      return <CastlePanel />;
    case 'hero':
      return <HeroPanel />;
    case 'pet':
      return <PetPanel />;
    case 'tower':
      return <TowerPanel />;
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
  }
}

function BattleScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [displaySize, setDisplaySize] = useState({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
  const [openPanel, setOpenPanel] = useState<TabId | null>(null);
  const heroes = useGameStore((state) => state.deployedHeroes);
  const pets = useGameStore((state) => state.deployedPets);
  const towers = useGameStore((state) => state.deployedTowers);
  const enemies = useGameStore((state) => state.enemies);
  const base = useGameStore((state) => state.base);
  const visualEffects = useGameStore((state) => state.visualEffects);
  const gold = useGameStore((state) => state.gold);
  const isGameOver = useGameStore((state) => state.isGameOver);
  const upgradeStat = useGameStore((state) => state.upgradeStat);
  const difficultyScore = useGameStore((state) => state.difficultyScore);
  const upgradeCosts = useGameStore((state) => state.upgradeCosts);
  const upgradeMaxed = useGameStore((state) => state.upgradeMaxed);
  const globalUpgrades = useGameStore((state) => state.globalUpgrades);
  const wave = useGameStore((state) => state.wave);

  useEffect(() => {
    ensureGameLoopStarted();
  }, []);

  // Auto-detects available screen space instead of staying pinned at a
  // fixed 400x300 - the canvas-stage element's CSS (width:100%, 4:3
  // aspect-ratio, capped by viewport height) decides the actual size, this
  // just measures whatever that resolves to on this screen.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setDisplaySize({ width, height });
      }
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) {
      return;
    }

    // Render at native device resolution (crisp on high-DPI screens) while
    // every draw call still targets the fixed CANVAS_WIDTH/CANVAS_HEIGHT
    // coordinate space - the transform is what actually stretches the game
    // world up to fill the larger canvas, so CanvasRenderer/mapConfig never
    // need to know the real screen size.
    const devicePixelRatio = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(displaySize.width * devicePixelRatio);
    const pixelHeight = Math.round(displaySize.height * devicePixelRatio);
    if (canvas.width !== pixelWidth) {
      canvas.width = pixelWidth;
    }
    if (canvas.height !== pixelHeight) {
      canvas.height = pixelHeight;
    }
    ctx.setTransform(pixelWidth / CANVAS_WIDTH, 0, 0, pixelHeight / CANVAS_HEIGHT, 0, 0);

    renderScene(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, heroes, pets, enemies, base, visualEffects, towers);
  }, [heroes, pets, enemies, base, visualEffects, towers, displaySize]);

  const hpRatio = base.maxHp > 0 ? Math.max(0, Math.min(1, base.currentHp / base.maxHp)) : 0;
  const activeTab = TABS.find((tab) => tab.id === openPanel);

  return (
    <div className="game-shell">
      <div className="hud-compact">
        <div className="hud-currency-row">
          <span className="hud-gold">
            {t('battle.gold')}: {gold}
          </span>
          <span>
            {t('difficulty.tier')}: {Math.floor(difficultyScore)}
          </span>
        </div>
        <div className="hud-sub-row">
          <span>
            {t('wave.stage')} {wave.chapter}-{wave.waveInChapter}
            {wave.isBossWave ? ` · ${t(wave.bossKind === 'boss' ? 'wave.boss' : 'wave.miniboss')}` : ''}
          </span>
          {wave.isBossWave && wave.timeRemaining !== undefined && (
            <span>
              {t('wave.timeRemaining')}: {Math.ceil(wave.timeRemaining)}s
            </span>
          )}
        </div>
        <div className="hud-sub-row">
          <span>
            {t('base.hp')}: {Math.round(base.currentHp)} / {Math.round(base.maxHp)}
          </span>
        </div>
        <div className="bar-track">
          <div className="bar-fill bar-fill-hp" style={{ width: `${hpRatio * 100}%` }} />
        </div>
      </div>

      <div className="canvas-stage" ref={stageRef}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        {isGameOver && <div className="game-over-overlay">{t('battle.gameOver')}</div>}

        <div className="quick-upgrade-box">
          {upgradeableStats.map((stat) => {
            const cost = upgradeCosts[stat];
            const maxed = upgradeMaxed[stat];
            const currentBonus = globalUpgrades[stat] * heroUpgradeConfig[stat].valuePerLevel;

            return (
              <button
                key={stat}
                className="btn quick-upgrade-btn"
                onClick={() => upgradeStat(stat)}
                disabled={isGameOver || maxed || gold < cost}
              >
                <span className="stat-btn-label">{t(STAT_LABEL_KEYS[stat])}</span>
                <span className="stat-btn-value">
                  {formatStatValue(stat, currentBonus)}
                  {maxed ? ` (${t('battle.maxed')})` : ` · ${cost}${t('battle.gold')}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bottom-nav">
        <div className="bottom-nav-inner">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`bottom-nav-btn${openPanel === tab.id ? ' active' : ''}`}
              onClick={() => setOpenPanel(tab.id)}
            >
              <span className="bottom-nav-icon">{tab.icon}</span>
              <span>{t(tab.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      {activeTab && (
        <>
          <div className="sheet-backdrop" onClick={() => setOpenPanel(null)} />
          <div className="sheet-panel">
            <div className="sheet-header">
              <span className="sheet-title">
                {activeTab.icon} {t(activeTab.labelKey)}
              </span>
              <button className="sheet-close" onClick={() => setOpenPanel(null)}>
                ×
              </button>
            </div>
            {renderPanel(activeTab.id)}
          </div>
        </>
      )}
    </div>
  );
}

export default BattleScreen;
