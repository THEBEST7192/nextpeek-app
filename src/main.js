import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

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
const TRIGGER_ZONE_WIDTH = 5; // 5px trigger zone on screen edges
const ANIMATION_DURATION = 300; // ms for slide animation
const HIDE_DELAY = 500; // ms delay before hiding sidebar

const createWindow = () => {
  // Create the browser window.
  const primaryDisplay = screen.getPrimaryDisplay();
  const targetWidth = Math.floor(primaryDisplay.workArea.width / 5);
  
  mainWindow = new BrowserWindow({
    width: targetWidth,
    height: primaryDisplay.workArea.height,
    x: primaryDisplay.workArea.x,
    y: primaryDisplay.workArea.y,
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
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea;
    const windowBounds = mainWindow.getBounds();

    // Check if cursor is in trigger zones
    // When pinned, we don't need trigger zones as the window is always visible
    // When not pinned, use screen edges for trigger zones
    const isInLeftTrigger = !isPinned && 
                           cursorPos.x <= workArea.x + TRIGGER_ZONE_WIDTH && 
                           cursorPos.y >= workArea.y && 
                           cursorPos.y <= workArea.y + workArea.height;

    const isInRightTrigger = !isPinned && 
                            cursorPos.x >= workArea.x + workArea.width - TRIGGER_ZONE_WIDTH && 
                            cursorPos.y >= workArea.y && 
                            cursorPos.y <= workArea.y + workArea.height;
                            
    // Debug output for trigger zones
    if (isInLeftTrigger || isInRightTrigger) {
      console.log(`Cursor in trigger zone: Left=${isInLeftTrigger}, Right=${isInRightTrigger}, isPinned=${isPinned}`);
    }

    // Check if cursor is in sidebar area when visible
    const isInSidebar = cursorPos.x >= windowBounds.x && 
                       cursorPos.x <= windowBounds.x + windowBounds.width &&
                       cursorPos.y >= windowBounds.y && 
                       cursorPos.y <= windowBounds.y + windowBounds.height;

    if (isInLeftTrigger && !isSidebarVisible && !isAnimating && !showDelayTimeout) {
          // Left edge - show sidebar with delay
          console.log('Showing sidebar on LEFT side');
          showDelayTimeout = setTimeout(() => {
            showSidebar('left');
            showDelayTimeout = null;
          }, SHOW_DELAY);
        } else if (isInRightTrigger && !isSidebarVisible && !isAnimating && !showDelayTimeout) {
          // Right edge - show sidebar with delay
          console.log('Showing sidebar on RIGHT side');
          showDelayTimeout = setTimeout(() => {
            showSidebar('right');
            showDelayTimeout = null;
          }, SHOW_DELAY);
        } else if (isInLeftTrigger && isSidebarVisible) {
          // Already visible on left - clear any pending hide timeout
          if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
          }
        } else if (isInRightTrigger && isSidebarVisible) {
          // Already visible on right - clear any pending hide timeout
          if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
          }
        } else if (!isInLeftTrigger && !isInRightTrigger) {
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

  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
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

  // Set initial position off-screen
  const startX = side === 'left' ? -targetWidth : workArea.x + workArea.width;
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
  mainWindow.setAlwaysOnTop(isPinned);
  
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
    const primaryDisplay = screen.getPrimaryDisplay();
    const targetWidth = Math.floor(primaryDisplay.workArea.width / 5);
    
    // Keep the same position but adjust width/height
    mainWindow.setBounds({
      x: currentBounds.x,
      y: currentBounds.y,
      width: targetWidth,
      height: primaryDisplay.workArea.height
    });
  } else { // When unpinning
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea;
    const currentBounds = mainWindow.getBounds();
  
    const windowWidth = currentBounds.width;
    const windowHeight = currentBounds.height;
  
    // Calculate the four corners of the work area, adjusted for window size
    const topLeft = { x: workArea.x, y: workArea.y };
    const topRight = { x: workArea.x + workArea.width - windowWidth, y: workArea.y };
    const bottomLeft = { x: workArea.x, y: workArea.y + workArea.height - windowHeight };
    const bottomRight = { x: workArea.x + workArea.width - windowWidth, y: workArea.y + workArea.height - windowHeight };
  
    const corners = [topLeft, topRight, bottomLeft, bottomRight];
  
    let closestCorner = corners[0];
    let minDistance = Infinity;
  
    // Find the closest corner
    for (const corner of corners) {
      const dist = Math.sqrt(
        Math.pow(currentBounds.x - corner.x, 2) +
        Math.pow(currentBounds.y - corner.y, 2)
      );
      if (dist < minDistance) {
        minDistance = dist;
        closestCorner = corner;
      }
    }
  
    // Move the window to the closest corner
    mainWindow.setBounds({
      x: closestCorner.x,
      y: closestCorner.y,
      width: windowWidth,
      height: windowHeight
    });
    
    console.log(`Window unpinned and moved to corner: (${closestCorner.x}, ${closestCorner.y})`);
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

  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
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

  // Disable mouse events during hide animation
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Calculate animation parameters
  const startX = windowBounds.x;
  const targetX = isOnLeft ? -targetWidth : workArea.x + workArea.width;
  
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

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  // Start mouse tracking for sidebar functionality
  startMouseTracking();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      startMouseTracking();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
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
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea;

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
