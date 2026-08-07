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
export function getHeroEvolvedSpriteSrc(evolutionBranchId: string): string {
  return `/sprites/heroes/evolved/${evolutionBranchId.replace(/-/g, '_')}.png`;
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
