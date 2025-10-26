// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  closeWindow: () => ipcRenderer.send('close-window'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  togglePlayPause: () => ipcRenderer.send('toggle-play-pause'),
  skipPrevious: () => ipcRenderer.send('skip-previous'),
  skipNext: () => ipcRenderer.send('skip-next'),
  togglePin: () => ipcRenderer.send('toggle-pin'),
  snapWindow: () => ipcRenderer.send('snap-window')
});
