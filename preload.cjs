const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    printNative: (html, preview) => ipcRenderer.send('print-native', html, preview),
    printToDevice: (html, deviceName, silent) => ipcRenderer.invoke('print-to-device', html, deviceName, silent),
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    printThermalReceipt: (data, config) => ipcRenderer.invoke('print-thermal-receipt', data, config),
    testThermalPrint: (config) => ipcRenderer.invoke('test-thermal-print', config)
});
