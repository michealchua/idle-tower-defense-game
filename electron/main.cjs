const { app, BrowserWindow } = require('electron');
const path = require('path');
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

function createWindow() {
  const win = new BrowserWindow({
    // index.html's #game-container/#build-panel/#inventory-panel are all a
    // fixed 960px wide with no horizontal body padding - width has to clear
    // that (plus window chrome) or the page gets a horizontal scrollbar.
    // Height comfortably fits the 540px canvas plus the HUD message row,
    // build panel, and inventory panel stacked underneath it.
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

app.whenReady().then(() => {
  createWindow();

  if (app.isPackaged) {
    // Checks GitHub Releases (see package.json's build.publish) for a newer
    // version, downloads it in the background, and installs it on the next
    // app restart. Not run in dev builds - there is no publish feed to
    // check, and app.isPackaged is false there anyway.
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
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
