// Use window.electronAPI for renderer process access to Electron APIs

/**
 * Extract album cover and metadata from a local file path
 * This service uses IPC to communicate with the main process for file operations
 * since browser/renderer processes cannot directly access the file system
 */
class AlbumCoverService {
  // Global cache with no size limits
  static globalCache = new Map();
  static pendingRequests = new Set();
  /**
   * Extract album cover and metadata from a file path
   * @param {string} filePath - The path to the audio file
   * @returns {Promise<Object>} - Object containing metadata and album cover data
   */
  static async extractAlbumCover(filePath) {
    try {
      // Only process actual local files
      if (!filePath || !filePath.startsWith('spotify:localfileimage:')) {
        return {
          success: false,
          error: 'Not a local file',
          albumCover: null,
          title: 'Unknown Title',
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          duration: 0
        };
      }
      
      // Check global cache first (includes 64x64 image)
      if (this.globalCache.has(filePath)) {
        return this.globalCache.get(filePath);
      }
      
      // Prevent duplicate requests
      if (this.pendingRequests.has(filePath)) {
        return {
          success: false,
          error: 'Request in progress',
          albumCover: null,
          title: 'Unknown Title',
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          duration: 0
        };
      }
      
      // Mark as pending
      this.pendingRequests.add(filePath);
      
      try {
        // Use IPC to get metadata from main process (main process handles decoding)
        const metadata = await window.electronAPI.extractAudioMetadata(filePath);
        
        // Create 64x64 image immediately to cache it
        let resizedImageUrl = null;
        if (metadata.albumCover) {
          try {
            resizedImageUrl = await this.createAlbumCoverUrl(metadata.albumCover);
          } catch (error) {
            console.warn('Failed to create 64x64 image:', error);
          }
        }
        
        const result = {
          success: true,
          metadata: metadata,
          albumCover: metadata.albumCover || null,
          resizedImageUrl: resizedImageUrl, // Cache the 64x64 image
          title: metadata.title || 'Unknown Title',
          artist: metadata.artist || 'Unknown Artist',
          album: metadata.album || 'Unknown Album',
          duration: metadata.duration || 0
        };
        
        // No cache size limits - cache everything for performance
        this.globalCache.set(filePath, result);
        
        return result;
      } finally {
        // Remove from pending
        this.pendingRequests.delete(filePath);
      }
    } catch (error) {
      this.pendingRequests.delete(filePath);
      // Silently handle errors to reduce console spam
      return {
        success: false,
        error: error.message,
        albumCover: null,
        title: 'Unknown Title',
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        duration: 0
      };
    }
  }

  /**
   * Decode file path from Spotify URI format
   * @param {string} uri - The Spotify URI or file path
   * @returns {string} - The decoded file path
   */
  static decodeFilePath(uri) {
    try {
      // Handle Spotify local file URI format: "spotify:localfileimage:C%3A%5CUsers%5C..."
      if (uri.startsWith('spotify:localfileimage:')) {
        const encodedPath = uri.replace('spotify:localfileimage:', '');
        return decodeURIComponent(encodedPath);
      }
      
      // Handle regular file paths
      if (uri.includes(':') && uri.includes('\\')) {
        return uri;
      }
      
      // Try to decode if it looks encoded
      if (uri.includes('%')) {
        return decodeURIComponent(uri);
      }
      
      return uri;
    } catch (error) {
      console.error('Error decoding file path:', error);
      return uri; // Return original if decoding fails
    }
  }

  /**
   * Resize album cover to smaller dimensions to reduce memory usage
   * @param {string} imageData - Base64 image data
   * @param {number} maxSize - Maximum size for width/height
   * @returns {Promise<string>} - Resized image as base64 data URL
   */
  static async resizeAlbumCover(imageData, maxSize = 64) {
    return new Promise((resolve, reject) => {
      try {
        // Create blob from image data
        const blob = new Blob([imageData]);
        const img = new Image();
        const objectUrl = URL.createObjectURL(blob);
        
        img.onload = () => {
          try {
            // Calculate new dimensions
            let { width, height } = img;
            if (width <= maxSize && height <= maxSize) {
              // Clean up immediately if no resize needed
              URL.revokeObjectURL(objectUrl);
              resolve(imageData);
              return;
            }
            
            const ratio = Math.min(maxSize / width, maxSize / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
            
            // Create canvas for resizing
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // Convert back to Uint8Array
            canvas.toBlob((newBlob) => {
              const reader = new FileReader();
              reader.onload = () => {
                const arrayBuffer = reader.result;
                const uint8Array = new Uint8Array(arrayBuffer);
                // Clean up all resources
                URL.revokeObjectURL(objectUrl);
                resolve(uint8Array);
              };
              reader.readAsArrayBuffer(newBlob);
            }, 'image/jpeg', 0.85); // 85% quality for smaller size
          } catch (error) {
            URL.revokeObjectURL(objectUrl);
            reject(error);
          }
        };
        
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Failed to load image'));
        };
        img.src = objectUrl;
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Convert album cover data to a displayable URL
   * @param {Uint8Array|string} albumCoverData - The album cover data
   * @returns {string} - Data URL for display
   */
  static async createAlbumCoverUrl(albumCoverData) {
    try {
      if (!albumCoverData) return null;
      
      // Resize the image first to reduce memory usage
      const resizedData = await this.resizeAlbumCover(albumCoverData);
      
      // Convert Uint8Array to base64 string (browser-compatible)
      const binaryString = Array.from(resizedData)
        .map(byte => String.fromCharCode(byte))
        .join('');
      const base64String = btoa(binaryString);
      
      // Detect MIME type from magic bytes
      let mimeType = 'image/jpeg'; // default
      if (resizedData.length >= 4) {
        const bytes = resizedData.slice(0, 4);
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
          mimeType = 'image/png';
        } else if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
          mimeType = 'image/jpeg';
        } else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
          mimeType = 'image/gif';
        }
      }
      
      return `data:${mimeType};base64,${base64String}`;
    } catch (error) {
      console.error('Error creating album cover URL:', error);
      return null;
    }
  }
}

export { AlbumCoverService };
