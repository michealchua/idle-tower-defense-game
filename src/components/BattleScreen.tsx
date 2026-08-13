import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { ensureGameLoopStarted, ensureAutosaveStarted, useGameStore } from '../store/useGameStore';
import { renderScene, drawBackground, drawVignette, drawDeploySlots, drawSwapHighlight, drawSwapGhost, preloadBattleSprites, HERO_RADIUS } from '../render/CanvasRenderer';
import { t } from '../locales/i18n';
import { getNormalWaveEnemyCount } from '../data/waveConfig';
import { getBiomeForChapter, bossMusicTracks } from '../data/biomeConfig';
import { layoutSlotPositions, mapConfig } from '../data/mapConfig';
import { getMaxDeployedHeroes } from '../data/squadConfig';
import type { Position } from '../engine/types';
import { formatBigNumber } from '../utils/scaling';
import { audioManager } from '../audio/AudioManager';
import { speedTiers } from '../data/speedConfig';
import { getGlobalWaveNumber } from '../engine/systems/WaveSystem';

// Logical simulation/coordinate space - every entity position in
// mapConfig.ts and every fixed pixel size in CanvasRenderer.ts is authored
// against this resolution. Never changed at runtime; the canvas is instead
// scaled up to fill whatever screen it's on (see BattleScreen's
// ResizeObserver + ctx.setTransform below), so no engine or renderer code
// needs to know about screen size at all.
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 300;

// How far (in logical canvas units) a pointer can be from a hero's center
// and still grab it - wider than the drawn radius for an easier grab. Pets
// have no canvas drag interaction (see PetSystem.ts - every owned pet is
// always active, nothing to deploy/reposition).
const HERO_HIT_RADIUS = HERO_RADIUS * 1.4;

// How far a pointer can be from a grid cell's center and still target it for
// drop - half the smaller of the two grid spacings, so adjacent cells' hit
// areas don't overlap.
const SLOT_HIT_RADIUS = Math.min(mapConfig.heroColSpacing, mapConfig.heroRowSpacing) / 2;

interface CanvasDragState {
  kind: 'hero';
  id: string;
  // Logical canvas coordinates (same space as entity positions), not screen
  // pixels - lets the draw effect place the ghost/highlights directly.
  pointerX: number;
  pointerY: number;
  // Index into the fixed slot grid (mapConfig.layoutSlotPositions), not a
  // hero id - dropping now targets a specific cell (empty or occupied)
  // instead of only ever another hero, see HeroSystem.moveHeroToSlot.
  hoverSlotIndex: number | null;
}

// Nearest hero within radius, excluding the one currently being dragged.
function findNearestUnit<T extends { id: string; position: { x: number; y: number } }>(
  units: T[],
  point: { x: number; y: number },
  radius: number,
  excludeId?: string,
): T | undefined {
  let closest: T | undefined;
  let closestDistance = radius;
  for (const unit of units) {
    if (unit.id === excludeId) {
      continue;
    }
    const distance = Math.hypot(unit.position.x - point.x, unit.position.y - point.y);
    if (distance <= closestDistance) {
      closest = unit;
      closestDistance = distance;
    }
  }
  return closest;
}

// Nearest grid cell within radius - used to resolve a canvas-native
// hero-reposition drag's drop target, see CanvasDragState.hoverSlotIndex.
function findNearestSlotIndex(positions: Position[], point: Position, radius: number): number | null {
  let closest: number | null = null;
  let closestDistance = radius;
  positions.forEach((position, index) => {
    const distance = Math.hypot(position.x - point.x, position.y - point.y);
    if (distance <= closestDistance) {
      closest = index;
      closestDistance = distance;
    }
  });
  return closest;
}

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
  const enemies = useGameStore((state) => state.enemies);
  const visualEffects = useGameStore((state) => state.visualEffects);
  const screenShakeIntensity = useGameStore((state) => state.screenShakeIntensity);
  const isGameOver = useGameStore((state) => state.isGameOver);
  const wave = useGameStore((state) => state.wave);
  const dragPreviewKind = useGameStore((state) => state.dragPreviewKind);
  const teamPower = useGameStore((state) => state.teamPower);
  const recommendedPower = useGameStore((state) => state.recommendedPower);
  const speedMultiplier = useGameStore((state) => state.speedMultiplier);
  const setSpeedMultiplier = useGameStore((state) => state.setSpeedMultiplier);
  const isStealthMode = useGameStore((state) => state.windowMode === 'stealth');
  const moveHeroToSlot = useGameStore((state) => state.moveHeroToSlot);
  // Dragging an already-deployed hero directly on the canvas to move it to
  // any grid cell - separate from dragPreviewKind, which is for dragging a
  // fresh unit in from the roster panel.
  const [canvasDrag, setCanvasDrag] = useState<CanvasDragState | null>(null);

  const biome = getBiomeForChapter(wave.chapter);
  const globalWave = getGlobalWaveNumber(wave);
  // Always the full fixed 3x3 grid (mapConfig.layoutSlotPositions) - shared
  // by the roster-panel drag-in preview and the canvas-native reposition
  // drag below, so both draw/hit-test against the exact same 9 cells.
  // maxDeployedHeroes is the wave-gated CAP (how many of those 9 cells are
  // actually usable right now, squadSlotUnlockWaves) - cells at/after that
  // index still render (so the player can see the full 3x3 shape and what's
  // still locked) but can't be dropped into, see the locked-cell slice below
  // and HeroSystem.moveHeroToSlot's own matching cap check.
  const maxDeployedHeroes = getMaxDeployedHeroes(globalWave);
  const slotPositions = layoutSlotPositions();
  const unlockedSlotPositions = slotPositions.slice(0, maxDeployedHeroes);
  const occupiedSlotIndices = new Set(
    heroes.map((hero) => hero.deployedSlotIndex).filter((index): index is number => index !== null),
  );

  // Converts a pointer event's screen coordinates into the logical
  // CANVAS_WIDTH x CANVAS_HEIGHT space entity positions live in - inverts
  // the same letterbox scale+center math the draw effect uses, but in CSS
  // pixels (getBoundingClientRect) rather than device pixels, since
  // clientX/Y are already CSS pixels.
  function toLogicalPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }
    const scale = Math.min(rect.width / CANVAS_WIDTH, rect.height / CANVAS_HEIGHT);
    const offsetX = (rect.width - CANVAS_WIDTH * scale) / 2;
    const offsetY = (rect.height - CANVAS_HEIGHT * scale) / 2;
    return {
      x: (clientX - rect.left - offsetX) / scale,
      y: (clientY - rect.top - offsetY) / scale,
    };
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const point = toLogicalPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }
    const hero = findNearestUnit(heroes, point, HERO_HIT_RADIUS);
    if (!hero) {
      return;
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some pointer sessions reject capture - degrade gracefully, same as
      // useDeploySlotDrag's identical guard.
    }
    setCanvasDrag({ kind: 'hero', id: hero.id, pointerX: point.x, pointerY: point.y, hoverSlotIndex: null });
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (!canvasDrag) {
      return;
    }
    const point = toLogicalPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }
    // Only cells within the currently-unlocked cap are valid drop targets -
    // a locked cell (drawn but not yet usable, see maxDeployedHeroes above)
    // never gets the hover ring, rather than highlighting a drop that would
    // silently do nothing.
    const hoverSlotIndex = findNearestSlotIndex(unlockedSlotPositions, point, SLOT_HIT_RADIUS);
    setCanvasDrag((prev) => (prev ? { ...prev, pointerX: point.x, pointerY: point.y, hoverSlotIndex } : prev));
  }

  function handleCanvasPointerUp(): void {
    if (canvasDrag && canvasDrag.hoverSlotIndex !== null) {
      moveHeroToSlot(canvasDrag.id, canvasDrag.hoverSlotIndex);
    }
    setCanvasDrag(null);
  }

  function handleCanvasPointerCancel(): void {
    setCanvasDrag(null);
  }

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

    renderScene(ctx, heroes, pets, enemies, visualEffects, screenShakeIntensity);

    // Grid shown for both drag flavors: dragging a fresh unit in from the
    // roster panel (dragPreviewKind), or repositioning an already-deployed
    // one on the canvas itself (canvasDrag) - same cells either way, see
    // slotPositions/occupiedSlotIndices above.
    if (dragPreviewKind === 'hero' || canvasDrag) {
      drawDeploySlots(ctx, slotPositions, occupiedSlotIndices, maxDeployedHeroes);
    }

    if (canvasDrag) {
      const draggedUnit = heroes.find((unit) => unit.id === canvasDrag.id);
      if (draggedUnit) {
        drawSwapHighlight(ctx, draggedUnit.position, HERO_RADIUS, 'rgba(255, 235, 59, 0.9)');
      }
      if (canvasDrag.hoverSlotIndex !== null) {
        // Same ring color whether the target cell is empty (plain move) or
        // occupied (swap) - both are valid, immediate drop outcomes, see
        // HeroSystem.moveHeroToSlot.
        drawSwapHighlight(ctx, slotPositions[canvasDrag.hoverSlotIndex], HERO_RADIUS, 'rgba(76, 255, 133, 0.95)');
      }
      drawSwapGhost(ctx, canvasDrag.kind, canvasDrag.pointerX, canvasDrag.pointerY);
    }
  }, [heroes, pets, enemies, visualEffects, screenShakeIntensity, displaySize, biome, dragPreviewKind, wave, canvasDrag, slotPositions, occupiedSlotIndices]);

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
              {t('power.team')} {formatBigNumber(teamPower)}
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
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerCancel}
        />
        {isGameOver && <div className="game-over-overlay">{t('battle.gameOver')}</div>}
      </div>
    </div>
  );
}

export default BattleScreen;
