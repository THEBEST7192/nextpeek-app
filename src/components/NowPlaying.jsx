import React, { useState, useEffect } from 'react';
import SongDisplay from './SongDisplay.jsx';
import SearchBar from './SearchBar';

const NowPlaying = () => {
  const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    // Listen for queue updates from the main process
    if (window.electronAPI && window.electronAPI.onQueueUpdated) {
      const handleQueueUpdate = (event, data) => {
        if (data.nowPlaying) {
          setCurrentlyPlaying(data.nowPlaying);
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

  // Custom renderer for queue items
  const getImageUrl = (uri) => {
    if (uri && uri.startsWith('spotify:image:')) {
      return `https://i.scdn.co/image/${uri.split(':').pop()}`;
    }
    return uri;
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
          {albumCoverUrl && <img src={albumCoverUrl} alt={song.title} className="song-album-art" />}
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
      <SearchBar onPlaylistSelect={handlePlaylistSelect} />
      <h2 className="section-title">Now Playing</h2>
      <div className="now-playing-section">
        {currentlyPlaying && currentlyPlaying.title ? (
          <div className="queue-item" onClick={() => window.electronAPI.togglePlay()}>
            <div className="song-item">
              {getImageUrl(currentlyPlaying.album_cover) && <img src={getImageUrl(currentlyPlaying.album_cover)} alt={currentlyPlaying.title} className="song-album-art" />}
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
    </div>
  );
};

export default NowPlaying;