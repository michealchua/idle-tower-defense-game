// Whole-window shrink for "keep this in the corner while I work" play -
// separate from BattleScreen's own letterbox fit, which just keeps the 4:3
// game world undistorted inside whatever box it's given. This instead makes
// that whole box (and every HUD/panel around it) smaller within the OS
// window, via the same zoom mechanism Ctrl+/- uses in any Chromium window
// (webContents.setZoomFactor - see electron/main.cjs's "App chrome IPC"
// section) - it reflows real layout, not a CSS visual-only transform, so the
// existing ResizeObserver-driven canvas fit adapts to it for free.
//
// Shrink-only (never zooms past 100%) per the ask this was built for -
// there's no reason to blow the UI up past its authored size.
const STORAGE_KEY = 'tataKAI.displayScale';
export const MIN_DISPLAY_SCALE = 0.5;
export const MAX_DISPLAY_SCALE = 1;

declare global {
  interface Window {
    // Only exists in the packaged/dev Electron shell - same "undefined in
    // the plain web build" contract as window.tataKAISave/tataKAIUpdater.
    tataKAIApp?: {
      setZoomFactor: (factor: number) => void;
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
  window.tataKAIApp?.setZoomFactor(clamped);
}

// Electron resets webContents' zoom factor to 1 on every launch - call this
// once at startup to reapply whatever the player last chose.
export function applyPersistedDisplayScale(): void {
  window.tataKAIApp?.setZoomFactor(getDisplayScale());
}
