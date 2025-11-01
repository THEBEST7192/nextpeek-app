import { app, BrowserWindow, ipcMain, screen, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import http from 'node:http';

dotenv.config();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow;
let mouseTrackingInterval;
let isSidebarVisible = true; // Start with sidebar visible
let hideTimeout;
let isAnimating = false; // Prevents overlapping animations
let lastShowTime = 0; // Prevents rapid re-triggering
const SHOW_COOLDOWN = 500; // ms cooldown before showing again
let showDelayTimeout = null; // Delay before showing sidebar
const SHOW_DELAY = 200; // ms delay before showing sidebar
let isPinned = true; // Track pin state - Start with pin on
let isPlaying = false; // Track play state - Start with paused
let currentSide = 'left'; // Track which side the sidebar is docked on
let spotifyAuthServer = null;
let spotifyAccessToken = null;
let spotifyRefreshToken = null;
let spotifyCodeVerifier = null;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_REDIRECT_URI = 'http://127.0.0.1:7192';
const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing'
].join(' ');

// Helper: get the display that the window currently occupies
const getDisplayForWindow = () => {
  if (!mainWindow) return null;
  const bounds = mainWindow.getBounds();
  return screen.getDisplayMatching(bounds);
};

const toBase64Url = (buffer) => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const generateCodeVerifier = () => toBase64Url(crypto.randomBytes(64));
const generateCodeChallenge = (verifier) => toBase64Url(crypto.createHash('sha256').update(verifier).digest());

const startSpotifyAuthServer = () => {
  if (spotifyAuthServer) return;
  spotifyAuthServer = http.createServer(async (req, res) => {
    try {
      console.log('Incoming request URL:', req.url);
      const url = new URL(req.url, 'http://127.0.0.1:7192');
      console.log('Parsed URL pathname:', url.pathname);
      if (url.pathname === '/') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        if (error) {
          mainWindow?.webContents.send('spotify-auth-error', error);
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Spotify auth error: ' + error);
        } else if (code) {
          // Exchange code for token using PKCE
          const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: SPOTIFY_REDIRECT_URI,
            client_id: SPOTIFY_CLIENT_ID,
            code_verifier: spotifyCodeVerifier || ''
          });
          const r = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
          });
          if (!r.ok) {
            const msg = await r.text();
            mainWindow?.webContents.send('spotify-auth-error', msg);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Token exchange failed');
          } else {
            const data = await r.json();
            spotifyAccessToken = data.access_token;
            spotifyRefreshToken = data.refresh_token || null;
            mainWindow?.webContents.send('spotify-auth-success', {
              accessToken: spotifyAccessToken,
              refreshToken: spotifyRefreshToken
            });
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Spotify authentication complete. You can close this tab.');
          }
        } else {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing code parameter');
        }
        // Close server after handling callback
        setTimeout(() => {
          try { spotifyAuthServer?.close(); } catch {}
          spotifyAuthServer = null;
        }, 500);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    } catch (e) {
      mainWindow?.webContents.send('spotify-auth-error', String(e));
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal error');
    }
  });
  spotifyAuthServer.listen(7192, '127.0.0.1');
};

const startSpotifyLogin = () => {
  if (!SPOTIFY_CLIENT_ID) {
    mainWindow?.webContents.send('spotify-auth-error', 'Missing SPOTIFY_CLIENT_ID in env');
    return;
  }
  // Start callback server
  startSpotifyAuthServer();
  // Generate PKCE values
  spotifyCodeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(spotifyCodeVerifier);
  const state = toBase64Url(crypto.randomBytes(16));
  const authParams = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPES,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    state
  });
  const authUrl = 'https://accounts.spotify.com/authorize?' + authParams.toString();
  // Open in external browser
  shell.openExternal(authUrl);
};
const TRIGGER_ZONE_WIDTH = 5; // 5px trigger zone on screen edges
const ANIMATION_DURATION = 300; // ms for slide animation
const HIDE_DELAY = 500; // ms delay before hiding sidebar

const createWindow = () => {
  // Create the browser window.
  const initialDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const workArea = initialDisplay.workArea;
  const targetWidth = Math.floor(workArea.width / 5);
  
  mainWindow = new BrowserWindow({
    width: targetWidth,
    height: workArea.height,
    x: workArea.x,
    y: workArea.y,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true, // Start with always on top
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false, // Don't show until ready
  });

  // Use the highest level for always-on-top to work with fullscreen applications
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  
  // For Windows, set the window to be a tool window which helps with fullscreen apps
  mainWindow.setSkipTaskbar(true);
  
  // Send initial play state to renderer
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('play-state-changed', isPlaying);
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  // Set initial mouse ignore state
  if (isPinned) {
    mainWindow.setIgnoreMouseEvents(false);
  } else {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  }

  // Show the window after it's ready
  mainWindow.show();

  mainWindow.on('closed', () => {
    console.log('Main window closed. Clearing all intervals and timeouts.');
    if (mouseTrackingInterval) {
      clearInterval(mouseTrackingInterval);
      mouseTrackingInterval = null;
    }
    if (showDelayTimeout) {
      clearTimeout(showDelayTimeout);
      showDelayTimeout = null;
    }
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    mainWindow = null;
  });
};

// Function to start mouse tracking
const startMouseTracking = () => {
  if (mouseTrackingInterval) {
    clearInterval(mouseTrackingInterval);
  }

  mouseTrackingInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const cursorPos = screen.getCursorScreenPoint();
    const activeWindowDisplay = getDisplayForWindow();
    if (!activeWindowDisplay) return; // enforce window's display only
    const workAreaForWindow = activeWindowDisplay.workArea;
    const windowBounds = mainWindow.getBounds();
    const targetWidth = Math.floor(workAreaForWindow.width / 5);

    // Detect which edge the window is currently docked to and update currentSide
    const isOnLeftEdge = Math.abs(windowBounds.x - workAreaForWindow.x) < 5;
    const isOnRightEdge = Math.abs(windowBounds.x - (workAreaForWindow.x + workAreaForWindow.width - targetWidth)) < 5;
    // Always keep currentSide in sync with actual docking, even when pinned
    if (isOnLeftEdge || isOnRightEdge) {
      currentSide = isOnLeftEdge ? 'left' : 'right';
    }

    // Check if cursor is in trigger zones
    // When pinned, we don't need trigger zones as the window is always visible
    // When not pinned, use screen edges for trigger zones
    const cursorDisplay = screen.getDisplayNearestPoint(cursorPos);
    const cursorWorkArea = cursorDisplay.workArea;
    const sameDisplay = cursorDisplay.id === activeWindowDisplay.id;
    const isInLeftTrigger = !isPinned && sameDisplay &&
                           cursorPos.x <= cursorWorkArea.x + TRIGGER_ZONE_WIDTH &&
                           cursorPos.y >= cursorWorkArea.y &&
                           cursorPos.y <= cursorWorkArea.y + cursorWorkArea.height;

    const isInRightTrigger = !isPinned && sameDisplay &&
                            cursorPos.x >= cursorWorkArea.x + cursorWorkArea.width - TRIGGER_ZONE_WIDTH &&
                            cursorPos.y >= cursorWorkArea.y &&
                            cursorPos.y <= cursorWorkArea.y + cursorWorkArea.height;

    // Only allow trigger on the same side the window is docked to
    const shouldTriggerLeft = !isPinned && currentSide === 'left' && isInLeftTrigger;
    const shouldTriggerRight = !isPinned && currentSide === 'right' && isInRightTrigger;
                            
    // Debug output for trigger zones
    if (shouldTriggerLeft || shouldTriggerRight) {
      console.log(`Cursor in trigger zone for current side: side=${currentSide}, Left=${isInLeftTrigger}, Right=${isInRightTrigger}, isPinned=${isPinned}`);
    }

    // Check if cursor is in sidebar area when visible
    const isInSidebar = cursorPos.x >= windowBounds.x && 
                       cursorPos.x <= windowBounds.x + windowBounds.width &&
                       cursorPos.y >= windowBounds.y && 
                       cursorPos.y <= windowBounds.y + windowBounds.height;

    if (shouldTriggerLeft && !isSidebarVisible && !isAnimating && !showDelayTimeout) {
          // Left edge - show sidebar with delay
          console.log('Showing sidebar on LEFT side');
          showDelayTimeout = setTimeout(() => {
            showSidebar('left');
            showDelayTimeout = null;
          }, SHOW_DELAY);
        } else if (shouldTriggerRight && !isSidebarVisible && !isAnimating && !showDelayTimeout) {
          // Right edge - show sidebar with delay
          console.log('Showing sidebar on RIGHT side');
          showDelayTimeout = setTimeout(() => {
            showSidebar('right');
            showDelayTimeout = null;
          }, SHOW_DELAY);
        } else if (shouldTriggerLeft && isSidebarVisible) {
          // Already visible on left - clear any pending hide timeout
          if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
          }
        } else if (shouldTriggerRight && isSidebarVisible) {
          // Already visible on right - clear any pending hide timeout
          if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
          }
        } else if (!shouldTriggerLeft && !shouldTriggerRight) {
      // Mouse is not in trigger zone - clear any pending show delay
      if (showDelayTimeout) {
        clearTimeout(showDelayTimeout);
        showDelayTimeout = null;
      }
      
      // Start hide delay if sidebar is visible and cursor is not in sidebar
      if (isSidebarVisible && !isInSidebar && !hideTimeout) {
        hideTimeout = setTimeout(() => {
          hideSidebar();
        }, HIDE_DELAY);
      }
    }
  }, 50); // Check every 50ms
};

// Function to show sidebar with animation
const showSidebar = (side = 'left') => {
  if (!mainWindow || mainWindow.isDestroyed() || isSidebarVisible || isAnimating) return;
   
  // Check if window is pinned - if pinned, don't use sidebar behavior
  if (isPinned) return;
   
  // Check cooldown to prevent rapid re-triggering
  const currentTime = Date.now();
  if (currentTime - lastShowTime < SHOW_COOLDOWN) return;
  lastShowTime = currentTime;
  
  console.log(`showSidebar called with side: ${side}`);
  // Persist the side so hover triggers only respond to the same edge
  currentSide = side;

  const activeDisplay = getDisplayForWindow();
  if (!activeDisplay) return; // window not ready
  const workArea = activeDisplay.workArea;
  const targetWidth = Math.floor(workArea.width / 5);

  // Clear any pending hide timeout
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  
  // Clear any pending show delay
  if (showDelayTimeout) {
    clearTimeout(showDelayTimeout);
    showDelayTimeout = null;
  }

  // Set position based on side
  const targetX = side === 'left' ? workArea.x : workArea.x + workArea.width - targetWidth;
  console.log(`Setting targetX for ${side} side: ${targetX}`);

  // Enable mouse events for the sidebar
  mainWindow.setIgnoreMouseEvents(false);

  // Show window if hidden
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  
  // Force focus to ensure animation works properly
  mainWindow.focus();

  // Set initial position off-screen but within the same display
  // Instead of moving completely off-screen, we'll keep a small portion visible
  const startX = side === 'left' ? workArea.x - targetWidth + 5 : workArea.x + workArea.width - 5;
  console.log(`Animation starting: side=${side}, startX=${startX}, targetX=${targetX}`);
  
  // Force window to be visible before animation
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  
  // Ensure window is properly positioned before animation
  mainWindow.setBounds({
    x: startX,
    y: workArea.y,
    width: targetWidth,
    height: workArea.height
  });

  // Use setTimeout for animation instead of requestAnimationFrame
  isAnimating = true; // Mark animation as in progress
  let progress = 0;
  const animationStep = 10; // ms between steps
  const animationSteps = ANIMATION_DURATION / animationStep;
  const stepIncrement = 1 / animationSteps;
  const xDistance = targetX - startX;
  
  const animateStep = () => {
    progress += stepIncrement;
    if (progress >= 1) progress = 1;
    
    const currentX = startX + (xDistance * progress);
    
    console.log(`Animation step: side=${side}, progress=${progress.toFixed(2)}, currentX=${Math.round(currentX)}`);
    
    mainWindow.setBounds({
      x: Math.round(currentX),
      y: workArea.y,
      width: targetWidth,
      height: workArea.height
    });

    if (progress < 1) {
      setTimeout(animateStep, animationStep);
    } else {
      isSidebarVisible = true;
      isAnimating = false; // Mark animation as complete
      console.log(`Animation complete: side=${side}, final position=${Math.round(currentX)}`);
    }
  };

  setTimeout(animateStep, animationStep);
};

// Function to toggle pin state
const togglePin = () => {
  if (!mainWindow) return;
  
  // Store current state before changing
  const wasPinned = isPinned;
  isPinned = !isPinned;
  mainWindow.setAlwaysOnTop(true); // Always keep window on top
  
  // If pinning, ensure window is visible and on screen
  if (isPinned) {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    // Clear any pending hide/show timeouts
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    if (showDelayTimeout) {
      clearTimeout(showDelayTimeout);
      showDelayTimeout = null;
    }
    
    // Get current bounds to maintain position when pinning
    const currentBounds = mainWindow.getBounds();
    const activeDisplay = getDisplayForWindow();
    if (!activeDisplay) return;
    const targetWidth = Math.floor(activeDisplay.workArea.width / 5);
    
    // Keep the same position but adjust width/height
    mainWindow.setBounds({
      x: currentBounds.x,
      y: currentBounds.y,
      width: targetWidth,
      height: activeDisplay.workArea.height
    });
  } else { // When unpinning
    const activeDisplay = getDisplayForWindow();
    if (!activeDisplay) return;
    const workArea = activeDisplay.workArea;
    const currentBounds = mainWindow.getBounds();
    const targetWidth = Math.floor(workArea.width / 5);
    
    // Determine which side is closer (left or right)
    const distToLeft = Math.abs(currentBounds.x - workArea.x);
    const distToRight = Math.abs((currentBounds.x + currentBounds.width) - (workArea.x + workArea.width));
    
    // Snap to the closest edge, similar to pinning behavior
    let newX;
    if (distToLeft <= distToRight) {
      // Snap to left edge
      newX = workArea.x;
      currentSide = 'left';
    } else {
      // Snap to right edge
      newX = workArea.x + workArea.width - targetWidth;
      currentSide = 'right';
    }
    
    // Move the window to the edge
    mainWindow.setBounds({
      x: newX,
      y: workArea.y,
      width: targetWidth,
      height: workArea.height
    });
    
    console.log(`Window unpinned and snapped to ${currentSide} edge: (${newX}, ${workArea.y})`);
    
    // No need to update currentSide as we've already set it above
  }
  
  // Send pin state to renderer
  mainWindow.webContents.send('pin-state-changed', isPinned);
};

// Function to hide sidebar with animation
const hideSidebar = () => {
  if (!mainWindow || mainWindow.isDestroyed() || !isSidebarVisible || isAnimating) return;
   
  // Check if window is pinned - if pinned, don't use sidebar behavior
  if (isPinned) return;
   
  // Clear any pending show delay
  if (showDelayTimeout) {
    clearTimeout(showDelayTimeout);
    showDelayTimeout = null;
  }

  const activeDisplay = getDisplayForWindow();
  if (!activeDisplay) return; // window not ready
  const workArea = activeDisplay.workArea;
  const windowBounds = mainWindow.getBounds();
  const targetWidth = Math.floor(workArea.width / 5);

  // Determine which side we're on - use approximate comparison for floating point values
  const isOnLeft = Math.abs(windowBounds.x - workArea.x) < 5;
  const isOnRight = Math.abs(windowBounds.x - (workArea.x + workArea.width - targetWidth)) < 5;
  
  console.log(`Side detection: windowBounds.x=${windowBounds.x}, workArea.x=${workArea.x}, right edge=${workArea.x + workArea.width - targetWidth}`);
  console.log(`Side detection result: isOnLeft=${isOnLeft}, isOnRight=${isOnRight}`);

  if (!isOnLeft && !isOnRight) {
    console.log('Window not on either edge, canceling hide animation');
    return;
  }

  // Check for adjacent monitors on the current edge to prevent cross-monitor animation
  const allDisplays = screen.getAllDisplays();
  let hasAdjacentMonitor = false;

  if (isOnLeft) {
    hasAdjacentMonitor = allDisplays.some(display => 
      display.id !== activeDisplay.id && 
      display.workArea.x + display.workArea.width === activeDisplay.workArea.x
    );
  } else if (isOnRight) {
    hasAdjacentMonitor = allDisplays.some(display => 
      display.id !== activeDisplay.id && 
      display.workArea.x === activeDisplay.workArea.x + activeDisplay.workArea.width
    );
  }

  if (hasAdjacentMonitor) {
    console.log(`Adjacent monitor found on ${isOnLeft ? 'left' : 'right'} edge, canceling hide animation`);
    return;
  }

  // Disable mouse events during hide animation
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Calculate animation parameters
  const startX = windowBounds.x;
  // Keep a small portion visible to prevent moving to adjacent monitors
  const targetX = isOnLeft ? workArea.x - targetWidth + 5 : workArea.x + workArea.width - 5;
  
  console.log(`Hide animation: isOnLeft=${isOnLeft}, isOnRight=${isOnRight}, startX=${startX}, targetX=${targetX}`);
  
  // Use setTimeout for animation instead of requestAnimationFrame
  isAnimating = true; // Mark animation as in progress
  let progress = 0;
  const animationStep = 10; // ms between steps
  const animationSteps = ANIMATION_DURATION / animationStep;
  const stepIncrement = 1 / animationSteps;
  const xDistance = targetX - startX;
  
  const animateStep = () => {
    progress += stepIncrement;
    if (progress >= 1) progress = 1;
    
    const currentX = startX + (xDistance * progress);
    
    console.log(`Hide animation step: progress=${progress.toFixed(2)}, currentX=${Math.round(currentX)}`);
    
    mainWindow.setBounds({
      x: Math.round(currentX),
      y: workArea.y,
      width: targetWidth,
      height: workArea.height
    });

    if (progress < 1) {
      setTimeout(animateStep, animationStep);
    } else {
      isSidebarVisible = false;
      isAnimating = false; // Mark animation as complete
      console.log(`Hide animation complete`);
      mainWindow.hide();
    }
  };

  setTimeout(animateStep, animationStep);
};

// Function to initialize window size and position
const initializeWindowSize = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  const activeDisplay = getDisplayForWindow();
  if (!activeDisplay) return;
  
  const workArea = activeDisplay.workArea;
  const targetWidth = Math.floor(workArea.width / 5);
  
  // Set the window to the correct size and position based on current side
  const targetX = currentSide === 'left' ? workArea.x : workArea.x + workArea.width - targetWidth;
  
  mainWindow.setBounds({
    x: targetX,
    y: workArea.y,
    width: targetWidth,
    height: workArea.height
  });
  
  console.log(`Window initialized: side=${currentSide}, position=(${targetX}, ${workArea.y}), size=${targetWidth}x${workArea.height}`);
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  // Initialize window size and position after creation
  setTimeout(() => {
    initializeWindowSize();
  }, 100); // Small delay to ensure window is fully created

  // Start mouse tracking for sidebar functionality
  startMouseTracking();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      setTimeout(() => {
        initializeWindowSize();
      }, 100);
      startMouseTracking();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (spotifyAuthServer) {
    spotifyAuthServer.close(() => {
      console.log('Spotify auth server closed.');
    });
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// Handle IPC events for window controls
ipcMain.on('close-window', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.on('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('toggle-pin', () => {
  togglePin();
  console.log(`Window pin ${isPinned ? 'enabled' : 'disabled'}`);
});

// These would be connected to your actual music player functionality
ipcMain.on('toggle-play-pause', () => {
  console.log('Play/Pause toggled');
  isPlaying = !isPlaying;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('play-state-changed', isPlaying);
  }
});

ipcMain.on('skip-previous', () => {
  console.log('Skip to previous track');
});

ipcMain.on('skip-next', () => {
  console.log('Skip to next track');
});

ipcMain.on('snap-window', () => {
  if (mainWindow) {
    const currentBounds = mainWindow.getBounds();
    const activeDisplay = getDisplayForWindow();
    const workArea = activeDisplay.workArea;

    const targetWidth = Math.floor(workArea.width / 5);
    const targetHeight = workArea.height;

    // Determine if currently snapped to left or right
    const isSnappedLeft = currentBounds.x === workArea.x && currentBounds.width === targetWidth;
    const isSnappedRight = currentBounds.x === workArea.x + workArea.width - targetWidth && currentBounds.width === targetWidth;

    if (isSnappedLeft) {
      // If snapped left, snap to right
      mainWindow.setBounds({
        x: workArea.x + workArea.width - targetWidth,
        y: workArea.y,
        width: targetWidth,
        height: targetHeight,
      });
    } else if (isSnappedRight) {
      // If snapped right, snap to left
      mainWindow.setBounds({
        x: workArea.x,
        y: workArea.y,
        width: targetWidth,
        height: targetHeight,
      });
    } else {
      // If not snapped, snap to the closest side
      const centerOfScreen = workArea.x + workArea.width / 2;
      const windowCenter = currentBounds.x + currentBounds.width / 2;

      if (windowCenter < centerOfScreen) {
        // Closer to left, snap left
        mainWindow.setBounds({
          x: workArea.x,
          y: workArea.y,
          width: targetWidth,
          height: targetHeight,
        });
      } else {
        // Closer to right, snap right
        mainWindow.setBounds({
          x: workArea.x + workArea.width - targetWidth,
          y: workArea.y,
          width: targetWidth,
          height: targetHeight,
        });
      }
    }
    console.log('Window snapped');
  }
});

// Spotify OAuth IPC
ipcMain.on('spotify-login', () => {
  try {
    startSpotifyLogin();
  } catch (e) {
    mainWindow?.webContents.send('spotify-auth-error', String(e));
  }
});

ipcMain.handle('spotify-auth-status', async () => {
  return { accessToken: spotifyAccessToken, refreshToken: spotifyRefreshToken };
});
