import { BrowserWindow, screen, ipcMain } from 'electron';
import path from 'node:path';

let pongWindows = {
  ball: null,
  leftPaddle: null,
  rightPaddle: null
};

let pongInterval = null;
let ballState = { x: 0, y: 0, vx: 8, vy: 8 };
let aiState = {
  targetY: 0,
  reactionTimer: 0,
  errorOffset: 0,
  currentSpeed: 0,
  velocity: 0,
  lastBallY: 0,
  panicMode: false,
  distractionTimer: 0
};

// Context to be provided by main.js
let context = {
  getCurrentTheme: () => 'solid',
  getThemePayload: () => ({}),
  getCurrentQueue: () => null,
  getRecentlyPlayedTracks: () => [],
  viteDevServerUrl: null,
  viteName: null,
  preloadPath: null
};

export function initPongService(cfg) {
  context = { ...context, ...cfg };

  ipcMain.on('start-pong', handleStartPong);
  ipcMain.handle('get-initial-pong-data', () => ({
    queue: context.getCurrentQueue(),
    history: context.getRecentlyPlayedTracks(),
    theme: context.getThemePayload()
  }));
}

export function closePong() {
  stopPongLoop();
  Object.values(pongWindows).forEach(win => {
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });
  pongWindows.leftPaddle = null;
  pongWindows.rightPaddle = null;
  pongWindows.ball = null;
}

export function relayPongData(type, data) {
  if (type === 'queue') {
    if (pongWindows.leftPaddle && !pongWindows.leftPaddle.isDestroyed()) {
      pongWindows.leftPaddle.webContents.send('queue-updated', data);
    }
    if (pongWindows.ball && !pongWindows.ball.isDestroyed()) {
      pongWindows.ball.webContents.send('queue-updated', data);
    }
  } else if (type === 'history') {
    if (pongWindows.rightPaddle && !pongWindows.rightPaddle.isDestroyed()) {
      pongWindows.rightPaddle.webContents.send('recently-played-updated', data);
    }
  }
}

function stopPongLoop() {
  if (pongInterval) {
    clearInterval(pongInterval);
    pongInterval = null;
  }
}

function startPongLoop() {
  stopPongLoop();
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  ballState = { 
    x: width / 2, 
    y: height / 2, 
    vx: Math.random() > 0.5 ? 8 : -8, 
    vy: (Math.random() - 0.5) * 10 
  };

  pongInterval = setInterval(() => {
    if (!pongWindows.ball) return stopPongLoop();
    
    // Update ball position
    ballState.x += ballState.vx;
    ballState.y += ballState.vy;
    
    // Collision with top/bottom
    if (ballState.y <= 0 || ballState.y >= height - 80) { // 80 is ballH
      ballState.vy *= -1;
    }
    
    // Collision with paddles
    const BALL_W = 120;
    const BALL_H = 80;

    // Left paddle
    if (pongWindows.leftPaddle) {
      const lpBounds = pongWindows.leftPaddle.getBounds();
      if (ballState.x <= lpBounds.x + lpBounds.width && ballState.x + BALL_W >= lpBounds.x) {
        if (ballState.y + BALL_H >= lpBounds.y && ballState.y <= lpBounds.y + lpBounds.height) {
          if (ballState.vx < 0) {
            ballState.vx = Math.abs(ballState.vx) + 0.5; // Speed up slightly
            ballState.vy += (Math.random() - 0.5) * 4;
          }
        }
      }
    }

    // Right paddle
    if (pongWindows.rightPaddle) {
      const rpBounds = pongWindows.rightPaddle.getBounds();
      if (ballState.x + BALL_W >= rpBounds.x && ballState.x <= rpBounds.x + rpBounds.width) {
        if (ballState.y + BALL_H >= rpBounds.y && ballState.y <= rpBounds.y + rpBounds.height) {
          if (ballState.vx > 0) {
            ballState.vx = -Math.abs(ballState.vx) - 0.5; // Speed up slightly
            ballState.vy += (Math.random() - 0.5) * 4;
          }
        }
      }
    }

    // Reset if out of bounds
    if (ballState.x < -200 || ballState.x > width + 200) {
        ballState.x = width / 2;
        ballState.y = height / 2;
        ballState.vx = ballState.vx > 0 ? -8 : 8;
        ballState.vy = (Math.random() - 0.5) * 10;
    }

    // Move ball window
    if (pongWindows.ball && !pongWindows.ball.isDestroyed()) {
      pongWindows.ball.setBounds({ 
        x: Math.round(ballState.x), 
        y: Math.round(ballState.y), 
        width: 120,
        height: 80
      });
    }
    
    // User control for left paddle (mouse)
    if (pongWindows.leftPaddle && !pongWindows.leftPaddle.isDestroyed()) {
      const lpBounds = pongWindows.leftPaddle.getBounds();
      const cursor = screen.getCursorScreenPoint();
      const targetY = cursor.y - 150; // paddleH = 300
      const currentY = lpBounds.y;
      const diff = targetY - currentY;
      const speed = 20;
      const newY = currentY + Math.sign(diff) * Math.min(Math.abs(diff), speed);
      pongWindows.leftPaddle.setBounds({ 
        x: lpBounds.x, 
        y: Math.round(newY), 
        width: 200, // paddleW
        height: 300 // paddleH
      });
    }

    // Clanker control for right paddle
    if (pongWindows.rightPaddle && !pongWindows.rightPaddle.isDestroyed()) {
      const rpBounds = pongWindows.rightPaddle.getBounds();
      const PADDLE_H = 300;
      const BALL_H = 80;
      const currentY = rpBounds.y;
      const centerY = height / 2;
      
      // Clanker "Reaction"/"Distraction" logic
      aiState.reactionTimer--;
      aiState.distractionTimer--;
      
      const distToBall = Math.abs(ballState.x - rpBounds.x);
      const isBallComing = ballState.vx > 0;
      const ballSpeed = Math.sqrt(ballState.vx ** 2 + ballState.vy ** 2);

      // Randomly get distracted if ball is far away
      if (distToBall > width * 0.7 && Math.random() < 0.002 && aiState.distractionTimer <= 0) {
        aiState.distractionTimer = 15 + Math.random() * 25;
      }

      if (aiState.distractionTimer > 0) {
        // AI is distracted, stay near current position or drift slightly
        if (!aiState.targetY) aiState.targetY = currentY + PADDLE_H / 2;
        aiState.targetY += (Math.random() - 0.5) * 5; 
      } else if (aiState.reactionTimer <= 0) {
        if (isBallComing) {
          // Ball is coming, track it with human error
          // Panic if ball is fast and close
          aiState.panicMode = (distToBall < 500 && ballSpeed > 10);
          
          const errorMagnitude = aiState.panicMode ? 100 : Math.min(60, distToBall / 10);
          aiState.errorOffset = (Math.random() - 0.5) * errorMagnitude;
          
          // Predicted target with error
          aiState.targetY = ballState.y + BALL_H / 2 + aiState.errorOffset;
          
          // Reaction time: faster speeds
          aiState.reactionTimer = aiState.panicMode ? 0 : Math.max(2, Math.floor(distToBall / (ballSpeed * 25)));
        } else {
          // Ball is going away, move up and down (fidgeting/anticipating)
          aiState.panicMode = false;
          
          // Create a "human" fidgeting motion using a sine wave with some noise
          const time = Date.now() / 1000;
          const jitter = Math.sin(time * 3.5) * 150; // Faster, larger oscillation
          const noise = (Math.random() - 0.5) * 30; // Small random micro-movements
          
          aiState.targetY = (height / 2) + jitter + noise;
          
          aiState.reactionTimer = 1; 
        }
      }

      // Physics-based movement (acceleration/deceleration) - Increased speed
      const targetPaddleTop = aiState.targetY - PADDLE_H / 2;
      const diff = targetPaddleTop - currentY;
      
      const maxSpeed = aiState.panicMode ? 18 : 12;
      const acceleration = aiState.panicMode ? 2.0 : 1.2;
      const friction = 0.88; 

      // Apply acceleration
      if (Math.abs(diff) > 10) {
        aiState.velocity += Math.sign(diff) * acceleration;
      } else {
        // Slightly decelerate when not moving
        aiState.velocity *= 0.6;
      }

      // Speed limit
      if (Math.abs(aiState.velocity) > maxSpeed) {
        aiState.velocity = Math.sign(aiState.velocity) * maxSpeed;
      }

      // Apply friction
      aiState.velocity *= friction;

      // Small chance to overshoot if moving fast
      if (!aiState.panicMode && Math.abs(aiState.velocity) > 7 && Math.random() < 0.05) {
        aiState.velocity += Math.sign(aiState.velocity) * 2; // Extra push to overshoot
      }

      const newY = currentY + aiState.velocity;
      
      // Clamp to screen
      const clampedY = Math.max(0, Math.min(height - PADDLE_H, newY));

      if (Math.abs(aiState.velocity) > 0.1) {
        pongWindows.rightPaddle.setBounds({ 
          x: rpBounds.x, 
          y: Math.round(clampedY), 
          width: 200, 
          height: PADDLE_H 
        });
      }
    }
  }, 16);
}

function handleStartPong() {
  if (pongWindows.ball) {
    // If any Pong window is open, stop the game+close all Pong windows and stop animation loop
    Object.values(pongWindows).forEach(win => win?.close());
    stopPongLoop();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const paddleW = 200;
  const paddleH = 300;
  const ballW = 120;
  const ballH = 80;
  
  // Create windows
  const createPongWindow = (mode, x, y, w, h) => {
    const winOptions = {
      width: w,
      height: h,
      x: Math.round(x),
      y: Math.round(y),
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      webPreferences: {
        preload: context.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    };

    if (context.getCurrentTheme() === 'solid') {
      // Disable transparency for solid themes
      winOptions.transparent = false;
      winOptions.backgroundColor = '#121212';
    } else {
      winOptions.transparent = true;
    }

    const win = new BrowserWindow(winOptions);

    const queryParams = `?mode=${mode}`;
    if (context.viteDevServerUrl) {
      win.loadURL(context.viteDevServerUrl + queryParams);
    } else {
      // Use path.join for file loading
      win.loadFile(path.join(__dirname, `../../renderer/${context.viteName}/index.html`), { query: { mode } });
    }
    
    win.on('closed', () => {
      const key = mode === 'pong-ball' ? 'ball' : (mode === 'pong-paddle-left' ? 'leftPaddle' : 'rightPaddle');
      pongWindows[key] = null;
      if (!pongWindows.ball && !pongWindows.leftPaddle && !pongWindows.rightPaddle) {
        stopPongLoop();
      }
    });

    return win;
  };

  pongWindows.leftPaddle = createPongWindow('pong-paddle-left', 50, (height - paddleH) / 2, paddleW, paddleH);
  pongWindows.rightPaddle = createPongWindow('pong-paddle-right', width - paddleW - 50, (height - paddleH) / 2, paddleW, paddleH);
  pongWindows.ball = createPongWindow('pong-ball', (width - ballW) / 2, (height - ballH) / 2, ballW, ballH);
  
  // Start broadcasting data to them
  const queueData = context.getCurrentQueue();
  const historyData = context.getRecentlyPlayedTracks();

  [pongWindows.leftPaddle, pongWindows.rightPaddle, pongWindows.ball].forEach(win => {
    if (!win) return;
    win.webContents.on('did-finish-load', () => {
      if (queueData) win.webContents.send('queue-updated', queueData);
      if (historyData) win.webContents.send('recently-played-updated', historyData);
      win.webContents.send('theme-changed', context.getThemePayload());
    });
  });

  startPongLoop();
}
