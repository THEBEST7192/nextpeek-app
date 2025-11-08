import React, { useState, useCallback, useEffect, useRef } from 'react';
import settingsIcon from '../assets/icons/settings.svg';
import './SearchBar.css';

const SearchBar = ({ onPlaylistSelect, onSettingsClick }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceTimeout = useRef(null);

  const searchPlaylists = useCallback(async (term) => {
    if (term.trim() === '') {
      setSearchResults([]);
      setIsLoading(false);
      return;
    }

    // Fetch playlists from the API
    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:7192/api/searchPlaylists?q=${encodeURIComponent(term)}`);
      const data = await response.json();
      setSearchResults(data.playlists || []);
    } catch (error) {
      console.error('Failed to search playlists:', error);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSearch = useCallback((e) => {
    const term = e.target.value;
    setSearchTerm(term);
    
    // Clear previous timeout
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    
    if (term.trim() === '') {
      setSearchResults([]);
      setIsLoading(false);
      return;
    }

    // Set loading state immediately
    setIsLoading(true);
    
    // Debounce the search
    debounceTimeout.current = setTimeout(() => {
      searchPlaylists(term);
    }, 300);
  }, [searchPlaylists]);

  useEffect(() => {
    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, []);

  const handlePlaylistSelect = (playlist) => {
    setSearchTerm('');
    setSearchResults([]);
    if (onPlaylistSelect) {
      onPlaylistSelect(playlist);
    }
  };

  return (
    <div className="search-container">
      <div className="search-input-wrapper">
        <input
          type="text"
          placeholder="Search playlists..."
          value={searchTerm}
          onChange={handleSearch}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)} // Small delay to allow click on results
          className="search-input"
        />
        <button
          type="button"
          className="search-settings-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (onSettingsClick) {
              onSettingsClick();
            }
          }}
          aria-label="Open settings"
        >
          <img src={settingsIcon} alt="" aria-hidden="true" />
        </button>
      </div>
      {isFocused && (isLoading || searchResults.length > 0 || (searchTerm.trim() !== '' && !isLoading)) && (
        <div className="search-results">
          {isLoading ? (
            <div className="search-result-item search-loading">
              <div className="search-result-name">Searching...</div>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="search-result-item search-no-results">
              <div className="search-result-name">No playlists found</div>
              <div className="search-result-description">Try a different search term</div>
            </div>
          ) : (
            searchResults.map((playlist) => (
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
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
