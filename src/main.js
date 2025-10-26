import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow;

const createWindow = () => {
  // Create the browser window.
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.floor(width / 5),
    height: height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
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

ipcMain.on('toggle-pin', () => {
  if (mainWindow) {
    const isAlwaysOnTop = mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(!isAlwaysOnTop);
    console.log(`Window pin ${!isAlwaysOnTop ? 'enabled' : 'disabled'}`);
  }
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
