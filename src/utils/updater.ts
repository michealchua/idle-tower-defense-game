// Shared by UpdateBanner.tsx (passive corner banner) and SettingsPanel.tsx
// (the manual "check for update" button) - both read the same
// window.tataKAIUpdater status stream, so the type/bridge shape lives here
// once instead of being declared twice.
export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'up-to-date' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

// Same "only exists in the packaged/dev Electron shell" contract as
// window.tataKAISave - undefined in the plain web build (no preload script
// there, and no installer to update anyway - a browser tab is always
// already on whatever's currently deployed).
declare global {
  interface Window {
    tataKAIUpdater?: {
      onStatus: (callback: (status: UpdateStatus) => void) => () => void;
      installNow: () => void;
      // Manual trigger for SettingsPanel's "检查更新" button - see
      // electron/main.cjs's 'update:check-now' handler. The automatic
      // launch-time check was removed in favor of this: players no longer
      // wait on an update check every login, they ask for one when they
      // want it.
      checkNow: () => void;
    };
  }
}
