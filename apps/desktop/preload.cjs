const { contextBridge, ipcRenderer } = require('electron');

let beforeClose = async () => {};
ipcRenderer.on('kercad:before-close', async (_event, token) => {
  if (typeof token !== 'string') return;
  try {
    await beforeClose();
    ipcRenderer.send('kercad:close-result', { token, ok: true, locale: document.documentElement.lang });
  } catch {
    ipcRenderer.send('kercad:close-result', { token, ok: false, locale: document.documentElement.lang });
  }
});
contextBridge.exposeInMainWorld('kerCADDesktop', {
  onBeforeClose(callback) {
    beforeClose = callback;
    return () => { if (beforeClose === callback) beforeClose = async () => {}; };
  },
});
