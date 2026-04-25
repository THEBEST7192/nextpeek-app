import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import SearchBar from './SearchBar';
import SettingsModal from './SettingsModal';
import Lyrics from './Lyrics';
import { fetchLyrics } from '../services/lrclib';
import playIcon from '../assets/icons/play.svg';
import pauseIcon from '../assets/icons/pause.svg';
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

const clampPercent = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const NowPlaying = () => {
  const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
  const [queue, setQueue] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState(() => document.body.dataset.theme || 'solid');
  const [customImageTextColor, setCustomImageTextColor] = useState(() => document.body.dataset.customImageTextColor || 'white');
  const [alwaysOnTopWhenPinned, setAlwaysOnTopWhenPinned] = useState(true);
  const [alwaysOnTopWhenUnpinned, setAlwaysOnTopWhenUnpinned] = useState(true);
  const [shuffleMode, setShuffleMode] = useState(0); // 0: off, 1: regular, 2: smart
  const [repeatMode, setRepeatMode] = useState(0);
  const [viewMode, setViewMode] = useState('queue'); // 'queue', 'history', or 'lyrics'
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const [lyrics, setLyrics] = useState(null);
  const [lyricsSynced, setLyricsSynced] = useState(false);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState(null);
  const prevLyricsTrackUri = useRef(null);
  const manualControlTimeout = useRef(null);
  const manualChangeTimeout = useRef(null);
  const lastSpotifyState = useRef(null);
  const viewModeRef = useRef(viewMode);
  const prevCurrentlyPlayingUri = useRef(null);
  const progressHitboxRef = useRef(null);
  const progressBarRef = useRef(null);
  const manualSeekTimeoutRef = useRef(null);

  const [isSeeking, setIsSeeking] = useState(false);
  const [pendingSeekPercent, setPendingSeekPercent] = useState(null);
  const [manualSeekPercent, setManualSeekPercent] = useState(null);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  const getPercentFromClientX = useCallback((clientX) => {
    const rect = progressBarRef.current?.getBoundingClientRect();

    if (!rect || rect.width === 0) {
      return 0;
    }
    const rawPercent = (clientX - rect.left) / rect.width;
    return clampPercent(rawPercent);
  }, []);

  const clearManualSeekHold = useCallback(() => {
    if (manualSeekTimeoutRef.current) {
      clearTimeout(manualSeekTimeoutRef.current);
      manualSeekTimeoutRef.current = null;
    }
    setManualSeekPercent(null);
  }, []);

  const scheduleManualSeekFallbackClear = useCallback(() => {
    if (manualSeekTimeoutRef.current) {
      clearTimeout(manualSeekTimeoutRef.current);
    }
    manualSeekTimeoutRef.current = setTimeout(() => {
      setManualSeekPercent(null);
      manualSeekTimeoutRef.current = null;
    }, 2000); // Reduced to 2 seconds for better responsiveness
  }, []);

  const performSeek = useCallback(async (percent) => {
    if (!window.electronAPI?.seekTrack || !currentlyPlaying?.duration) {
      return;
    }
    const clampedValue = clampPercent(percent);
    
    // Update the UI immediately
    setManualSeekPercent(clampedValue);
    
    try {
      await window.electronAPI.seekTrack(clampedValue);
      // After successful seek, schedule clearing the manual seek hold
      scheduleManualSeekFallbackClear();
    } catch (error) {
      console.error('Failed to seek track:', error);
      // If seek fails, clear the manual seek immediately
      clearManualSeekHold();
    }
  }, [currentlyPlaying?.duration]);

  const handleSeekPointerDown = useCallback((event) => {
    if (!currentlyPlaying?.duration) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    progressHitboxRef.current?.setPointerCapture?.(event.pointerId);

    const percent = getPercentFromClientX(event.clientX);

    setPendingSeekPercent(percent);
    setIsSeeking(true);
  }, [currentlyPlaying?.duration, getPercentFromClientX]);

  const handleSeekPointerMove = useCallback((event) => {
    if (!isSeeking) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const percent = getPercentFromClientX(event.clientX);
    setPendingSeekPercent(percent);
  }, [getPercentFromClientX, isSeeking]);

  const concludeSeek = useCallback(async (clientX, pointerId) => {
    progressHitboxRef.current?.releasePointerCapture?.(pointerId);

    const percent = getPercentFromClientX(clientX);
    setIsSeeking(false);
    setPendingSeekPercent(null);
    setManualSeekPercent(percent);
    scheduleManualSeekFallbackClear();
    await performSeek(percent);
  }, [getPercentFromClientX, performSeek, scheduleManualSeekFallbackClear]);

  const handleSeekPointerUp = useCallback((event) => {
    if (!isSeeking) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    concludeSeek(event.clientX, event.pointerId);
  }, [concludeSeek, isSeeking]);

  const handleSeekPointerCancel = useCallback((event) => {
    if (!isSeeking) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    progressHitboxRef.current?.releasePointerCapture?.(event.pointerId);

    setIsSeeking(false);
    setPendingSeekPercent(null);
  }, [isSeeking]);

  const effectiveProgressPercent = useMemo(() => {
    // Always respect manual seek position if it exists, regardless of isSeeking state
    if (manualSeekPercent !== null) {
      return clampPercent(manualSeekPercent);
    }
    if (isSeeking && pendingSeekPercent !== null) {
      return clampPercent(pendingSeekPercent);
    }
    const actual = currentlyPlaying?.progressPercent ?? 0;
    return clampPercent(actual);
  }, [currentlyPlaying?.progressPercent, isSeeking, manualSeekPercent, pendingSeekPercent]);

  const displayedProgressLabel = useMemo(() => {
    const duration = currentlyPlaying?.duration || 0;
    
    // If we have a manual seek position, use that
    if (manualSeekPercent !== null) {
      const seconds = Math.floor(manualSeekPercent * duration / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
    }
    
    // If we're currently seeking, use the pending seek position
    if (isSeeking && pendingSeekPercent !== null) {
      const seconds = Math.floor(pendingSeekPercent * duration / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
    }
    
    // Otherwise, use the formatted progress from the currently playing track
    return currentlyPlaying?.formattedProgress || '0:00';
  }, [currentlyPlaying?.duration, currentlyPlaying?.formattedProgress, isSeeking, manualSeekPercent, pendingSeekPercent]);

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onRecentlyPlayedUpdated) {
      const handleRecentlyPlayedUpdate = (event, data) => {
        // console.log('Received recentlyPlayed songs:', data);
        setRecentlyPlayed(data || []);
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
    const updateStates = (states) => {
      setAlwaysOnTopWhenPinned(states.whenPinned);
      setAlwaysOnTopWhenUnpinned(states.whenUnpinned);
    };

    // Fetch initial always-on-top states when component mounts
    const fetchStates = async () => {
      if (window.electronAPI && window.electronAPI.getAlwaysOnTopStates) {
        try {
          const states = await window.electronAPI.getAlwaysOnTopStates();
          updateStates(states);
        } catch (error) {
          console.error('Failed to fetch always-on-top states:', error);
        }
      }
    };
    fetchStates();

    // Listen for changes from main process
    if (window.electronAPI && window.electronAPI.onAlwaysOnTopStatesChange) {
      const handler = (event, states) => {
        updateStates(states);
      };
      const unsubscribe = window.electronAPI.onAlwaysOnTopStatesChange(handler);
      return unsubscribe;
    }
  }, []);

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onQueueUpdated) {
      const handleQueueUpdate = (event, data) => {
        if (import.meta.env.DEV) {
          console.log('onQueueUpdated received data:', {
            duration: data.nowPlaying?.duration,
            progress: data.nowPlaying?.progress,
            formattedDuration: data.nowPlaying?.formattedDuration,
            formattedProgress: data.nowPlaying?.formattedProgress,
            progressPercent: data.nowPlaying?.progressPercent,
          });
        }
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

        const delimiterIndex = data.queue.findIndex(song => song.uri === 'spotify:delimiter');
        const filteredQueue = delimiterIndex >= 0 ? data.queue.slice(0, delimiterIndex) : data.queue;
        setQueue(filteredQueue);
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
        clearManualSeekHold();
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

    const normalizedCurrent = shuffleMode === 0 ? 0 : 1;
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

    const albumCoverUrl = getImageUrl(song.album?.images?.[0]?.url || song.album_cover || song.albumArt);
    const title = song.name || song.title || 'Unknown Title';
    const artist = song.artists ? song.artists.map(a => a.name).join(', ') : (song.artist || 'Unknown Artist');

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
          <SongArt albumCoverUrl={albumCoverUrl} title={title} />
          <div className="song-details">
            <p className="song-title truncate-text">{title}</p>
            <p className="song-artist">{artist}</p>
          </div>
        </div>
      </div>
    );
  };

  const handlePlaylistSelect = async (playlist) => {
    if (import.meta.env.DEV) {
      console.log('Selected playlist:', playlist);
    }
    try {
      if (window.electronAPI && window.electronAPI.playPlaylist) {
        await window.electronAPI.playPlaylist(playlist.uri);
        if (import.meta.env.DEV) {
          console.log('Playing playlist:', playlist.name);
        }
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
    if (import.meta.env.DEV) {
      console.log("Switching to History view");
    }
    setViewMode('history');
  };

  const handleViewLyrics = () => {
    if (import.meta.env.DEV) {
      console.log("Switching to Lyrics view");
    }
    setViewMode('lyrics');
  };

  useEffect(() => {
    if (window.electronAPI?.getRecentlyPlayed && viewMode === 'history') {
      window.electronAPI.getRecentlyPlayed();
    }
  }, [viewMode]);

  useEffect(() => {
    if (window.electronAPI?.getRecentlyPlayed && viewMode === 'history') {
      const currentUri = currentlyPlaying?.uri;
      if (currentUri && currentUri !== prevCurrentlyPlayingUri.current) {
        window.electronAPI.getRecentlyPlayed();
      }
      prevCurrentlyPlayingUri.current = currentUri;
    }
  }, [currentlyPlaying?.uri, viewMode]);

  useEffect(() => {
    let isCancelled = false;
    const fetchLyricsForTrack = async () => {
      if (!currentlyPlaying) {
        setLyrics(null);
        setLyricsError(null);
        prevLyricsTrackUri.current = null;
        return;
      }

      const currentUri = currentlyPlaying.uri;
      // Only fetch if the track URI has changed
      if (currentUri === prevLyricsTrackUri.current) {
        return;
      }

      setLyricsLoading(true);
      setLyricsError(null);

      try {
        const title = currentlyPlaying.title || currentlyPlaying.name;
        const artist = currentlyPlaying.artists
          ? currentlyPlaying.artists.map((a) => a.name).join(', ')
          : currentlyPlaying.artist;
        const album = currentlyPlaying.album?.name || '';
        const duration = currentlyPlaying.duration || 0;

        const result = await fetchLyrics(title, artist, album, duration);

        // Only update state if fetch wasn't cancelled
        if (!isCancelled) {
          console.log('Fetch lyrics result:', result);

          if (result.success) {
            setLyrics(result.lyrics);
            setLyricsSynced(result.synced || false);
          } else {
            setLyricsError(result.error);
            setLyricsSynced(false);
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setLyricsError('Failed to load lyrics');
          console.error('Lyrics fetch error:', err);
        }
      } finally {
        if (!isCancelled) {
          setLyricsLoading(false);
        }
      }

      if (!isCancelled) {
        prevLyricsTrackUri.current = currentUri;
      }
    };

    fetchLyricsForTrack();

    // Cleanup function to cancel pending fetch when track changes
    return () => {
      isCancelled = true;
    };
  }, [currentlyPlaying?.uri]);

  const dedupedRecentlyPlayed = useMemo(() => {
    if (!recentlyPlayed || recentlyPlayed.length === 0) {
      return [];
    }

    const currentUri = currentlyPlaying?.uri;
    const result = [];
    let lastAddedUri = null;

    for (const item of recentlyPlayed) {
      // Skip if this item is the currently playing song
      if (currentUri && item.uri === currentUri) {
        continue;
      }

      // Skip if this item is a consecutive duplicate of the last added item
      if (item.uri === lastAddedUri) {
        continue;
      }

      result.push(item);
      lastAddedUri = item.uri;
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
        {currentlyPlaying && (currentlyPlaying.title || currentlyPlaying.name) ? (
          <div className="queue-item" onClick={handleTogglePlayPause}>
            <div className="song-item">
              <SongArt
                albumCoverUrl={getImageUrl(
                  currentlyPlaying.album?.images?.[0]?.url ||
                  currentlyPlaying.album_cover ||
                  currentlyPlaying.albumArt
                )}
                title={currentlyPlaying.title || currentlyPlaying.name}
                overlayIcon={isPlaying ? pauseIcon : playIcon}
              />
              <div className="song-details">
                <p className="song-title">
                  {currentlyPlaying.title || currentlyPlaying.name}
                </p>
                <p className="song-artist truncate-text">
                  {currentlyPlaying.artists
                    ? currentlyPlaying.artists.map((a) => a.name).join(', ')
                    : currentlyPlaying.artist || 'Unknown Artist'}
                </p>
              </div>
              <div
                className="song-progress-hitbox"
                ref={progressHitboxRef}
                role="slider"
                aria-label="Seek through the current track"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(effectiveProgressPercent * 100)}
                onPointerDown={handleSeekPointerDown}
                onPointerMove={handleSeekPointerMove}
                onPointerUp={handleSeekPointerUp}
                onPointerCancel={handleSeekPointerCancel}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="song-progress-container" ref={progressBarRef}>
                  <div
                    className="song-progress-bar"
                    style={{ width: `${(effectiveProgressPercent * 100) || 0}%` }}
                  ></div>
                </div>
              </div>
              <div className="song-time-display">
                <span className="song-progress-time">{displayedProgressLabel}</span>
                /
                <span className="song-duration-time">
                  {currentlyPlaying?.formattedDuration || '0:00'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="no-playing-message">
            <span>Nothing is currently playing</span>
            <div className="empty-message-spacer"></div>
          </div>
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
        <h2
          className={`section-title ${viewMode === 'lyrics' ? 'active' : ''}`}
          onClick={handleViewLyrics}
        >
          Lyrics
        </h2>
      </div>

      <div className="queue-section">
        {viewMode === 'queue' ? (
          queue.length > 0 ? (
            <div className="queue-wrapper">
              <div className="queue-scroll">
                {queue.map((song, index) => renderQueueItem(song, index))}
              </div>
            </div>
          ) : (
            <div className="queue-empty-message">
              <span>Queue is empty</span>
              <div className="empty-message-spacer"></div>
            </div>
          )
        ) : viewMode === 'history' ? (
          dedupedRecentlyPlayed.length > 0 ? (
            <div className="queue-wrapper">
              <div className="queue-scroll">
                {dedupedRecentlyPlayed.map((song, index) =>
                  renderQueueItem(song, index)
                )}
              </div>
            </div>
          ) : (
            <div className="queue-empty-message">
              <span>No recently played tracks</span>
              <div className="empty-message-spacer"></div>
            </div>
          )
        ) : (
          <div className="queue-wrapper">
            <div className="queue-scroll">
              <Lyrics
                currentlyPlaying={currentlyPlaying}
                lyrics={lyrics}
                synced={lyricsSynced}
                loading={lyricsLoading}
                error={lyricsError}
                currentTime={currentlyPlaying?.progressPercent ? currentlyPlaying.progressPercent * (currentlyPlaying.duration || 0) : 0}
              />
            </div>
          </div>
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
        alwaysOnTopWhenPinned={alwaysOnTopWhenPinned}
        alwaysOnTopWhenUnpinned={alwaysOnTopWhenUnpinned}
        onAlwaysOnTopWhenPinnedChange={async (value) => {
          const newState = await window.electronAPI.toggleAlwaysOnTopWhenPinned();
          setAlwaysOnTopWhenPinned(newState);
        }}
        onAlwaysOnTopWhenUnpinnedChange={async (value) => {
          const newState = await window.electronAPI.toggleAlwaysOnTopWhenUnpinned();
          setAlwaysOnTopWhenUnpinned(newState);
        }}
      />
    </div>
  );
};

export default NowPlaying;