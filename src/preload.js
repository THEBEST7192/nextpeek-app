// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  closeWindow: () => ipcRenderer.send('close-window'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  togglePlayPause: () => ipcRenderer.send('toggle-play-pause'),
  skipPrevious: () => ipcRenderer.invoke('previous-track'),
  skipNext: () => ipcRenderer.invoke('next-track'),
  togglePin: () => ipcRenderer.send('toggle-pin'),
  snapWindow: () => ipcRenderer.send('snap-window'),
  onPinStateChange: (callback) => ipcRenderer.on('pin-state-changed', callback),
  removePinStateListener: () => ipcRenderer.removeAllListeners('pin-state-changed'),
  onPlayStateChange: (callback) => ipcRenderer.on('play-state-changed', callback),
  removePlayStateListener: () => ipcRenderer.removeAllListeners('play-state-changed'),
  toggleTheme: (themeKey) => ipcRenderer.invoke('apply-theme', themeKey),
  onThemeChange: (callback) => ipcRenderer.on('theme-changed', callback),
  removeThemeChangeListener: () => ipcRenderer.removeAllListeners('theme-changed'),
  // Queue service
  startQueueListener: () => ipcRenderer.invoke('start-queue-listener'),
  onQueueUpdated: (callback) => ipcRenderer.on('queue-updated', callback),
  onQueueServerStarted: (callback) => ipcRenderer.on('queue-server-started', callback),
  // Playlist playback
  playPlaylist: (playlistUri) => ipcRenderer.invoke('play-playlist', playlistUri),
  // Track playback
  playTrack: (trackUri) => ipcRenderer.invoke('play-track', trackUri),
});
