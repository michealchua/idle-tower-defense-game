// Whole-window shrink for "keep this in the corner while I work" play -
// separate from BattleScreen's own letterbox fit, which just keeps the 4:3
// game world undistorted inside whatever box it's given. This instead
// resizes the actual OS window itself (electron/main.cjs's "App chrome IPC"
// section calls BrowserWindow.setSize, not a zoom/CSS transform - a zoom
// would leave the window full-size with smaller content floating inside it,
// which doesn't read as a smaller window at all). The window's aspect ratio
// is locked at creation (win.setAspectRatio), so every scale keeps the same
// shape; BattleScreen's own ResizeObserver picks up the new size for free.
//
// Shrink-only (never zooms past 100%) per the ask this was built for - down
// to 30% of the default 1024x900 window (~307x270), small enough to sit
// unobtrusively in a screen corner, floored by main.cjs's own minWidth/
// minHeight so the slider's minimum and the window's real floor agree.
const STORAGE_KEY = 'tataKAI.displayScale';
export const MIN_DISPLAY_SCALE = 0.3;
export const MAX_DISPLAY_SCALE = 1;

declare global {
  interface Window {
    // Only exists in the packaged/dev Electron shell - same "undefined in
    // the plain web build" contract as window.tataKAISave/tataKAIUpdater.
    tataKAIApp?: {
      setWindowScale: (factor: number) => void;
      quit: () => void;
    };
  }
}

export function getDisplayScale(): number {
  const stored = Number(localStorage.getItem(STORAGE_KEY));
  return stored >= MIN_DISPLAY_SCALE && stored <= MAX_DISPLAY_SCALE ? stored : MAX_DISPLAY_SCALE;
}

export function setDisplayScale(scale: number): void {
  const clamped = Math.min(MAX_DISPLAY_SCALE, Math.max(MIN_DISPLAY_SCALE, scale));
  localStorage.setItem(STORAGE_KEY, String(clamped));
  window.tataKAIApp?.setWindowScale(clamped);
}

// Electron doesn't remember window size across launches on its own - call
// this once at startup to reapply whatever the player last chose.
export function applyPersistedDisplayScale(): void {
  window.tataKAIApp?.setWindowScale(getDisplayScale());
}
