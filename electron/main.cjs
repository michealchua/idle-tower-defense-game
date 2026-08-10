const { app, BrowserWindow } = require('electron');
const { gameUrl } = require('./gameUrl.cjs');

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

  win.loadURL(gameUrl);
}

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
