// A processed sprite is a canvas (see stripCheckerboardBackground below); an
// unprocessed one is still the raw <img> mid-decode. CanvasRenderer's
// drawImage/width/height reads work identically against either - both
// implement CanvasImageSource and expose the same .width/.height contract.
export type SpriteImage = HTMLImageElement | HTMLCanvasElement;

// Fire-and-forget image cache for CanvasRenderer. getImage never blocks -
// it kicks off a load the first time a src is requested and returns
// undefined until that image (or a later one, if src changes) is actually
// decoded and background-processed, so callers can fall back to a solid
// color for however long that takes (including "forever", if the file was
// never dropped into public/).
const imageCache = new Map<string, SpriteImage>();
const failedSrcs = new Set<string>();

// Every sprite dropped into this project so far (hero/evolved/boss - see
// ART_ASSET_CHECKLIST.md) was exported with its "transparent" background
// flattened into an opaque neutral-grey checkerboard instead of real alpha -
// confirmed by sampling warrior_walk.png's corner pixels (solid RGBA, two
// alternating ~125/~187 grey tones on an ~11px grid). Rather than waiting on
// re-exported files, every sprite gets flood-filled once at load time: walk
// inward from the four edges through any run of that same neutral-grey
// profile and punch it to alpha 0. Flood fill (not a global color-key) is
// what makes this safe against a genuinely grey painted detail (armor,
// stone) - a pixel only gets cleared if it's actually reachable from the
// image's own border through more of the same background tone, so real
// content stays intact unless it touches the edge itself. A sprite with a
// real full-bleed illustrated background (demon_boss.png - confirmed 100%
// non-neutral border pixels) finds no matching seed point at all and comes
// back untouched.
function isCheckerboardTone(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min <= 10 && max >= 100 && max <= 245;
}

function stripCheckerboardBackground(image: HTMLImageElement): HTMLCanvasElement {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return canvas;
  }
  ctx.drawImage(image, 0, 0);

  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const visited = new Uint8Array(width * height);
  // Flat (x, y, x, y, ...) stack rather than an array of tuples - avoids one
  // allocation per pixel visited, which matters here since a large sprite's
  // background can legitimately be most of its pixel count.
  const stack: number[] = [];
  for (let x = 0; x < width; x++) {
    stack.push(x, 0, x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    stack.push(0, y, width - 1, y);
  }

  while (stack.length > 0) {
    const y = stack.pop() as number;
    const x = stack.pop() as number;
    if (x < 0 || x >= width || y < 0 || y >= height) {
      continue;
    }
    const pixelIndex = y * width + x;
    if (visited[pixelIndex]) {
      continue;
    }
    visited[pixelIndex] = 1;

    const dataIndex = pixelIndex * 4;
    if (!isCheckerboardTone(data[dataIndex], data[dataIndex + 1], data[dataIndex + 2])) {
      continue;
    }
    data[dataIndex + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function getImage(src: string): SpriteImage | undefined {
  if (failedSrcs.has(src)) {
    return undefined;
  }

  const cached = imageCache.get(src);
  if (cached instanceof HTMLCanvasElement) {
    return cached;
  }

  if (!cached) {
    const image = new Image();
    image.onload = () => {
      imageCache.set(src, stripCheckerboardBackground(image));
    };
    image.onerror = () => {
      failedSrcs.add(src);
      imageCache.delete(src);
    };
    image.src = src;
    imageCache.set(src, image);
  }

  // Still mid-decode/mid-process (the raw <img> is in the cache but hasn't
  // been swapped for its processed canvas yet) - same "not ready" contract
  // as before, callers fall back to their placeholder shape.
  return undefined;
}

// Hero art is a pair of high-detail static illustrations per class/branch
// (walk pose, attack pose), not a 32x32 frame sheet - see CanvasRenderer's
// drawHeroSprite for how the two get swapped. 'state' defaults to 'walk' so
// existing call sites that only need the idle pose don't have to pass it.
export type HeroSpriteState = 'walk' | 'attack';

// Single source of truth for the sprite directory convention - CanvasRenderer
// calls these instead of building paths inline, so every entity type looks
// in the same place a real asset drop would use. Sprites are keyed by class/
// archetype/id rather than one-per-instance (100 unique hero portraits isn't
// a realistic art budget) - see CanvasRenderer's drawHero/drawEnemy/drawPet
// for what each falls back to when the file isn't there yet.
export function getHeroSpriteSrc(heroClass: string, state: HeroSpriteState = 'walk'): string {
  return `/sprites/heroes/${heroClass}_${state}.png`;
}

// Takes a sprite "type" (e.g. 'goblin', 'slime', 'demon_boss'), not an
// archetypeId directly - CanvasRenderer's ENEMY_SPRITE_TYPE maps the 14
// gameplay archetypes onto this small set of shared visual identities, since
// hand-authoring 14 unique enemy sheets isn't the intended art budget.
export function getEnemySpriteSrc(type: string): string {
  return `/sprites/enemies/${type}.png`;
}

export function getPetSpriteSrc(petId: string): string {
  return `/sprites/pets/${petId}.png`;
}

// A hero that's committed to an evolutionBranchId (HeroSystem.evolveHero)
// draws from here instead of getHeroSpriteSrc - see CanvasRenderer.drawHero.
// Branch ids (heroRosterConfig.ts, e.g. "warrior-berserker") use hyphens;
// filenames use underscores to match this project's existing sprite-file
// convention, hence the replace.
export function getHeroEvolvedSpriteSrc(evolutionBranchId: string, state: HeroSpriteState = 'walk'): string {
  return `/sprites/heroes/evolved/${evolutionBranchId.replace(/-/g, '_')}_${state}.png`;
}

// Single tower sprite - no per-castleType variants yet, same "one file, not
// one per instance" reasoning as the others above.
export function getTowerSpriteSrc(): string {
  return `/sprites/towers/castle.png`;
}

// Fire-and-forget, same as getImage itself - just kicks off a load for every
// src up front (once, from BattleScreen's mount effect via
// CanvasRenderer.preloadBattleSprites) so the handful of sheets a fresh
// session needs are already decoding, or done, by the time battle rendering
// actually asks for them - rather than every sprite popping in from its
// fallback shape on the first few frames. Callers don't await this; getImage
// already tolerates "still loading" by returning undefined until decode
// finishes, same as it always has.
export function preloadSprites(srcs: string[]): void {
  for (const src of srcs) {
    getImage(src);
  }
}
