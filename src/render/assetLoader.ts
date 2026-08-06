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
