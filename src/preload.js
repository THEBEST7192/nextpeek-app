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
  onPinStateChange: (callback) => {
    ipcRenderer.on('pin-state-changed', callback);
    return () => ipcRenderer.removeListener('pin-state-changed', callback);
  },
  removePinStateListener: () => ipcRenderer.removeAllListeners('pin-state-changed'),
  onPlayStateChange: (callback) => {
    ipcRenderer.on('play-state-changed', callback);
    return () => ipcRenderer.removeListener('play-state-changed', callback);
  },
  removePlayStateListener: (callback) => {
    if (callback) {
      ipcRenderer.removeListener('play-state-changed', callback);
    } else {
      ipcRenderer.removeAllListeners('play-state-changed');
    }
  },
  toggleTheme: (themeKey) => ipcRenderer.invoke('apply-theme', themeKey),
  uploadCustomBackground: () => ipcRenderer.invoke('upload-custom-background'),
  setCustomImageTextColor: (color) => ipcRenderer.invoke('set-custom-image-text-color', color),
  onThemeChange: (callback) => {
    ipcRenderer.on('theme-changed', callback);
    return () => ipcRenderer.removeListener('theme-changed', callback);
  },
  removeThemeChangeListener: (callback) => {
    if (callback) {
      ipcRenderer.removeListener('theme-changed', callback);
    } else {
      ipcRenderer.removeAllListeners('theme-changed');
    }
  },
  // Queue service
  startQueueListener: () => ipcRenderer.invoke('start-queue-listener'),
  onQueueUpdated: (callback) => {
    ipcRenderer.on('queue-updated', callback);
    return () => ipcRenderer.removeListener('queue-updated', callback);
  },
  onQueueServerStarted: (callback) => {
    ipcRenderer.on('queue-server-started', callback);
    return () => ipcRenderer.removeListener('queue-server-started', callback);
  },
  // Playlist playback
  playPlaylist: (playlistUri) => ipcRenderer.invoke('play-playlist', playlistUri),
  // Track playback
  playTrack: (trackUri) => ipcRenderer.invoke('play-track', trackUri),
  seekTrack: (percent) => ipcRenderer.invoke('seek-track', percent),
  setShuffleState: (state) => ipcRenderer.invoke('set-shuffle-state', state),
  setRepeatMode: (mode) => ipcRenderer.invoke('set-repeat-mode', mode),
  getRecentlyPlayed: () => ipcRenderer.invoke('get-recently-played'),
  onRecentlyPlayedUpdated: (callback) => {
    ipcRenderer.on('recently-played-updated', callback);
    return () => ipcRenderer.removeListener('recently-played-updated', callback);
  },
  removeRecentlyPlayedListener: () => ipcRenderer.removeAllListeners('recently-played-updated'),
  // Pong game
  startPong: () => ipcRenderer.send('start-pong'),
  onPongState: (callback) => {
    ipcRenderer.on('pong-state', callback);
    return () => ipcRenderer.removeListener('pong-state', callback);
  },
  getInitialPongData: () => ipcRenderer.invoke('get-initial-pong-data'),
  goHome: () => ipcRenderer.invoke('go-home'),
  onGoHome: (callback) => {
    ipcRenderer.on('go-home', callback);
    return () => ipcRenderer.removeListener('go-home', callback);
  },
});
