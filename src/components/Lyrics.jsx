// Lyrics implementation inspired by lucid-lyrics
// https://gitlab.com/sanoojes/lucid-lyrics
// Licensed under GNU AGPLv3

import React from 'react';

const Lyrics = ({ currentlyPlaying, lyrics, loading, error }) => {
  if (!currentlyPlaying) {
    return (
      <div className="queue-empty-message">
        <span>No track playing</span>
        <div className="empty-message-spacer"></div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="queue-empty-message">
        <span>Loading lyrics...</span>
        <div className="empty-message-spacer"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="queue-empty-message">
        <span>{error}</span>
        <div className="empty-message-spacer"></div>
      </div>
    );
  }

  if (!lyrics) {
    return (
      <div className="queue-empty-message">
        <span>No lyrics available</span>
        <div className="empty-message-spacer"></div>
      </div>
    );
  }

  return (
    <div className="queue-list">
      <div className="queue-item">
        <div className="song-item">
          <div className="song-details lyrics-content">
            {lyrics.split('\n').map((line, index) => (
              <p key={index} className="song-title lyrics-line">{line}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Lyrics;
