import React from 'react';

const getImageUrl = (uri) => {
  if (uri && uri.startsWith('spotify:image:')) {
    return `https://i.scdn.co/image/${uri.split(':').pop()}`;
  }
  return uri;
};

const SongDisplay = ({ song, onClick }) => {
  if (!song) {
    return null;
  }

  const title = song.name || song.title || 'Unknown Title';
  const artist = song.artists ? song.artists.map(a => a.name).join(', ') : (song.artist || 'Unknown Artist');
  const albumName = song.album?.name || '';
  const albumArt = getImageUrl(song.album?.images?.[0]?.url || song.album_cover || song.albumArt || '');

  return (
    <div className="song-item" onClick={onClick}>
      {albumArt ? (
        <img src={albumArt} alt={albumName} className="song-album-art" />
      ) : (
        <div className="song-art-placeholder">{title.charAt(0)}</div>
      )}
      <div className="song-details">
        <p className="song-title truncate-text">{title}</p>
        <p className="song-artist">{artist}</p>
      </div>
    </div>
  );
};

export default SongDisplay;