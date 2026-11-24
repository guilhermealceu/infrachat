const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('documentManager', {
  groqStatus: () => ipcRenderer.invoke('groq:status'),
  configureGroq: (config) => ipcRenderer.invoke('groq:configure', config),
  generateGroq: (payload) => ipcRenderer.invoke('groq:generate', payload),
  cancelGroq: (id) => ipcRenderer.invoke('groq:cancel', id),
  scanFolder: (onProgress) => {
    const listener = (_event, progress) => onProgress(progress);
    ipcRenderer.on('documents:progress', listener);
    return ipcRenderer.invoke('documents:scan-folder').finally(() => {
      ipcRenderer.removeListener('documents:progress', listener);
    });
  },
  stopOllama: (model) => ipcRenderer.invoke('ollama:stop', model)
});
