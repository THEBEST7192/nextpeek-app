// Lyrics implementation inspired by lucid-lyrics
// https://gitlab.com/sanoojes/lucid-lyrics
// Licensed under GNU AGPLv3

import React, { useRef, useEffect, useState } from 'react';

const Lyrics = ({ currentlyPlaying, lyrics, synced, loading, error, currentTime }) => {
  const containerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const handleLyricClick = async (time) => {
    if (!currentlyPlaying?.duration || !window.electronAPI?.seekTrack) {
      return;
    }
    const durationMs = currentlyPlaying.duration;
    const percent = time / (durationMs / 1000);
    try {
      await window.electronAPI.seekTrack(Math.min(1, Math.max(0, percent)));
    } catch (err) {
      console.error('Failed to seek to lyric:', err);
    }
  };

  // Calculate active lyric line based on current playback time
  useEffect(() => {
    if (!synced || !Array.isArray(lyrics) || currentTime === undefined || currentTime === null) {
      setActiveIndex(-1);
      return;
    }

    const currentTimeSec = currentTime / 1000;
    let newActiveIndex = -1;

    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= currentTimeSec) {
        newActiveIndex = i;
      } else {
        break;
      }
    }

    setActiveIndex(newActiveIndex);

    // Auto-scroll to active line
    if (newActiveIndex >= 0 && containerRef.current) {
      const activeElement = containerRef.current.children[newActiveIndex];
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentTime, synced, lyrics]);

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

  const lyricsArray = synced && Array.isArray(lyrics) ? lyrics : lyrics.split('\n');

  return (
    <div className="queue-list">
      <div className="queue-item">
        <div className="song-item">
          <div className="song-details lyrics-content" ref={containerRef}>
            {lyricsArray.map((line, index) => {
              const text = typeof line === 'object' ? line.text : line;
              const time = typeof line === 'object' ? line.time : null;
              const isActive = synced ? index === activeIndex : false;
              const isBefore = synced && index < activeIndex;
              const isAfter = synced && index > activeIndex;
              return (
                <p
                  key={index}
                  className={`song-title lyrics-line ${isActive ? 'lyrics-line-active' : ''}`}
                  onClick={() => time !== null && handleLyricClick(time)}
                  style={{
                    cursor: time !== null ? 'pointer' : 'default',
                    opacity: isActive ? 1 : isBefore ? 0.6 : isAfter ? 0.4 : 1,
                    transition: 'opacity 0.3s ease'
                  }}
                >
                  {text}
                </p>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Lyrics;
