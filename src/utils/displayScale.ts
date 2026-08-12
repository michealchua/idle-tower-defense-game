// Whole-window shrink for "stealth mode" (see App.tsx's toggle button) -
// separate from BattleScreen's own letterbox fit, which just keeps the 4:3
// game world undistorted inside whatever box it's given. electron/main.cjs's
// 'app:set-window-scale' handler resizes the actual OS window
// (BrowserWindow.setSize); its 'resize' listener (see createWindow) then
// rescales the whole rendered page - HUD buttons/text included, not just
// the canvas world BattleScreen's own ResizeObserver already rescales - to
// match, using webContents.setZoomFactor computed from the window's real
// resulting content size. Both happen in the main process so this file only
// needs to ask for the resize.
//
// No longer a free slider (was one, see git history) - stealth mode is
// binary now (full size + full HUD, or minimum size + HUD hidden), so
// there's no arbitrary value to remember across launches either.
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

export function setDisplayScale(scale: number): void {
  const clamped = Math.min(MAX_DISPLAY_SCALE, Math.max(MIN_DISPLAY_SCALE, scale));
  window.tataKAIApp?.setWindowScale(clamped);
}
