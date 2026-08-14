import { useEffect, useRef, useState, type RefObject } from 'react';
import { ensureGameLoopStarted, ensureAutosaveStarted, useGameStore } from '../store/useGameStore';
import { renderScene, drawBackground, drawVignette, drawDeploySlots, preloadBattleSprites } from '../render/CanvasRenderer';
import { t } from '../locales/i18n';
import { getNormalWaveEnemyCount } from '../data/waveConfig';
import { getBiomeForChapter, bossMusicTracks } from '../data/biomeConfig';
import { layoutSlotPositions } from '../data/mapConfig';
import { getMaxDeployedHeroes } from '../data/squadConfig';
import { formatBigNumber } from '../utils/scaling';
import { audioManager } from '../audio/AudioManager';
import { speedTiers } from '../data/speedConfig';
import { getGlobalWaveNumber } from '../engine/systems/WaveSystem';
import { useAnimatedNumber } from './useAnimatedNumber';

// Logical simulation/coordinate space - every entity position in
// mapConfig.ts and every fixed pixel size in CanvasRenderer.ts is authored
// against this resolution. Never changed at runtime; the canvas is instead
// scaled up to fill whatever screen it's on (see BattleScreen's
// ResizeObserver + ctx.setTransform below), so no engine or renderer code
// needs to know about screen size at all.
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 300;

// stageRef is owned by App.tsx (not created here) - App also hands the same
// ref to HeroPanel (rendered inside its centered modal, a sibling of this
// component, not a child) so hero-card drags can hit-test against this
// element's bounding rect regardless of which component actually renders
// the drag source.
function BattleScreen({ stageRef }: { stageRef: RefObject<HTMLDivElement> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [displaySize, setDisplaySize] = useState({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
  const heroes = useGameStore((state) => state.deployedHeroes);
  const pets = useGameStore((state) => state.pets);
  const activePetId = useGameStore((state) => state.activePetId);
  const enemies = useGameStore((state) => state.enemies);
  const visualEffects = useGameStore((state) => state.visualEffects);
  const screenShakeIntensity = useGameStore((state) => state.screenShakeIntensity);
  const bossIntroRemaining = useGameStore((state) => state.bossIntroRemaining);
  const victoryPoseRemaining = useGameStore((state) => state.victoryPoseRemaining);
  const isGameOver = useGameStore((state) => state.isGameOver);
  const wave = useGameStore((state) => state.wave);
  const dragPreviewKind = useGameStore((state) => state.dragPreviewKind);
  const teamPower = useGameStore((state) => state.teamPower);
  const recommendedPower = useGameStore((state) => state.recommendedPower);
  const displayedTeamPower = useAnimatedNumber(teamPower);
  const speedMultiplier = useGameStore((state) => state.speedMultiplier);
  const setSpeedMultiplier = useGameStore((state) => state.setSpeedMultiplier);
  const isStealthMode = useGameStore((state) => state.windowMode === 'stealth');

  const biome = getBiomeForChapter(wave.chapter);
  const globalWave = getGlobalWaveNumber(wave);
  // Single-protagonist redesign: mapConfig.layoutSlotPositions() now always
  // hands back exactly one position - this grid only still exists to draw
  // the roster-panel drag-in preview (dragPreviewKind === 'hero').
  const maxDeployedHeroes = getMaxDeployedHeroes(globalWave);
  const slotPositions = layoutSlotPositions();
  const occupiedSlotIndices = new Set(
    heroes.map((hero) => hero.deployedSlotIndex).filter((index): index is number => index !== null),
  );

  useEffect(() => {
    ensureGameLoopStarted();
    ensureAutosaveStarted();
    preloadBattleSprites();
  }, []);

  // Boss waves swap in a dedicated theme instead of the biome's ambient
  // track, reverting automatically once the wave clears (wave.isBossWave
  // goes false, musicTrack recalculates back to biome.musicTrack below).
  const musicTrack = wave.isBossWave && wave.bossKind ? bossMusicTracks[wave.bossKind] : biome.musicTrack;

  useEffect(() => {
    audioManager.setTrack(musicTrack);
  }, [musicTrack]);

  // Auto-detects available screen space instead of staying pinned at a
  // fixed 400x300 - the canvas-stage element's CSS (width:100%, height:100%)
  // decides the actual size, this just measures whatever that resolves to
  // on this screen. ResizeObserver is the primary signal (it catches any
  // layout change affecting .canvas-stage, not just the window itself -
  // orientation changes, mobile browser chrome show/hide, etc.) - the
  // plain window 'resize' listener alongside it is a deliberately redundant
  // second trigger for the common case, re-measuring the same element via
  // getBoundingClientRect so a window resize is reflected even in the
  // unlikely event the observer callback doesn't fire for some reason.
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

    const handleWindowResize = (): void => {
      const rect = stage.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDisplaySize({ width: rect.width, height: rect.height });
      }
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [stageRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) {
      return;
    }

    // Render at native device resolution (crisp on high-DPI screens) while
    // every entity/effect draw call still targets the fixed CANVAS_WIDTH/
    // CANVAS_HEIGHT coordinate space. .canvas-stage fills the whole viewport
    // (see index.css) instead of a 4:3 box, so its aspect ratio can differ
    // wildly from the game world's - a uniform scale (not independent x/y
    // stretch) plus centering keeps the world undistorted rather than
    // stretched. The background is the one thing that does NOT go through
    // this scale/letterbox transform - see drawBackground's doc comment for
    // why: drawn here first, at the identity transform and the real
    // pixelWidth/pixelHeight, it cover-fits the actual screen edge-to-edge
    // (any leftover margin around the letterboxed entity layer is real
    // background, not a solid color bar).
    const devicePixelRatio = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(displaySize.width * devicePixelRatio);
    const pixelHeight = Math.round(displaySize.height * devicePixelRatio);
    if (canvas.width !== pixelWidth) {
      canvas.width = pixelWidth;
    }
    if (canvas.height !== pixelHeight) {
      canvas.height = pixelHeight;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    drawBackground(ctx, pixelWidth, pixelHeight, biome, enemies.length > 0);
    drawVignette(ctx, pixelWidth, pixelHeight);

    const scale = Math.min(pixelWidth / CANVAS_WIDTH, pixelHeight / CANVAS_HEIGHT);
    const offsetX = (pixelWidth - CANVAS_WIDTH * scale) / 2;
    const offsetY = (pixelHeight - CANVAS_HEIGHT * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);

    // Only the deployed pet (if any) renders on the field - every other
    // owned pet still contributes its passive bonus (see
    // HeroStatsSystem.computePetPassiveBonuses), it just isn't drawn here.
    const activePets = activePetId ? pets.filter((pet) => pet.id === activePetId) : [];
    renderScene(ctx, heroes, activePets, enemies, visualEffects, screenShakeIntensity, victoryPoseRemaining > 0);

    // Drag-in-from-roster preview grid only now (canvas-native reposition
    // drag removed - nothing to rearrange with a single fixed protagonist).
    if (dragPreviewKind === 'hero') {
      drawDeploySlots(ctx, slotPositions, occupiedSlotIndices, maxDeployedHeroes);
    }
  }, [heroes, pets, activePetId, enemies, visualEffects, screenShakeIntensity, victoryPoseRemaining, displaySize, biome, dragPreviewKind, wave, slotPositions, occupiedSlotIndices, maxDeployedHeroes]);

  const aliveHeroCount = heroes.filter((hero) => !hero.isDowned).length;

  // Derived, not stored - WaveState only tracks the spawn countdown, so
  // "killed so far" is total minus what's left to spawn minus what's still
  // alive on the field. Boss waves have no meaningful kill count (single
  // target), so they keep the existing timer readout instead.
  const totalWaveEnemies = getNormalWaveEnemyCount(wave.chapter);
  const killedCount = Math.max(
    0,
    Math.min(totalWaveEnemies, totalWaveEnemies - wave.enemiesRemainingToSpawn - enemies.length),
  );
  const killRatio = totalWaveEnemies > 0 ? killedCount / totalWaveEnemies : 0;

  // Captured into a plain const (rather than read as wave.bossKind inline
  // below) so TypeScript's null-narrowing survives into the JSX closure that
  // uses it - narrowing a property access like `wave.bossKind` doesn't
  // persist across a function boundary the way narrowing a local const does.
  const bossKind = wave.isBossWave ? wave.bossKind : undefined;

  return (
    <div className="stage-column">
      {/* Combat-status readout - kept here (not lifted to App's HUD) since
          it's derived from enemies/wave state this component already
          computes for its own render loop. Uses the same .hud-corner/
          .hud-widget classes as App's chrome so it reads as one system.
          Hidden in stealth mode along with the rest of App's HUD - see
          App.tsx's stealth-toggle-btn. */}
      {!isStealthMode && (
      <div className="hud-corner top-center" data-tutorial="battle-hud">
        <div className="hud-widget" style={{ width: '100%' }}>
          <div className="hud-widget-row" style={{ justifyContent: 'space-between', fontSize: 11 }}>
            <span>
              {t('wave.stage')} {wave.chapter}-{wave.waveInChapter} · {t(biome.labelKey)}
              {bossKind && (
                <>
                  {' · '}
                  {t(bossKind === 'boss' ? 'wave.boss' : 'wave.miniboss')}
                </>
              )}
            </span>
            {wave.isBossWave && wave.timeRemaining !== undefined ? (
              <span>{Math.ceil(wave.timeRemaining)}s</span>
            ) : (
              <span>
                {killedCount}/{totalWaveEnemies}
              </span>
            )}
          </div>
          {!wave.isBossWave && (
            <div className="bar-track">
              <div className="bar-fill bar-fill-kill" style={{ width: `${killRatio * 100}%` }} />
            </div>
          )}
          <div className="hud-label" style={{ marginTop: 4 }}>
            {t('power.recommended')} {formatBigNumber(recommendedPower)}
            {' · '}
            <span className={teamPower >= recommendedPower ? 'text-power-ok' : 'text-power-low'}>
              {t('power.team')} {formatBigNumber(displayedTeamPower)}
            </span>
          </div>
          <div className="hud-label" style={{ marginTop: 4 }}>
            {t('battle.aliveHeroes')} {aliveHeroCount}/{heroes.length}
          </div>
          <div className="bar-track">
            <div
              className="bar-fill bar-fill-hp"
              style={{ width: `${heroes.length > 0 ? (aliveHeroCount / heroes.length) * 100 : 0}%` }}
            />
          </div>
          <div className="speed-control-row">
            {speedTiers.map((tier) => {
              const unlocked = globalWave >= tier.requiredWave;
              return (
                <button
                  key={tier.multiplier}
                  className={`btn btn-sm speed-btn${speedMultiplier === tier.multiplier ? ' btn-primary' : ''}`}
                  disabled={!unlocked}
                  title={unlocked ? undefined : `${t('battle.speedLocked')} ${tier.requiredWave}`}
                  onClick={() => setSpeedMultiplier(tier.multiplier)}
                >
                  x{tier.multiplier}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      )}

      <div className="canvas-stage" ref={stageRef}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
        {isGameOver && <div className="game-over-overlay">{t('battle.gameOver')}</div>}
        {/* Boss-appeared dramatic pause (GameState.bossIntroRemaining, set by
            SpawnSystem.tickSpawn) - GameLoop freezes every gameplay system
            for the same duration, so this banner is on screen for the exact
            window nothing can act yet. */}
        {bossIntroRemaining > 0 && bossKind && (
          <div className="boss-intro-banner">
            <div className="boss-intro-banner-kind">{t(bossKind === 'boss' ? 'wave.boss' : 'wave.miniboss')}</div>
            <div className="boss-intro-banner-label">{t('wave.incoming')}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BattleScreen;
