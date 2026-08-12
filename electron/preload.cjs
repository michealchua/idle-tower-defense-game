const { contextBridge, ipcRenderer } = require('electron');

// Narrow, synchronous save/load surface for the renderer - see
// src/engine/core/SaveSystem.ts for the client. Every existing call site
// (including TitleScreen's inline render-time slot list) expects a plain
// return value, not a Promise, so this uses ipcRenderer.sendSync (blocking)
// instead of invoke - contextBridge doesn't care whether the function it
// exposes is sync or async, it just exposes whatever's here. Save/load/
// delete/list are rare, small-JSON calls (never per-frame), so the
// renderer-blocking cost of sendSync is negligible - this is not the same
// tradeoff as using it on a hot path.
contextBridge.exposeInMainWorld('tataKAISave', {
  save: (slot, data) => ipcRenderer.sendSync('save:write', slot, data),
  load: (slot) => ipcRenderer.sendSync('save:read', slot),
  del: (slot) => ipcRenderer.sendSync('save:delete', slot),
  list: () => ipcRenderer.sendSync('save:list'),
});

// Auto-update status surface for src/components/UpdateBanner.tsx - see
// main.cjs's "Auto-update IPC" section for what emits update:status and
// what update:install-now does. onStatus returns its own unsubscribe
// function (React effect cleanup shape) rather than exposing
// ipcRenderer.on/removeListener directly, so the renderer never touches a
// raw IPC event emitter.
contextBridge.exposeInMainWorld('tataKAIUpdater', {
  onStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('update:status', handler);
    return () => ipcRenderer.removeListener('update:status', handler);
  },
  installNow: () => ipcRenderer.send('update:install-now'),
});

// Backs src/components/SettingsPanel.tsx - see main.cjs's "App chrome IPC"
// section for what these two fire-and-forget sends do.
contextBridge.exposeInMainWorld('tataKAIApp', {
  setWindowScale: (factor) => ipcRenderer.send('app:set-window-scale', factor),
  quit: () => ipcRenderer.send('app:quit'),
});
