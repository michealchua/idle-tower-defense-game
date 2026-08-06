const { app, BrowserWindow } = require('electron');
const { gameUrl } = require('./gameUrl.cjs');

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    title: '放置塔防',
    autoHideMenuBar: true,
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
