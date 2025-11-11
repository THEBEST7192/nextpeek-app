import { app, BrowserWindow, ipcMain, screen, shell, dialog } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Import queue service
import { startQueueServer, sendCommand, getCurrentQueue, setQueueWindow } from './services/queueService.js';

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
let queueServer = null; // Queue server instance
let isSwitchingTheme = false; // Track theme switching state
let lastKnownBounds = null;
let customBackgroundImageBase64 = null;
let customImageTextColor = 'white'; // 'white' or 'black'
let settingsFilePath = '';

const THEMES = {
  solid: { transparent: false, backgroundColor: '#121212' },
  transparent: { transparent: true, backgroundColor: '#00000000' },
  rainbow: { transparent: false, backgroundColor: '#00000000' },
  gay: { transparent: false, backgroundColor: '#00000000' },
  trans: { transparent: false, backgroundColor: '#00000000' },
  lesbian: { transparent: false, backgroundColor: '#00000000' },
  asexual: { transparent: false, backgroundColor: '#00000000' },
  aroace: { transparent: false, backgroundColor: '#00000000' },
  bi: { transparent: false, backgroundColor: '#00000000' },
  straight: { transparent: false, backgroundColor: '#00000000' },
  straightAlly: { transparent: false, backgroundColor: '#00000000' },
  customImage: { transparent: false, backgroundColor: '#000000' },
};

let currentTheme = 'solid';

const getThemePayload = () => ({
  theme: currentTheme,
  customImageBase64: customBackgroundImageBase64,
  customImageTextColor: currentTheme === 'customImage' ? customImageTextColor : null,
});

const loadSettings = async () => {
  if (!settingsFilePath) {
    return;
  }

  try {
    const raw = await fs.readFile(settingsFilePath, 'utf8');
    const parsed = JSON.parse(raw);

    if (typeof parsed.currentTheme === 'string' && THEMES[parsed.currentTheme]) {
      currentTheme = parsed.currentTheme;
    }

    if (typeof parsed.customBackgroundImageBase64 === 'string') {
      customBackgroundImageBase64 = parsed.customBackgroundImageBase64;
    }

    if (typeof parsed.customImageTextColor === 'string' && ['white', 'black'].includes(parsed.customImageTextColor)) {
      customImageTextColor = parsed.customImageTextColor;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Failed to load settings:', error);
    }
  }
};

const saveSettings = async () => {
  if (!settingsFilePath) {
    return;
  }

  const payload = {
    currentTheme,
    customBackgroundImageBase64,
    customImageTextColor,
  };

  try {
    await fs.mkdir(path.dirname(settingsFilePath), { recursive: true });
    await fs.writeFile(settingsFilePath, JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
};

const sendThemeUpdate = () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('theme-changed', getThemePayload());
};

// Helper: get the display that the window currently occupies
const getDisplayForWindow = () => {
  if (!mainWindow) return null;
  const bounds = mainWindow.getBounds();
  return screen.getDisplayMatching(bounds);
};

// Start the queue server
const startQueueListener = () => {
  if (queueServer) {
    setQueueWindow(mainWindow);
    mainWindow?.webContents.send('queue-server-started');
    return;
  }
  
  // Start the queue server
  queueServer = startQueueServer(mainWindow);
  
  // Notify the renderer that the queue server has started
  mainWindow?.webContents.send('queue-server-started');
  
  console.log('Queue server started on port 7192');
};
const TRIGGER_ZONE_WIDTH = 5; // 5px trigger zone on screen edges
const ANIMATION_DURATION = 300; // ms for slide animation
const HIDE_DELAY = 500; // ms delay before hiding sidebar
// Use a single source of truth for snap width to avoid rounding drift
const SNAP_RATIO = 0.2;
const getTargetWidth = (workArea) => Math.round(workArea.width * SNAP_RATIO);

const createWindow = (options = {}) => {
  // Create the browser window.
  const initialDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const workArea = initialDisplay.workArea;
  const targetWidth = getTargetWidth(workArea);

  const themeKey = options.theme && THEMES[options.theme] ? options.theme : currentTheme;
  currentTheme = themeKey;
  const themeConfig = THEMES[themeKey];

  const defaultBounds = {
    width: targetWidth,
    height: workArea.height,
    x: workArea.x,
    y: workArea.y,
  };

  const windowBounds = options.bounds
    ? {
        width: options.bounds.width ?? defaultBounds.width,
        height: options.bounds.height ?? defaultBounds.height,
        x: options.bounds.x ?? defaultBounds.x,
        y: options.bounds.y ?? defaultBounds.y,
      }
    : defaultBounds;
  
  mainWindow = new BrowserWindow({
    width: windowBounds.width,
    height: windowBounds.height,
    x: windowBounds.x,
    y: windowBounds.y,
    frame: false,
    transparent: themeConfig.transparent,
    backgroundColor: themeConfig.backgroundColor,
    resizable: true,
    alwaysOnTop: isPinned,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false, // Don't show until ready
  });

  if (options.bounds) {
    const preservedBounds = {
      x: typeof options.bounds.x === 'number' ? options.bounds.x : windowBounds.x,
      y: typeof options.bounds.y === 'number' ? options.bounds.y : windowBounds.y,
      width: typeof options.bounds.width === 'number' ? options.bounds.width : windowBounds.width,
      height: typeof options.bounds.height === 'number' ? options.bounds.height : windowBounds.height,
    };
    mainWindow.setBounds(preservedBounds);
    lastKnownBounds = preservedBounds;
  } else {
    lastKnownBounds = mainWindow.getBounds();
  }

  setQueueWindow(mainWindow);

  const captureBounds = () => {
    if (!mainWindow) {
      return;
    }
    const currentBounds = mainWindow.getBounds();
    lastKnownBounds = { ...currentBounds };
  };

  mainWindow.on('move', captureBounds);
  mainWindow.on('resize', captureBounds);

  // Apply current pin state for always-on-top behaviour
  if (isPinned) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setVisibleOnAllWorkspaces(false);
  }
  
  mainWindow.setSkipTaskbar(false);
  
  // Send initial play state to renderer
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('play-state-changed', isPlaying);
    sendThemeUpdate();
    mainWindow.webContents.send('pin-state-changed', isPinned);
    const queueData = getCurrentQueue();
    if (queueData) {
      mainWindow.webContents.send('queue-updated', queueData);
    }
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  // Always keep mouse events enabled so the window remains interactive
  mainWindow.setIgnoreMouseEvents(false);

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
    if (queueServer) {
      setQueueWindow(null);
    }
    mainWindow = null;
  });
};

const applyTheme = async (themeKey, { force = false } = {}) => {
  if (!THEMES[themeKey]) {
    console.warn(`Unknown theme requested: ${themeKey}`);
    return getThemePayload();
  }

  isSwitchingTheme = true;

  try {
    const previousTheme = currentTheme;
    const shouldRecreateWindow = force || (mainWindow && themeKey !== previousTheme);
    const wasPinned = isPinned;
    const bounds = mainWindow?.getBounds();

    currentTheme = themeKey;

    if (shouldRecreateWindow && mainWindow) {
      mainWindow.destroy();
      createWindow({
        theme: themeKey,
        bounds,
      });

      // Restart mouse tracking to restore hide/show behaviour after recreating the window
      startMouseTracking();

      // Explicitly restore pin state and mouse interaction
      isPinned = wasPinned;
      mainWindow.setIgnoreMouseEvents(false);
      if (isPinned) {
        isSidebarVisible = true;
      }
      mainWindow.webContents.send('pin-state-changed', isPinned);
    } else {
      sendThemeUpdate();
    }

    await saveSettings();
    return getThemePayload();
  } finally {
    isSwitchingTheme = false;
  }
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
    const targetWidth = getTargetWidth(workAreaForWindow);

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
  const targetWidth = getTargetWidth(workArea);

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
    // Ensure window accepts mouse events while pinned
    mainWindow.setIgnoreMouseEvents(false);
    isSidebarVisible = true;
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
    const targetWidth = getTargetWidth(activeDisplay.workArea);
    
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
    const targetWidth = getTargetWidth(workArea);
    mainWindow.setIgnoreMouseEvents(false);

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
  const targetWidth = getTargetWidth(workArea);

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
  const targetWidth = getTargetWidth(workArea);

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
app.whenReady().then(async () => {
  settingsFilePath = path.join(app.getPath('userData'), 'settings.json');
  await loadSettings();

  createWindow({ theme: currentTheme });

  // Initialize window size and position after creation
  setTimeout(() => {
    initializeWindowSize();
  }, 100); // Small delay to ensure window is fully created

  // Start mouse tracking for sidebar functionality
  startMouseTracking();

  // Register IPC handlers
  ipcMain.handle('toggle-pin', () => {
    togglePin();
    return isPinned;
  });

  ipcMain.handle('apply-theme', async (event, themeKey) => {
    const payload = await applyTheme(themeKey);
    return payload;
  });

  ipcMain.handle('upload-custom-background', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select background image',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
      ],
    });

    if (result.canceled || !result.filePaths.length) {
      return { canceled: true, ...getThemePayload() };
    }

    try {
      const imagePath = result.filePaths[0];
      const imageBuffer = await fs.readFile(imagePath);
      customBackgroundImageBase64 = imageBuffer.toString('base64');
      const payload = await applyTheme('customImage');
      return { canceled: false, ...payload };
    } catch (error) {
      console.error('Failed to read image file:', error);
      return { canceled: true, error: error.message, ...getThemePayload() };
    }
  });

  ipcMain.handle('set-custom-image-text-color', async (event, color) => {
    if (['white', 'black'].includes(color)) {
      customImageTextColor = color;
      await saveSettings();
      sendThemeUpdate();
      return { success: true, ...getThemePayload() };
    }
    return { success: false, error: 'Invalid color' };
  });

  ipcMain.on('toggle-play-pause', () => {
    const command = isPlaying ? 'pause' : 'play';
    sendCommand(command);
    isPlaying = !isPlaying;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('play-state-changed', isPlaying);
    }
  });

  ipcMain.handle('start-queue-listener', () => {
    startQueueListener();
    return true;
  });

  ipcMain.handle('next-track', () => {
    sendCommand('next');
    return true;
  });

  ipcMain.handle('previous-track', () => {
    sendCommand('previous');
    return true;
  });

  ipcMain.handle('play-playlist', (event, playlistUri) => {
    sendCommand('playPlaylist', { uri: playlistUri });
    return true;
  });

  ipcMain.handle('play-track', (event, trackUri) => {
    sendCommand('playTrack', { uri: trackUri });
    return true;
  });

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow({ theme: currentTheme });
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
  // Don't quit during theme changes
  if (!isSwitchingTheme && process.platform !== 'darwin') {
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
  sendCommand('togglePlayPause');
});

ipcMain.on('skip-previous', () => {
  sendCommand('previous');
});

ipcMain.on('skip-next', () => {
  sendCommand('next');
});

ipcMain.on('skip-next', () => {
  sendCommand('next');
});

ipcMain.on('snap-window', () => {
  if (mainWindow) {
    const currentBounds = mainWindow.getBounds();
    const activeDisplay = getDisplayForWindow();
    const workArea = activeDisplay.workArea;
    const targetWidth = getTargetWidth(workArea);
    const targetHeight = workArea.height;
    // Allow for minor DPI/frame rounding differences
    const EPS = 6;
    const widthClose = Math.abs(currentBounds.width - targetWidth) <= EPS;

    // Determine if currently snapped to left or right
    const isSnappedLeft = Math.abs(currentBounds.x - workArea.x) <= EPS && widthClose;
    const isSnappedRight = Math.abs(currentBounds.x - (workArea.x + workArea.width - targetWidth)) <= EPS && widthClose;

    if (isSnappedLeft) {
      // If snapped left, snap to right
      mainWindow.setBounds({
        x: workArea.x + workArea.width - targetWidth,
        y: workArea.y,
        width: targetWidth,
        height: targetHeight,
      });
      currentSide = 'right';
    } else if (isSnappedRight) {
      // If snapped right, snap to left
      mainWindow.setBounds({
        x: workArea.x,
        y: workArea.y,
        width: targetWidth,
        height: targetHeight,
      });
      currentSide = 'left';
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
        currentSide = 'left';
      } else {
        // Closer to right, snap right
        mainWindow.setBounds({
          x: workArea.x + workArea.width - targetWidth,
          y: workArea.y,
          width: targetWidth,
          height: targetHeight,
        });
        currentSide = 'right';
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
