// Queue Service for NextPeek App
// Handles queue information from port 7192

const http = require('node:http');

// Store queue data
let currentQueue = {
  nowPlaying: {},
  queue: []
};

// Store pending command
let pendingCommand = null;

// Create HTTP server to handle queue data
export function startQueueServer(mainWindow) {
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
          currentQueue = data;
          console.log('Queue updated:', data);
          
          // Update play state if available
          if (data.nowPlaying && data.nowPlaying.isPlaying !== undefined) {
            // Update the main process about external play state changes
            mainWindow?.webContents.emit('external-play-state-changed', data.nowPlaying.isPlaying);
            // Send play state to renderer
            mainWindow?.webContents.send('play-state-changed', data.nowPlaying.isPlaying);
          }
          
          // Send the queue data to the renderer process
          mainWindow?.webContents.send('queue-updated', data);
          
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
    // Handle unknown requests
    else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  // Start server on port 7192
  server.listen(7192, '127.0.0.1', () => {
    console.log('Queue server running at http://127.0.0.1:7192/');
  });

  return server;
}

// Send command to Spotify
export function sendCommand(action) {
  pendingCommand = { action };
  console.log('Command set:', action);
  return true;
}

// Get current queue data
export function getCurrentQueue() {
  return currentQueue;
}