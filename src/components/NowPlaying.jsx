import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import SearchBar from './SearchBar';
import playIcon from '../assets/icons/play.svg';
import pauseIcon from '../assets/icons/pause.svg';
import SettingsModal from './SettingsModal.jsx';
import repeatIcon from '../assets/icons/controls/repeat.png';
import shuffleIcon from '../assets/icons/controls/shuffle.png';

const failedAlbumCoverUrls = new Set();

const getInitials = (title = '') => {
  const trimmed = title.trim();
  if (!trimmed) {
    return '?';
  }

  const initials = trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] || '')
    .join('')
    .toUpperCase();

  return initials || '?';
};

const normalizeRepeatMode = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && [0, 1, 2].includes(numeric) ? numeric : 0;
};

const NowPlaying = () => {
  const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
  const [queue, setQueue] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState(() => document.body.dataset.theme || 'solid');
  const [customImageTextColor, setCustomImageTextColor] = useState(() => document.body.dataset.customImageTextColor || 'white');
  const [shuffleMode, setShuffleMode] = useState(0); // 0: off, 1: regular, 2: smart
  const [repeatMode, setRepeatMode] = useState(0);
  const [viewMode, setViewMode] = useState('queue'); // 'queue' or 'history'
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const manualControlTimeout = useRef(null);
  const viewModeRef = useRef(viewMode);
  const prevCurrentlyPlayingUri = useRef(null);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  const manualChangeTimeout = useRef(null);
  const lastSpotifyState = useRef(null);

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onRecentlyPlayedUpdated) {
      const handleRecentlyPlayedUpdate = (event, data) => {
        // console.log('Received recentlyPlayed songs:', data);
        if (viewModeRef.current === 'history') {
          setRecentlyPlayed(data || []);
        }
      };
      window.electronAPI.onRecentlyPlayedUpdated(handleRecentlyPlayedUpdate);

      return () => {
        if (window.electronAPI.removeRecentlyPlayedListener) {
          window.electronAPI.removeRecentlyPlayedListener();
        }
      };
    }
  }, []);

  useEffect(() => {
    // Listen for queue updates from the main process
    if (window.electronAPI && window.electronAPI.onQueueUpdated) {
      const handleQueueUpdate = (event, data) => {
        // console.log('onQueueUpdated received data:', data);
        if (data.nowPlaying && data.nowPlaying.title) {
          setCurrentlyPlaying(data.nowPlaying);
          if (typeof data.nowPlaying.isPlaying === 'boolean') {
            setIsPlaying(data.nowPlaying.isPlaying);
            lastSpotifyState.current = data.nowPlaying.isPlaying;
          }
        } else {
          setCurrentlyPlaying(null);
          setIsPlaying(false);
          lastSpotifyState.current = null;
        }
        if (typeof data.shuffle === 'number') {
          if (!manualControlTimeout.current?.shuffle) {
            setShuffleMode(data.shuffle);
          }
        } else if (typeof data.nowPlaying?.shuffle === 'number') {
          if (!manualControlTimeout.current?.shuffle) {
            setShuffleMode(data.nowPlaying.shuffle);
          }
        }

        const incomingRepeatMode = normalizeRepeatMode(
          data.repeatMode ?? data.nowPlaying?.repeatMode
        );
        if (!manualControlTimeout.current?.repeat) {
          setRepeatMode(incomingRepeatMode);
        }

        if (data.queue) {
          // Filter out songs after delimiter
          const delimiterIndex = data.queue.findIndex(song => song.uri === 'spotify:delimiter');
          const filteredQueue = delimiterIndex >= 0 ? data.queue.slice(0, delimiterIndex) : data.queue;
          setQueue(filteredQueue);
        }
      };

      window.electronAPI.onQueueUpdated(handleQueueUpdate);

      // Clean up listener
      return () => {
        if (window.electronAPI.removeQueueUpdatedListener) {
          window.electronAPI.removeQueueUpdatedListener();
        }
      };
    }
  }, []);

  useEffect(() => {
    if (window.electronAPI?.onPlayStateChange) {
      const handler = (event, playState) => {
        lastSpotifyState.current = playState;
        if (!manualChangeTimeout.current) {
          setIsPlaying(playState);
        }
      };

      const unsubscribe = window.electronAPI.onPlayStateChange(handler);

      return () => {
        if (manualChangeTimeout.current) {
          clearTimeout(manualChangeTimeout.current);
          manualChangeTimeout.current = null;
        }
        if (manualControlTimeout.current) {
          if (manualControlTimeout.current.shuffle?.timeout) {
            clearTimeout(manualControlTimeout.current.shuffle.timeout);
          }
          if (manualControlTimeout.current.repeat?.timeout) {
            clearTimeout(manualControlTimeout.current.repeat.timeout);
          }
          manualControlTimeout.current = null;
        }

        if (typeof unsubscribe === 'function') {
          unsubscribe();
        } else {
          window.electronAPI.removePlayStateListener?.(handler);
        }
      };
    }

    return undefined;
  }, []);

  const scheduleControlSyncReset = useCallback((type) => {
    if (!manualControlTimeout.current) {
      manualControlTimeout.current = {};
    }

    const existing = manualControlTimeout.current[type];
    if (existing?.timeout) {
      clearTimeout(existing.timeout);
    }

    const timeout = setTimeout(() => {
      if (manualControlTimeout.current?.[type]) {
        manualControlTimeout.current[type] = null;
      }
    }, 1500);

    manualControlTimeout.current[type] = { timeout };
  }, []);

  const handleToggleShuffle = useCallback(async () => {
    if (!window.electronAPI?.setShuffleState) {
      return;
    }

    // Treat any non-zero UI state (1 or smart 2) as "on" to keep toggling binary
    const normalizedCurrent = shuffleMode === 0 ? 0 : 1;
    // Flip between 0->1 or 1->0; smart mode is only displayed and never emitted
    const nextState = normalizedCurrent === 1 ? 0 : 1;

    setShuffleMode(nextState);
    scheduleControlSyncReset('shuffle');

    try {
      await window.electronAPI.setShuffleState(nextState);
    } catch (error) {
      console.error('Failed to set shuffle state:', error);
    }
  }, [shuffleMode, scheduleControlSyncReset]);

  const shuffleButtonProps = useMemo(() => {
    if (shuffleMode === 2) {
      return {
        className: 'control-button active smart-shuffle',
        ariaLabel: 'Smart shuffle'
      };
    }
    if (shuffleMode === 1) {
      return {
        className: 'control-button active',
        ariaLabel: 'Disable shuffle'
      };
    }
    return {
      className: 'control-button',
      ariaLabel: 'Enable shuffle'
    };
  }, [shuffleMode]);

  const cycleRepeatMode = (mode) => {
    switch (mode) {
      case 0:
        return 1; // repeat all
      case 1:
        return 2; // repeat one
      default:
        return 0; // back to no repeat
    }
  };

  const handleToggleRepeat = useCallback(async () => {
    if (!window.electronAPI?.setRepeatMode) {
      return;
    }

    const nextMode = cycleRepeatMode(repeatMode);
    setRepeatMode(nextMode);
    scheduleControlSyncReset('repeat');

    try {
      await window.electronAPI.setRepeatMode(nextMode);
    } catch (error) {
      console.error('Failed to set repeat mode:', error);
    }
  }, [repeatMode, scheduleControlSyncReset]);

  const repeatAriaLabel = useMemo(() => {
    switch (repeatMode) {
      case 2:
        return 'Repeat one enabled';
      case 1:
        return 'Repeat all enabled';
      default:
        return 'Repeat off';
    }
  }, [repeatMode]);

  const repeatButtonClass = useMemo(() => {
    if (repeatMode === 2) {
      return 'control-button active repeat-one';
    }
    if (repeatMode === 1) {
      return 'control-button active';
    }
    return 'control-button';
  }, [repeatMode]);

  const handleTogglePlayPause = useCallback(() => {
    if (!window.electronAPI?.togglePlayPause) {
      return;
    }

    window.electronAPI.togglePlayPause();

    setIsPlaying((prev) => !prev);

    if (manualChangeTimeout.current) {
      clearTimeout(manualChangeTimeout.current);
    }

    manualChangeTimeout.current = setTimeout(() => {
      if (lastSpotifyState.current !== null) {
        setIsPlaying(lastSpotifyState.current);
      }
      manualChangeTimeout.current = null;
    }, 500);
  }, []);

  // Custom renderer for queue items
  const getImageUrl = (uri) => {
    if (uri && uri.startsWith('spotify:image:')) {
      return `https://i.scdn.co/image/${uri.split(':').pop()}`;
    }
    return uri;
  };

  const SongArt = ({ albumCoverUrl, title, overlayIcon = playIcon }) => {
    const [failureVersion, setFailureVersion] = useState(0);

    useEffect(() => {
      if (albumCoverUrl && failedAlbumCoverUrls.has(albumCoverUrl)) {
        setFailureVersion((version) => version + 1);
      }
    }, [albumCoverUrl]);

    const effectiveUrl = useMemo(() => {
      if (!albumCoverUrl) {
        return null;
      }
      if (failedAlbumCoverUrls.has(albumCoverUrl)) {
        return null;
      }
      return albumCoverUrl;
    }, [albumCoverUrl, failureVersion]);

    const handleImageError = () => {
      if (albumCoverUrl) {
        failedAlbumCoverUrls.add(albumCoverUrl);
        setFailureVersion((version) => version + 1);
      }
    };

    return (
      <div className="song-art">
        {effectiveUrl ? (
          <img
            src={effectiveUrl}
            alt={title}
            className="song-album-art"
            onError={handleImageError}
          />
        ) : (
          <div className="song-art-placeholder" aria-hidden="true">
            {getInitials(title)}
          </div>
        )}
        <div className="song-art-hover">
          <img src={overlayIcon} alt="" aria-hidden="true" />
        </div>
      </div>
    );
  };

  const renderQueueItem = (song, index) => {
    if (!song) return null;
    
    const albumCoverUrl = getImageUrl(song.album_cover);

    return (
      <div
        key={index}
        className="queue-item"
        onClick={async () => {
          try {
            if (song.uri && window.electronAPI && window.electronAPI.playTrack) {
              await window.electronAPI.playTrack(song.uri);
            }
          } catch (e) {
            console.error('Failed to jump to track:', e);
          }
        }}
      >
        <div className="song-item">
          <SongArt albumCoverUrl={albumCoverUrl} title={song.title} />
          <div className="song-details">
            <p className="song-title truncate-text">{song.title}</p>
            <p className="song-artist">{song.artist}</p>
          </div>
        </div>
      </div>
    );
  };

  const handlePlaylistSelect = async (playlist) => {
    console.log('Selected playlist:', playlist);
    try {
      if (window.electronAPI && window.electronAPI.playPlaylist) {
        await window.electronAPI.playPlaylist(playlist.uri);
        console.log('Playing playlist:', playlist.name);
      } else {
        console.error('playPlaylist API not available');
      }
    } catch (error) {
      console.error('Failed to play playlist:', error);
    }
  };

  const handleUploadImage = useCallback(async () => {
    if (!window.electronAPI?.uploadCustomBackground) {
      return;
    }

    try {
      const response = await window.electronAPI.uploadCustomBackground();
      if (!response?.canceled && response?.theme === 'customImage') {
        setCurrentTheme(response.theme);
      }
    } catch (error) {
      console.error('Failed to upload custom background image:', error);
    }
  }, []);

  const handleCustomImageTextColorChange = useCallback(async (color) => {
    if (!window.electronAPI?.setCustomImageTextColor) {
      return;
    }

    try {
      const response = await window.electronAPI.setCustomImageTextColor(color);
      if (response?.success) {
        setCustomImageTextColor(color);
      }
    } catch (error) {
      console.error('Failed to set custom image text color:', error);
    }
  }, []);

  const handleViewQueue = () => setViewMode('queue');
   
  const handleViewHistory = () => {
    console.log("Switching to History view");
    setViewMode('history');
  };

  useEffect(() => {
      if (window.electronAPI?.getRecentlyPlayed && viewMode === 'history') {
        // console.log("Requesting recently played tracks due to viewMode or currentlyPlaying change...");
        window.electronAPI.getRecentlyPlayed();
    }
  }, [viewMode]);

  useEffect(() => {
    if (window.electronAPI?.getRecentlyPlayed && viewMode === 'history') {
      const currentUri = currentlyPlaying?.uri;
      // console.log('currentlyPlaying URI effect: currentUri=', currentUri, 'prevUri=', prevCurrentlyPlayingUri.current);
      if (currentUri && currentUri !== prevCurrentlyPlayingUri.current) {
        // console.log("Requesting recently played tracks due to currentlyPlaying URI change...");
        window.electronAPI.getRecentlyPlayed();
      }
      prevCurrentlyPlayingUri.current = currentUri;
    }
  }, [currentlyPlaying?.uri, viewMode]);

  const dedupedRecentlyPlayed = useMemo(() => {
    let tracksToDedupe = recentlyPlayed;

    // If there's a currently playing song and it's the first in recentlyPlayed, cut out the first song.
    if (currentlyPlaying && tracksToDedupe.length > 0 && tracksToDedupe[0].uri === currentlyPlaying.uri) {
      tracksToDedupe = tracksToDedupe.slice(1);
    }

    const result = [];
    for (const item of tracksToDedupe) {
      const last = result[result.length - 1];
      if (!last || last?.uri !== item?.uri) {
        result.push(item);
      }
    }
    return result;
  }, [recentlyPlayed, currentlyPlaying]);

  return (
     <div className="now-playing">
      <SearchBar
        onPlaylistSelect={handlePlaylistSelect}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />
      <div className="section-header">
        <h2 className="section-title">Now Playing</h2>
        <div className="playback-controls">
          <button 
            className={shuffleButtonProps.className}
            onClick={handleToggleShuffle}
            aria-label={shuffleButtonProps.ariaLabel}
          >
            <img src={shuffleIcon} alt="" />
            {shuffleMode === 2 && <span className="smart-shuffle-star">✦</span>}
          </button>
          <button 
            className={repeatButtonClass}
            onClick={handleToggleRepeat}
            aria-label={repeatAriaLabel}
          >
            <img src={repeatIcon} alt="" />
          </button>
        </div>
      </div>
      <div className="now-playing-section">
        {currentlyPlaying && currentlyPlaying.title ? (
          <div className="queue-item" onClick={handleTogglePlayPause}>
            <div className="song-item">
              <SongArt
                albumCoverUrl={getImageUrl(currentlyPlaying.album_cover)}
                title={currentlyPlaying.title}
                overlayIcon={isPlaying ? pauseIcon : playIcon}
              />
              <div className="song-details">
                <p className="song-title truncate-text">{currentlyPlaying.title}</p>
                <p className="song-artist">{currentlyPlaying.artist}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="no-playing-message"><span>Nothing is currently playing</span><div className="empty-message-spacer"></div></div>
        )}
      </div>

      <div className="view-toggle">
        <h2
          className={`section-title ${viewMode === 'queue' ? 'active' : ''}`}
          onClick={handleViewQueue}
        >
          Queue
        </h2>
        <h2
          className={`section-title ${viewMode === 'history' ? 'active' : ''}`}
          onClick={handleViewHistory}
        >
          History
        </h2>
      </div>

       <div className="queue-section">
         {viewMode === 'queue' ? (
           queue.length > 0 ? (
             <div className="queue-list">
               {queue.map((song, index) => renderQueueItem(song, index))}
             </div>
           ) : (
             <div className="queue-empty-message"><span>Queue is empty</span><div className="empty-message-spacer"></div></div>
           )
         ) : (
           dedupedRecentlyPlayed.length > 0 ? (
             <div className="queue-list">
               {dedupedRecentlyPlayed.map((song, index) => renderQueueItem(song, index))}
             </div>
           ) : (
             <div className="queue-empty-message"><span>No recently played tracks</span><div className="empty-message-spacer"></div></div>
           )
         )}
       </div>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentTheme={currentTheme}
        onThemeChange={(themeKey) => {
          if (window.electronAPI?.toggleTheme) {
            window.electronAPI.toggleTheme(themeKey);
          }
        }}
        onUploadImage={handleUploadImage}
        customImageTextColor={customImageTextColor}
        onCustomImageTextColorChange={handleCustomImageTextColorChange}
      />
    </div>
  );
};

export default NowPlaying;