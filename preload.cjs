const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    printNative: (html) => ipcRenderer.send('print-native', html)
});
