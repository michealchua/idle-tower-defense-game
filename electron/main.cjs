const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { devUrl } = require('./gameUrl.cjs');

// Packaged builds bundle the game as static files (electron-builder's
// extraResources config copies dist/ to resources/dist/ - see package.json's
// "build" key) so the app runs fully offline; only `electron:dev` loads a
// live dev-server URL instead (see gameUrl.cjs).
function resolveIndexPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'dist', 'index.html');
  }
  return path.join(__dirname, '..', 'dist', 'index.html');
}

// Set by createWindow, read by the autoUpdater event handlers below to push
// status to the renderer - see the "Auto-update IPC" section.
let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    // The game itself is a full-viewport responsive layout (src/index.css's
    // .battle-layer/.hud-layer), not a fixed pixel size - these are just a
    // reasonable default window size and a floor that keeps corner HUD
    // widgets from overlapping each other.
    width: 1024,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'tataKAI',
    autoHideMenuBar: true,
    // No `icon` option here on purpose: on Windows the taskbar/title-bar
    // icon comes from the .exe's own embedded icon resource, which
    // electron-builder bakes in at package time from package.json's
    // build.icon/build.win.icon - a runtime path here would also have to
    // survive being packaged (directories.app only bundles electron/, not
    // the project root's build/ folder this icon lives in), so pointing at
    // it from code would just be a second, more fragile way to set
    // something the installer step already handles correctly.
    webPreferences: {
      // Exposes only the narrow tataKAISave API (see preload.cjs) into the
      // page's window object - contextIsolation keeps that bridge in its
      // own JS context so the renderer's own (untrusted-by-default) scripts
      // can't reach Node/Electron internals directly, only what preload.cjs
      // deliberately exposes.
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(resolveIndexPath());
  }

  // autoHideMenuBar removes the normal View > Reload menu item entirely, so
  // without this there'd be no way to recover a stuck/stale page short of
  // fully quitting and relaunching the app. reloadIgnoringCache() (not
  // reload()) so this also recovers from a stale *cached* copy of the page,
  // not just a JS-level hang.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') {
      return;
    }
    const isReloadShortcut = (input.control || input.meta) && input.key.toLowerCase() === 'r';
    if (isReloadShortcut || input.key === 'F5') {
      win.webContents.reloadIgnoringCache();
      event.preventDefault();
    }
  });
}

// --- Checkpoint save IPC ---------------------------------------------------
// Backs src/engine/core/SaveSystem.ts's IPC path (used whenever
// window.tataKAISave exists, i.e. the packaged/dev Electron shell - the web
// build has no preload script and falls back to localStorage there instead).
// Saves land as real JSON files under the OS-appropriate per-app data
// directory instead of the renderer's localStorage - survives storage-
// partition eviction, is a real file the user can back up or copy between
// machines, and isn't subject to any per-origin storage cap.
//
// Every handler here is registered with ipcMain.on (not .handle) and replies
// via event.returnValue, pairing with preload.cjs's ipcRenderer.sendSync -
// see that file's comment for why synchronous. Because the whole call is
// already blocking the renderer until this returns, there's no benefit to
// async fs here either - plain sync fs calls are the natural match and keep
// each handler a single straight-line function.
const SAVE_SLOTS = [1, 2, 3];
const savesDir = path.join(app.getPath('userData'), 'saves');

function saveFilePath(slot) {
  return path.join(savesDir, `slot-${slot}.json`);
}

function readSaveFile(slot) {
  try {
    return JSON.parse(fs.readFileSync(saveFilePath(slot), 'utf8'));
  } catch {
    // Missing file (never saved to this slot) or corrupt JSON both read as
    // "empty slot" - same contract SaveSystem.ts's localStorage backend
    // already has (readSaveFile there does the same for a missing/corrupt
    // localStorage key).
    return null;
  }
}

ipcMain.on('save:write', (event, slot, data) => {
  fs.mkdirSync(savesDir, { recursive: true });
  fs.writeFileSync(saveFilePath(slot), JSON.stringify(data));
  event.returnValue = true;
});

ipcMain.on('save:read', (event, slot) => {
  event.returnValue = readSaveFile(slot);
});

ipcMain.on('save:delete', (event, slot) => {
  try {
    fs.unlinkSync(saveFilePath(slot));
  } catch {
    // Already gone - deleting an empty slot is a no-op, not an error.
  }
  event.returnValue = true;
});

ipcMain.on('save:list', (event) => {
  // Metadata only (not the full save, which also carries the whole
  // GameState) - this backs TitleScreen's slot picker, which never needs
  // more than that to render, and SaveSystem.getMostRecentSlot, which only
  // needs each slot's savedAt.
  event.returnValue = SAVE_SLOTS.map((slot) => ({ slot, metadata: readSaveFile(slot)?.metadata ?? null }));
});

// --- Auto-update IPC --------------------------------------------------
// Surfaces electron-updater's progress as a real in-app banner (see
// src/components/UpdateBanner.tsx) instead of relying on the bare OS
// notification checkForUpdatesAndNotify() used to show - a player who
// never re-launches the app (idle games are exactly the kind left running
// for a long session) would never see that notification at all, and even
// when they did it explained nothing about what to do next. Every event
// autoUpdater emits gets forwarded to whichever window is currently open;
// update:install-now is the only thing the renderer can trigger back.
function sendUpdateStatus(status) {
  mainWindow?.webContents.send('update:status', status);
}

autoUpdater.on('update-available', (info) => sendUpdateStatus({ state: 'available', version: info.version }));
autoUpdater.on('download-progress', (progress) => sendUpdateStatus({ state: 'downloading', percent: Math.round(progress.percent) }));
autoUpdater.on('update-downloaded', (info) => sendUpdateStatus({ state: 'downloaded', version: info.version }));
autoUpdater.on('error', (err) => sendUpdateStatus({ state: 'error', message: err.message }));

ipcMain.on('update:install-now', () => {
  // Quits and relaunches under the newly-downloaded version - only ever
  // called from the banner's "restart now" button, which only renders once
  // state is already 'downloaded', so there's always something to install
  // by the time this fires.
  autoUpdater.quitAndInstall();
});

// --- App chrome IPC (settings panel) ---------------------------------------
// Backs src/components/SettingsPanel.tsx: an in-page display-scale slider
// (webContents.setZoomFactor is the same mechanism Ctrl+/- uses in any
// Chromium window - it reflows layout, not just a visual CSS transform, so
// the existing ResizeObserver-driven canvas fit in BattleScreen.tsx adapts
// to it for free) and a real "quit the app" button for the exit-game action.
ipcMain.on('app:set-zoom-factor', (_event, factor) => {
  mainWindow?.webContents.setZoomFactor(factor);
});

ipcMain.on('app:quit', () => {
  app.quit();
});

app.whenReady().then(() => {
  createWindow();

  if (app.isPackaged) {
    // Checks GitHub Releases (see package.json's build.publish) for a newer
    // version and downloads it in the background (autoDownload defaults to
    // true) - progress/completion surface through the events wired above.
    // Not run in dev builds - there is no publish feed to check, and
    // app.isPackaged is false there anyway.
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('Auto-update check failed:', err);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
