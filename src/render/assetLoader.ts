// Fire-and-forget image cache for CanvasRenderer. getImage never blocks -
// it kicks off a load the first time a src is requested and returns
// undefined until that image (or a later one, if src changes) is actually
// decoded, so callers can fall back to a solid color for however long that
// takes (including "forever", if the file was never dropped into public/).
const imageCache = new Map<string, HTMLImageElement>();
const failedSrcs = new Set<string>();

export function getImage(src: string): HTMLImageElement | undefined {
  if (failedSrcs.has(src)) {
    return undefined;
  }

  let image = imageCache.get(src);
  if (!image) {
    image = new Image();
    image.onerror = () => {
      failedSrcs.add(src);
      imageCache.delete(src);
    };
    image.src = src;
    imageCache.set(src, image);
  }

  return image.complete && image.naturalWidth > 0 ? image : undefined;
}

// Single source of truth for the sprite directory convention - CanvasRenderer
// calls these instead of building paths inline, so every entity type looks
// in the same place a real asset drop would use. Sprites are keyed by class/
// archetype/id rather than one-per-instance (100 unique hero portraits isn't
// a realistic art budget) - see CanvasRenderer's drawHero/drawEnemy/drawPet
// for what each falls back to when the file isn't there yet.
export function getHeroSpriteSrc(heroClass: string): string {
  return `/sprites/heroes/${heroClass}.png`;
}

export function getEnemySpriteSrc(archetypeId: string): string {
  return `/sprites/enemies/${archetypeId}.png`;
}

export function getPetSpriteSrc(petId: string): string {
  return `/sprites/pets/${petId}.png`;
}

// No per-castleType variants yet - a single generic tower sprite, same
// "one file, not one per instance" reasoning as the others above.
export function getTowerSpriteSrc(): string {
  return `/sprites/towers/base.png`;
}
