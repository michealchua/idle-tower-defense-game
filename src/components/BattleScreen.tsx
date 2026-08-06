import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { ensureGameLoopStarted, useGameStore } from '../store/useGameStore';
import { renderScene, drawDeploySlots, drawSwapHighlight, drawSwapGhost, HERO_RADIUS } from '../render/CanvasRenderer';
import { t } from '../locales/i18n';
import { getNormalWaveEnemyCount } from '../data/waveConfig';
import { getBiomeForChapter, bossMusicTracks } from '../data/biomeConfig';
import { layoutHeroPositions } from '../data/mapConfig';
import { getMaxDeployedHeroes } from '../data/castleConfig';
import { formatBigNumber } from '../data/scaling';
import { audioManager } from '../audio/AudioManager';

// Logical simulation/coordinate space - every entity position in
// mapConfig.ts and every fixed pixel size in CanvasRenderer.ts is authored
// against this resolution. Never changed at runtime; the canvas is instead
// scaled up to fill whatever screen it's on (see BattleScreen's
// ResizeObserver + ctx.setTransform below), so no engine or renderer code
// needs to know about screen size at all.
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 300;

// How far (in logical canvas units) a pointer can be from a hero's center
// and still grab/target it - wider than the drawn radius for an easier
// grab. Pets have no canvas drag interaction (see PetSystem.ts - every
// owned pet is always active, nothing to deploy/swap).
const HERO_HIT_RADIUS = HERO_RADIUS * 1.4;

interface CanvasDragState {
  kind: 'hero';
  id: string;
  // Logical canvas coordinates (same space as entity positions), not screen
  // pixels - lets the draw effect place the ghost/highlights directly.
  pointerX: number;
  pointerY: number;
  hoverTargetId: string | null;
}

// Nearest hero within radius, excluding the one currently being dragged so
// you can't "swap" a hero with itself.
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
  const base = useGameStore((state) => state.base);
  const visualEffects = useGameStore((state) => state.visualEffects);
  const screenShakeIntensity = useGameStore((state) => state.screenShakeIntensity);
  const isGameOver = useGameStore((state) => state.isGameOver);
  const wave = useGameStore((state) => state.wave);
  const castleLevel = useGameStore((state) => state.castleLevel);
  const dragPreviewKind = useGameStore((state) => state.dragPreviewKind);
  const swapDeployedHeroes = useGameStore((state) => state.swapDeployedHeroes);
  // Dragging an already-deployed hero directly on the canvas to swap its
  // slot with another - separate from dragPreviewKind, which is for
  // dragging a fresh unit in from the roster panel.
  const [canvasDrag, setCanvasDrag] = useState<CanvasDragState | null>(null);

  const biome = getBiomeForChapter(wave.chapter);

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
    setCanvasDrag({ kind: 'hero', id: hero.id, pointerX: point.x, pointerY: point.y, hoverTargetId: null });
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (!canvasDrag) {
      return;
    }
    const point = toLogicalPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }
    const target = findNearestUnit(heroes, point, HERO_HIT_RADIUS, canvasDrag.id);
    setCanvasDrag((prev) => (prev ? { ...prev, pointerX: point.x, pointerY: point.y, hoverTargetId: target?.id ?? null } : prev));
  }

  function handleCanvasPointerUp(): void {
    if (canvasDrag?.hoverTargetId) {
      swapDeployedHeroes(canvasDrag.id, canvasDrag.hoverTargetId);
    }
    setCanvasDrag(null);
  }

  function handleCanvasPointerCancel(): void {
    setCanvasDrag(null);
  }

  useEffect(() => {
    ensureGameLoopStarted();
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
  // on this screen.
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
  }, [stageRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) {
      return;
    }

    // Render at native device resolution (crisp on high-DPI screens) while
    // every draw call still targets the fixed CANVAS_WIDTH/CANVAS_HEIGHT
    // coordinate space. .canvas-stage fills the whole viewport (see
    // index.css) instead of a 4:3 letterboxed box, so its aspect ratio can
    // differ wildly from the game world's - a uniform scale (not
    // independent x/y stretch) plus centering keeps the world undistorted,
    // with the leftover space filled as letterbox bars instead of stretched.
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
    ctx.fillStyle = '#0f1117';
    ctx.fillRect(0, 0, pixelWidth, pixelHeight);

    const scale = Math.min(pixelWidth / CANVAS_WIDTH, pixelHeight / CANVAS_HEIGHT);
    const offsetX = (pixelWidth - CANVAS_WIDTH * scale) / 2;
    const offsetY = (pixelHeight - CANVAS_HEIGHT * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);

    renderScene(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, biome, heroes, pets, enemies, base, visualEffects, screenShakeIntensity);

    if (dragPreviewKind === 'hero') {
      drawDeploySlots(ctx, layoutHeroPositions(getMaxDeployedHeroes(castleLevel)), heroes.length);
    }

    if (canvasDrag) {
      const draggedUnit = heroes.find((unit) => unit.id === canvasDrag.id);
      if (draggedUnit) {
        drawSwapHighlight(ctx, draggedUnit.position, HERO_RADIUS, 'rgba(255, 235, 59, 0.9)');
      }
      if (canvasDrag.hoverTargetId) {
        const targetUnit = heroes.find((unit) => unit.id === canvasDrag.hoverTargetId);
        if (targetUnit) {
          drawSwapHighlight(ctx, targetUnit.position, HERO_RADIUS, 'rgba(76, 255, 133, 0.95)');
        }
      }
      drawSwapGhost(ctx, canvasDrag.kind, canvasDrag.pointerX, canvasDrag.pointerY);
    }
  }, [heroes, pets, enemies, base, visualEffects, screenShakeIntensity, displaySize, biome, dragPreviewKind, castleLevel, canvasDrag]);

  const hpRatio = base.maxHp > 0 ? Math.max(0, Math.min(1, base.currentHp / base.maxHp)) : 0;

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

  return (
    <div className="stage-column">
      {/* Combat-status readout - kept here (not lifted to App's HUD) since
          it's derived from enemies/wave state this component already
          computes for its own render loop. Uses the same .hud-corner/
          .hud-widget classes as App's chrome so it reads as one system. */}
      <div className="hud-corner top-center">
        <div className="hud-widget" style={{ width: '100%' }}>
          <div className="hud-widget-row" style={{ justifyContent: 'space-between', fontSize: 11 }}>
            <span>
              {t('wave.stage')} {wave.chapter}-{wave.waveInChapter} · {t(biome.labelKey)}
              {wave.isBossWave ? ` · ${t(wave.bossKind === 'boss' ? 'wave.boss' : 'wave.miniboss')}` : ''}
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
            {t('base.hp')} {formatBigNumber(base.currentHp)}/{formatBigNumber(base.maxHp)}
          </div>
          <div className="bar-track">
            <div className="bar-fill bar-fill-hp" style={{ width: `${hpRatio * 100}%` }} />
          </div>
        </div>
      </div>

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
