// Exactly three window sizes exist (see electron/main.cjs's
// STEALTH_WINDOW_WIDTH/HEIGHT doc comment) - the player can no longer
// freely drag-resize the window at all (main.cjs's BrowserWindow is
// `resizable: false` now), only switch between these three fixed states via
// App.tsx's toggle buttons. 'fullscreen' is real OS-level fullscreen
// (win.setFullScreen), not a fourth fixed pixel size.
export type WindowMode = 'default' | 'fullscreen' | 'stealth';

declare global {
  interface Window {
    // Only exists in the packaged/dev Electron shell - same "undefined in
    // the plain web build" contract as window.tataKAISave/tataKAIUpdater.
    tataKAIApp?: {
      setWindowMode: (mode: WindowMode) => void;
      quit: () => void;
    };
  }
}

export function setWindowMode(mode: WindowMode): void {
  window.tataKAIApp?.setWindowMode(mode);
}
