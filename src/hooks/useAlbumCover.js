import { useState, useEffect, useCallback } from 'react';
import { AlbumCoverService } from '../services/albumCoverService';

/**
 * React hook for extracting and managing album cover metadata
 * @param {Object} nowPlaying - The current playing track object
 * @returns {Object} - Album cover data and loading state
 */
export const useAlbumCover = (nowPlaying) => {
  const [albumCover, setAlbumCover] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Cleanup on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      setAlbumCover(null);
      setMetadata(null);
      setError(null);
      setIsLoading(false);
    };
  }, []);

  /**
   * Process album cover from the current track
   */
  const processAlbumCover = useCallback(async () => {
    if (!nowPlaying || !nowPlaying.album_cover) {
      console.log('No nowPlaying or album_cover, clearing album cover');
      setAlbumCover(null);
      setMetadata(null);
      return;
    }

    console.log('Processing album cover for:', nowPlaying.album_cover);
    setIsLoading(true);
    setError(null);

    try {
      const result = await AlbumCoverService.extractAlbumCover(nowPlaying.album_cover);
      
      console.log('useAlbumCover result:', result);
      
      if (result.success) {
        setMetadata(result.metadata);
        
        // Create displayable URL for album cover (async with resizing)
        const coverUrl = await AlbumCoverService.createAlbumCoverUrl(result.albumCover);
        setAlbumCover(coverUrl);
      } else {
        console.error('Album cover extraction failed:', result.error);
        setError(result.error);
        setAlbumCover(null);
        setMetadata(null);
      }
    } catch (err) {
      console.error('Error in useAlbumCover:', err);
      setError(err.message);
      setAlbumCover(null);
      setMetadata(null);
    } finally {
      setIsLoading(false);
    }
  }, [nowPlaying]);

  /**
   * Reset the album cover state
   */
  const resetAlbumCover = useCallback(() => {
    setAlbumCover(null);
    setMetadata(null);
    setError(null);
    setIsLoading(false);
  }, []);

  /**
   * Extract file path from album cover URI for debugging
   */
  const getFilePath = useCallback(() => {
    if (!nowPlaying || !nowPlaying.album_cover) {
      return null;
    }
    
    return AlbumCoverService.decodeFilePath(nowPlaying.album_cover);
  }, [nowPlaying]);

  // Process album cover when nowPlaying changes
  useEffect(() => {
    processAlbumCover();
  }, [processAlbumCover]);

  return {
    albumCover,
    metadata,
    isLoading,
    error,
    resetAlbumCover,
    getFilePath,
    // Convenience properties
    hasAlbumCover: !!albumCover,
    title: metadata?.title || nowPlaying?.title,
    artist: metadata?.artist || nowPlaying?.artist,
    album: metadata?.album,
    duration: metadata?.duration || nowPlaying?.duration
  };
};

export default useAlbumCover;
