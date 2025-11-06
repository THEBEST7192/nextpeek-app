import React, { useState } from 'react';
import './SearchBar.css';

// Mock playlist data
const mockPlaylists = [
  { id: 1, name: 'Heavy Metal Essentials', description: 'Classic and modern metal anthems', tracks: 28 },
  { id: 2, name: 'Thrash Metal Mayhem', description: 'Fast riffs and aggressive vocals', tracks: 35 },
  { id: 3, name: 'Progressive Metal Journey', description: 'Complex compositions and time signatures', tracks: 22 },
  { id: 4, name: '80s Rock Anthems', description: 'The best of 80s hard rock and heavy metal', tracks: 42 },
  { id: 5, name: 'Black Metal Legends', description: 'Atmospheric and raw black metal classics', tracks: 19 },
  { id: 6, name: 'Power Metal Heroes', description: 'Epic vocals and soaring melodies', tracks: 31 },
  { id: 7, name: 'Doom Metal Monolith', description: 'Slow, heavy, and crushing riffs', tracks: 16 },
];

const SearchBar = ({ onPlaylistSelect }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isFocused, setIsFocused] = useState(false);

  const handleSearch = (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    
    if (term.trim() === '') {
      setSearchResults([]);
      return;
    }

    // Simple search through mock playlists
    const results = mockPlaylists.filter(playlist =>
      playlist.name.toLowerCase().includes(term.toLowerCase()) ||
      playlist.description.toLowerCase().includes(term.toLowerCase())
    );
    
    setSearchResults(results);
  };

  const handlePlaylistSelect = (playlist) => {
    setSearchTerm('');
    setSearchResults([]);
    if (onPlaylistSelect) {
      onPlaylistSelect(playlist);
    }
  };

  return (
    <div className="search-container">
      <input
        type="text"
        placeholder="Search playlists..."
        value={searchTerm}
        onChange={handleSearch}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 200)} // Small delay to allow click on results
        className="search-input"
      />
      {(searchResults.length > 0 && isFocused) && (
        <div className="search-results">
          {searchResults.map((playlist) => (
            <div 
              key={playlist.id} 
              className="search-result-item"
              onMouseDown={() => handlePlaylistSelect(playlist)} // Use onMouseDown to fire before onBlur
            >
              <div className="search-result-name">{playlist.name}</div>
              <div className="search-result-description">
                {playlist.description} • {playlist.tracks} tracks
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
