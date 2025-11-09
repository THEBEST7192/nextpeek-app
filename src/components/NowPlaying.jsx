import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import SearchBar from './SearchBar';
import playIcon from '../assets/icons/play.svg';
import pauseIcon from '../assets/icons/pause.svg';
import SettingsModal from './SettingsModal.jsx';

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

const NowPlaying = () => {
  const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
  const [queue, setQueue] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState(() => document.body.dataset.theme || 'solid');
  const manualChangeTimeout = useRef(null);
  const lastSpotifyState = useRef(null);

  useEffect(() => {
    // Listen for queue updates from the main process
    if (window.electronAPI && window.electronAPI.onQueueUpdated) {
      const handleQueueUpdate = (event, data) => {
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
        if (data.queue) {
          setQueue(data.queue);
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
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        } else {
          window.electronAPI.removePlayStateListener?.(handler);
        }
      };
    }

    return undefined;
  }, []);

  useEffect(() => {
    if (window.electronAPI?.onThemeChange) {
      const handler = (event, themeKey) => {
        setCurrentTheme(themeKey);
      };

      const unsubscribe = window.electronAPI.onThemeChange(handler);

      return () => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        } else {
          window.electronAPI.removeThemeChangeListener?.(handler);
        }
      };
    }

    return undefined;
  }, []);

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

  return (
    <div className="now-playing">
      <SearchBar
        onPlaylistSelect={handlePlaylistSelect}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />
      <h2 className="section-title">Now Playing</h2>
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
          <p className="no-playing-message">Nothing is currently playing.</p>
        )}
      </div>

      <h2 className="section-title">Queue</h2>
      <div className="queue-section">
        {queue.length > 0 ? (
          <div className="queue-list">
            {queue.map((song, index) => renderQueueItem(song, index))}
          </div>
        ) : (
          <p className="queue-empty-message">Queue is empty</p>
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
      />
    </div>
  );
};

export default NowPlaying;