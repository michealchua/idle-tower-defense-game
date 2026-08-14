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

// Exactly three window sizes exist - the player can no longer freely drag-
// resize (see `resizable: false` below). "default" is the app's normal
// size; "stealth" is a fixed fraction of it (src/components's stealth-mode
// toggle - see "App chrome IPC" below); "fullscreen" is real OS-level
// fullscreen (win.setFullScreen), not just a third fixed pixel size.
const BASE_WINDOW_WIDTH = 1024;
const BASE_WINDOW_HEIGHT = 900;
const STEALTH_SCALE = 0.3;
const STEALTH_WINDOW_WIDTH = Math.round(BASE_WINDOW_WIDTH * STEALTH_SCALE);
const STEALTH_WINDOW_HEIGHT = Math.round(BASE_WINDOW_HEIGHT * STEALTH_SCALE);

function createWindow() {
  const win = new BrowserWindow({
    width: BASE_WINDOW_WIDTH,
    height: BASE_WINDOW_HEIGHT,
    // No user drag-resize and no maximize button - size only ever changes
    // through the three setWindowMode transitions below.
    resizable: false,
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
  // Single source of truth for "keep the whole rendered page - HUD buttons/
  // text included, not just the canvas world BattleScreen.tsx's own
  // ResizeObserver already rescales - proportional to the window": fires for
  // every one of the three setWindowMode transitions below (setSize AND
  // setFullScreen both trigger it), so all three end up here instead of
  // duplicating this computation three times. Reads the window's REAL
  // resulting content-view size (getContentSize, title-bar/border chrome
  // excluded) rather than assuming it equals whatever width/height was
  // requested, since that chrome doesn't shrink/grow at the same rate as the
  // window itself and would otherwise throw the zoom off. This is also what
  // makes fullscreen work for free: on a screen bigger than
  // BASE_WINDOW_WIDTH/HEIGHT, the resulting zoom factor comes out above 1x,
  // scaling the whole UI up to fill the screen instead of leaving it pinned
  // at its normal size with empty space around it.
  win.on('resize', () => {
    const [contentWidth] = win.getContentSize();
    win.webContents.setZoomFactor(contentWidth / BASE_WINDOW_WIDTH);
  });
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
// update:install-now/update:check-now are the only things the renderer can
// trigger back.
function sendUpdateStatus(status) {
  mainWindow?.webContents.send('update:status', status);
}

autoUpdater.on('update-available', (info) => sendUpdateStatus({ state: 'available', version: info.version }));
autoUpdater.on('update-not-available', () => sendUpdateStatus({ state: 'up-to-date' }));
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

// Manual trigger for SettingsPanel's "检查更新" button - there is no
// automatic check on launch anymore (see app.whenReady below), so this is
// the only way a check ever happens: the player asks for it, instead of
// silently waiting on one every time they open the app.
ipcMain.on('update:check-now', () => {
  if (!app.isPackaged) {
    // No publish feed to check against in a dev build - same "nothing to
    // do here" case app.isPackaged already guarded the old launch-time
    // check with.
    sendUpdateStatus({ state: 'up-to-date' });
    return;
  }
  sendUpdateStatus({ state: 'checking' });
  autoUpdater.checkForUpdates().catch((err) => sendUpdateStatus({ state: 'error', message: err.message }));
});

// --- App chrome IPC (window mode + settings panel) --------------------------
// Backs App.tsx's fullscreen/stealth-mode toggle buttons and
// SettingsPanel.tsx's "quit the app" button. Exactly three modes - see
// STEALTH_WINDOW_WIDTH/HEIGHT's doc comment above. Always drops out of
// fullscreen before resizing to 'default'/'stealth' - setSize while still
// fullscreen doesn't reliably take effect on Windows.
ipcMain.on('app:set-window-mode', (_event, mode) => {
  if (!mainWindow) {
    return;
  }
  // Set true unconditionally, up front - covers setFullScreen(true) below
  // as well as the setSize calls further down, both of which can be
  // silently ignored on a resizable:false window on some Electron/Windows
  // combinations (this is the reported "全屏/摸鱼模式按钮完全没反应" bug: no
  // error either side of the IPC round-trip, the call is genuinely made,
  // the OS just declines to honor it on a non-resizable window). Left true
  // for the rest of a fullscreen session rather than immediately toggled
  // back - a fullscreen window has no visible edges to drag anyway, so
  // there's nothing user-facing to protect against while it's on; it's
  // only set back to false once actually landing on 'default'/'stealth'
  // below, keeping the "no user drag-resize" contract intact at rest.
  mainWindow.setResizable(true);
  if (mode === 'fullscreen') {
    mainWindow.setFullScreen(true);
    return;
  }
  if (mainWindow.isFullScreen()) {
    mainWindow.setFullScreen(false);
  }
  if (mode === 'stealth') {
    mainWindow.setSize(STEALTH_WINDOW_WIDTH, STEALTH_WINDOW_HEIGHT);
  } else {
    mainWindow.setSize(BASE_WINDOW_WIDTH, BASE_WINDOW_HEIGHT);
  }
  mainWindow.setResizable(false);
});

ipcMain.on('app:quit', () => {
  app.quit();
});

app.whenReady().then(() => {
  createWindow();

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
