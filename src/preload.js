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
  snapWindow: () => ipcRenderer.send('snap-window'),
  onPinStateChange: (callback) => ipcRenderer.on('pin-state-changed', callback),
  removePinStateListener: () => ipcRenderer.removeAllListeners('pin-state-changed'),
  onPlayStateChange: (callback) => ipcRenderer.on('play-state-changed', callback),
  removePlayStateListener: () => ipcRenderer.removeAllListeners('play-state-changed'),
  // Spotify OAuth
  startSpotifyAuth: () => ipcRenderer.send('spotify-login'),
  onSpotifyAuthSuccess: (callback) => ipcRenderer.on('spotify-auth-success', callback),
  onSpotifyAuthError: (callback) => ipcRenderer.on('spotify-auth-error', callback),
  getSpotifyAuthStatus: () => ipcRenderer.invoke('spotify-auth-status')
});
