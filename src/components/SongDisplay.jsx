import React from 'react';

const SongDisplay = ({ song, onClick }) => {
  if (!song) {
    return null;
  }

  return (
    <div className="song-item" onClick={onClick}>
      <img src={song.album.images[0].url} alt={song.album.name} className="song-album-art" />
      <div className="song-details" style={{ maxWidth: '200px' }}>
        <p className="song-title truncate-text">{song.name}</p>
        <p className="song-artist">{song.artists.map(artist => artist.name).join(', ')}</p>
      </div>
    </div>
  );
};

export default SongDisplay;