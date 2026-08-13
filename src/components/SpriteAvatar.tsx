import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getImage } from '../render/assetLoader';

// Small square thumbnail for list-style UI (hero/pet roster rows, gacha
// reveal cards, codex entries) - reuses the exact same battle sprites
// CanvasRenderer draws on the field (see assetLoader.getHeroSpriteSrc/
// getHeroEvolvedSpriteSrc/getPetSpriteSrc/getEnemySpriteSrc), just scaled
// down and cropped to a square instead of drawn at native aspect ratio.
// Deliberately does NOT touch the battle canvas rendering - this is a plain
// React <canvas>, not part of CanvasRenderer.ts's render loop.
//
// getImage is fire-and-forget and returns undefined until the sprite has
// decoded (see its doc comment) - BattleScreen's mount effect already kicks
// every sprite this game has off loading before any panel can be opened, so
// in practice this resolves on the very first check almost always. The
// short poll below is just a safety net for the rare case a panel opens
// before that preload settles, not the primary loading path.
const RETRY_INTERVAL_MS = 200;

interface SpriteAvatarProps {
  src: string;
  size?: number;
  className?: string;
  // Shown while the sprite hasn't resolved yet (still loading) or never
  // will (file genuinely missing) - same "procedural/glyph fallback until
  // real art exists" contract CanvasRenderer's silhouettes follow.
  fallback?: ReactNode;
}

function SpriteAvatar({ src, size = 32, className, fallback }: SpriteAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    let cancelled = false;

    function tryDraw(): boolean {
      const image = getImage(src);
      const canvas = canvasRef.current;
      if (!image || !canvas) {
        return false;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return false;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // "Cover" fit (scale to fill the square, crop overflow) rather than
      // "contain" - a list thumbnail reads better filling its square than
      // letterboxed inside it, unlike CanvasRenderer.drawStaticSprite's
      // aspect-preserving battle-field draw.
      const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      ctx.drawImage(image, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
      if (!cancelled) {
        setReady(true);
      }
      return true;
    }

    if (tryDraw()) {
      return;
    }
    const interval = window.setInterval(() => {
      if (tryDraw()) {
        window.clearInterval(interval);
      }
    }, RETRY_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [src]);

  return (
    <span className={`sprite-avatar${className ? ` ${className}` : ''}`} style={{ width: size, height: size }}>
      <canvas ref={canvasRef} width={size} height={size} style={{ display: ready ? 'block' : 'none' }} />
      {!ready && fallback}
    </span>
  );
}

export default SpriteAvatar;
