import React, { useState, useEffect } from 'react';
import { getCurrentlyPlaying } from '../services/spotifyService';
import SongDisplay from './SongDisplay.jsx';

const NowPlaying = ({ accessToken }) => {
  const [currentlyPlaying, setCurrentlyPlaying] = useState(null);

  useEffect(() => {
    const fetchPlaybackState = async () => {
      if (accessToken) {
        const current = await getCurrentlyPlaying(accessToken);
        setCurrentlyPlaying(current?.item || null);
      }
    };

    fetchPlaybackState();
    const interval = setInterval(fetchPlaybackState, 15000); // Refresh every 15 seconds

    return () => clearInterval(interval);
  }, [accessToken]);

  return (
    <div className="now-playing">
      <h2 className="section-title">Now Playing</h2>
      <div className="now-playing-section">
        {currentlyPlaying ? (
          <div className="now-playing-container">
            <SongDisplay song={currentlyPlaying} onClick={() => window.electronAPI.togglePlayPause()} />
          </div>
        ) : (
          <p>Nothing is currently playing.</p>
        )}
      </div>

      <h2 className="section-title">Queue</h2>
      <div className="queue-section">
        <p>Coming Soon</p>
      </div>
    </div>
  );
};

export default NowPlaying;