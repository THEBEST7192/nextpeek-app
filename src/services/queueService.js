// Queue Service for NextPeek App
// Handles queue information from port 7192

import http from 'node:http';
import { BrowserWindow } from 'electron';

// Simple request throttling
let lastUpdateTime = 0;
const MIN_UPDATE_INTERVAL = 500; // 500ms between updates to handle both focused/unfocused
let pendingUpdate = null;
let isProcessingUpdate = false;

const normalizeRepeatMode = (mode) => {
  const numeric = Number(mode);
  return numeric === 1 || numeric === 2 ? numeric : 0;
};

// Store queue data
let currentQueue = {
  nowPlaying: {},
  queue: [],
  repeatMode: 0,
  shuffle: false,
};

// Track the renderer window to send IPC updates to
let rendererWindow = null;

// Store pending command
let pendingCommand = null;

// Store user playlists
let userPlaylists = [];
let recentlyPlayedTracks = [];

// Store pending playlist requests
let pendingPlaylistRequests = [];

// Memory management: limit cache sizes
const MAX_QUEUE_HISTORY = 50;
const MAX_PLAYLIST_CACHE = 100;

// Simple update processor - just throttle and process
const processUpdate = (data) => {
  if (isProcessingUpdate) {
    pendingUpdate = data;
    return;
  }

  isProcessingUpdate = true;
  const now = Date.now();
  
  // Simple throttling
  if (now - lastUpdateTime < MIN_UPDATE_INTERVAL) {
    setTimeout(() => {
      isProcessingUpdate = false;
      if (pendingUpdate) {
        const nextData = pendingUpdate;
        pendingUpdate = null;
        processUpdate(nextData);
      }
    }, MIN_UPDATE_INTERVAL - (now - lastUpdateTime));
    return;
  }

  try {
    const normalizedRepeatMode = normalizeRepeatMode(
      data.repeatMode ?? data.nowPlaying?.repeatMode
    );
    const normalizedShuffle = typeof data.shuffle === 'boolean'
      ? data.shuffle
      : Boolean(data.nowPlaying?.shuffle);

    currentQueue = {
      ...data,
      repeatMode: normalizedRepeatMode,
      shuffle: normalizedShuffle,
    };
    
    if (data.history) {
      recentlyPlayedTracks = data.history.slice(0, MAX_QUEUE_HISTORY);
    }

    if (queueUpdateCallback) {
      queueUpdateCallback('queue', currentQueue);
      if (data.history) {
        queueUpdateCallback('history', data.history);
      }
    }
    
    // Update play state if available
    if (currentQueue.nowPlaying && currentQueue.nowPlaying.isPlaying !== undefined) {
      rendererWindow?.webContents.emit('external-play-state-changed', currentQueue.nowPlaying.isPlaying);
    }
    
    lastUpdateTime = now;
  } finally {
    isProcessingUpdate = false;
    
    // Process any pending update
    if (pendingUpdate) {
      const nextData = pendingUpdate;
      pendingUpdate = null;
      setTimeout(() => processUpdate(nextData), MIN_UPDATE_INTERVAL);
    }
  }
};

// Aggressive cleanup function to prevent RAM buildup
export function cleanupQueueData() {
  // Force clear arrays periodically
  if (recentlyPlayedTracks.length > 20) {
    recentlyPlayedTracks = recentlyPlayedTracks.slice(0, 20);
  }
  
  if (userPlaylists.length > 50) {
    userPlaylists = userPlaylists.slice(0, 50);
  }
  
  // Clear all pending requests
  pendingPlaylistRequests.forEach(request => {
    if (request.timeout) {
      clearTimeout(request.timeout);
    }
  });
  pendingPlaylistRequests = [];
  
  // Clear throttled update data
  pendingUpdate = null;
  isProcessingUpdate = false;
  
  // Clear current queue if it's getting too large
  if (currentQueue.queue && currentQueue.queue.length > 100) {
    currentQueue.queue = currentQueue.queue.slice(0, 100);
  }
}

let queueUpdateCallback = null;

export function onQueueUpdate(callback) {
  queueUpdateCallback = callback;
}

// Create HTTP server to handle queue data
export function setQueueWindow(mainWindow) {
  rendererWindow = mainWindow;
}

export function startQueueServer(mainWindow) {
  setQueueWindow(mainWindow);
  const server = http.createServer((req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Handle API endpoints
    if (req.url === '/api/updateQueue' && req.method === 'POST') {
      let body = '';
      
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          
          // Use throttled processing instead of immediate processing
          processUpdate(data);
          
          if (import.meta.env.DEV) {
            console.log('Queue update received (throttled):', data.nowPlaying?.title);
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'success' }));
        } catch (error) {
          console.error('Error parsing queue data:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON data' }));
        }
      });
    } 
    // Handle command requests
    else if (req.url === '/api/command' && req.method === 'GET') {
      const command = pendingCommand || { action: 'none' };
      pendingCommand = null; // Clear the command after it's been retrieved
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(command));
    }
    // Handle playlist search requests
    else if (req.url.startsWith('/api/searchPlaylists') && req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const query = url.searchParams.get('q') || '';
      
      // Request playlists from Spotify bridge
      pendingCommand = { action: 'getPlaylists' };
      
      // Wait for response with timeout
      const timeout = setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ playlists: userPlaylists.filter(p => 
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.description.toLowerCase().includes(query.toLowerCase())
        )}));
        pendingPlaylistRequests = pendingPlaylistRequests.filter(request => request.res !== res);
      }, 2000);
      
      pendingPlaylistRequests.push({ query, res, timeout, timestamp: Date.now() });
    }
    // Handle playlist response from Spotify bridge
    else if (req.url === '/api/playlistsResponse' && req.method === 'POST') {
      let body = '';
      
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          userPlaylists = data.playlists.slice(0, MAX_PLAYLIST_CACHE);
          if (import.meta.env.DEV) {
            console.log('Playlists received:', userPlaylists.length);
          }
          
          // Respond to all pending requests
          pendingPlaylistRequests.forEach(({ query, res: pendingRes, timeout }) => {
            clearTimeout(timeout);
            const filteredPlaylists = userPlaylists.filter(p => 
              p.name.toLowerCase().includes(query.toLowerCase()) ||
              p.description.toLowerCase().includes(query.toLowerCase())
            );
            
            pendingRes.writeHead(200, { 'Content-Type': 'application/json' });
            pendingRes.end(JSON.stringify({ playlists: filteredPlaylists }));
          });
          
          pendingPlaylistRequests = [];
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'success' }));
        } catch (error) {
          console.error('Error parsing playlists data:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON data' }));
        }
      });
    }
    // Handle recently played tracks response from Spotify bridge
    else if (req.url === '/api/recentlyPlayedResponse' && req.method === 'POST') {
      let body = '';
      
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          recentlyPlayedTracks = data.recentlyPlayed;
          if (import.meta.env.DEV) {
            console.log('Recently played tracks received:', recentlyPlayedTracks.length);
          }
          
          if (queueUpdateCallback) queueUpdateCallback('history', recentlyPlayedTracks);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'success' }));
        } catch (error) {
          console.error('Error parsing recently played tracks data:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON data' }));
        }
      });
    }
    // Handle unknown requests
    else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  // Start server on port 7192
  server.listen(7192, '127.0.0.1', () => {
    if (import.meta.env.DEV) {
    console.log('Queue server running at http://127.0.0.1:7192/');
  }
  });

  return server;
}

// Send command to Spotify
export function sendCommand(action, data = null) {
  pendingCommand = data ? { action, data } : { action };
  if (import.meta.env.DEV) {
    console.log('Command set:', action, data);
  }
  return true;
}

// Get current queue data
export function getCurrentQueue() {
  return currentQueue;
}

export function getRecentlyPlayedTracks() {
  return recentlyPlayedTracks;
}

export function getRecentlyPlayed() {
  // Cleanup data before fetching
  cleanupQueueData();
  
  pendingCommand = { action: 'getRecentlyPlayed' };
  if (import.meta.env.DEV) {
    console.log('Command set: getRecentlyPlayed');
  }
  return true;
}