const LYRICS_CACHE_KEY = 'lyrics_cache';

export function getCachedLyrics(title, artist) {
  if (!title || !artist) {
    return null;
  }

  try {
    const cache = JSON.parse(localStorage.getItem(LYRICS_CACHE_KEY) || '{}');
    const key = generateCacheKey(title, artist);
    return cache[key] || null;
  } catch (error) {
    console.error('Error reading lyrics cache:', error);
    return null;
  }
}

export function setCachedLyrics(title, artist, lyrics, synced) {
  if (!title || !artist) {
    return;
  }

  try {
    const cache = JSON.parse(localStorage.getItem(LYRICS_CACHE_KEY) || '{}');
    const key = generateCacheKey(title, artist);
    
    // Cleanup old entries if cache is too large (limit to 500 entries)
    const entries = Object.entries(cache);
    if (entries.length >= 500) {
      // Remove oldest 20 entries
      const sortedEntries = entries.sort(([,a], [,b]) => a.timestamp - b.timestamp);
      sortedEntries.slice(0, 20).forEach(([oldKey]) => delete cache[oldKey]);
    }
    
    cache[key] = {
      lyrics,
      synced,
      timestamp: Date.now()
    };
    localStorage.setItem(LYRICS_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Error writing lyrics cache:', error);
  }
}

export function clearLyricsCache() {
  try {
    localStorage.removeItem(LYRICS_CACHE_KEY);
    return true;
  } catch (error) {
    console.error('Error clearing lyrics cache:', error);
    return false;
  }
}

export function getLyricsCacheSize() {
  try {
    const cache = localStorage.getItem(LYRICS_CACHE_KEY);
    if (!cache) {
      return 0;
    }
    // Return size in bytes
    return new Blob([cache]).size;
  } catch (error) {
    console.error('Error calculating lyrics cache size:', error);
    return 0;
  }
}

export function getLyricsCacheSizeFormatted() {
  const bytes = getLyricsCacheSize();
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

function generateCacheKey(title, artist) {
  return `${title.toLowerCase().trim()}|${artist.toLowerCase().trim()}`;
}
