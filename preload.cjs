const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    printNative: (html, preview) => ipcRenderer.send('print-native', html, preview)
});
