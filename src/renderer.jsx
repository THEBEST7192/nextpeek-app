import React from 'react';
import ReactDOM from 'react-dom/client';
import NowPlaying from './components/NowPlaying.jsx';
import playIcon from './assets/icons/play.svg';
import pauseIcon from './assets/icons/pause.svg';
import pinIcon from './assets/icons/pin.svg';
import pinoffIcon from './assets/icons/pinoff.svg';

document.addEventListener('DOMContentLoaded', () => {
  // Close button
  const closeButton = document.getElementById('close-button');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      window.electronAPI.closeWindow();
    });
  }

  // Start button
  const startBtn = document.getElementById('spotify-login-btn');
  const loginScreen = document.getElementById('login-screen');
  const startBtnTextEl = document.getElementById('spotify-login-text');
  const rootElement = document.getElementById('root');
  const root = ReactDOM.createRoot(rootElement);

  const renderApp = async () => {
    if (rootElement) {
      document.body.classList.add('logged-in'); // Add class when started
      root.render(
        <React.StrictMode>
          <NowPlaying />
        </React.StrictMode>
      );
    }
  };

  const hideLoginScreen = () => {
    if (loginScreen) {
      loginScreen.style.display = 'none';
    }
  };

  const showLoginScreen = () => {
    if (loginScreen) {
      document.body.classList.remove('logged-in'); // Remove class when not started
      loginScreen.style.display = 'block';
    }
  };

  if (startBtn && window.electronAPI) {
    // Start queue listener on click
    startBtn.addEventListener('click', () => {
      if (window.electronAPI.startQueueListener) {
        window.electronAPI.startQueueListener();
        // Provide immediate feedback
        startBtn.disabled = true;
        if (startBtnTextEl) {
          startBtnTextEl.textContent = 'Starting...';
        }
      }
    });

    // Handle queue server started
    if (window.electronAPI.onQueueServerStarted) {
      window.electronAPI.onQueueServerStarted(() => {
        hideLoginScreen();
        renderApp();
      });
    }

    // Handle queue updates
    if (window.electronAPI.onQueueUpdated) {
      window.electronAPI.onQueueUpdated((event, queueData) => {
        console.log('Queue updated:', queueData);
        // You can update the UI with the queue data here
      });
    }
  }

  // Minimize button
  const minimizeButton = document.getElementById('minimize-button');
  if (minimizeButton) {
    minimizeButton.addEventListener('click', () => {
      window.electronAPI.minimizeWindow();
    });
  }

  // Next button
  const nextButton = document.getElementById('next-button');
  if (nextButton) {
    nextButton.addEventListener('click', () => {
      window.electronAPI.skipNext();
    });
  }
  
  // Previous button
  const prevButton = document.getElementById('prev-button');
  if (prevButton) {
    prevButton.addEventListener('click', () => {
      window.electronAPI.skipPrevious();
    });
  }

  // Play/Pause button
  const playPauseButton = document.getElementById('play-pause-button');
  if (playPauseButton) {
    // Track manual changes with a timeout
    let manualChangeTimeout = null;
    let lastSpotifyState = null;
    
    playPauseButton.addEventListener('click', () => {
      // Send the command to toggle play/pause
      window.electronAPI.togglePlayPause();
      
      // Get current state before toggling
      const img = playPauseButton.querySelector('img');
      const currentIsPlaying = img.src.includes('pause.svg');
      
      // Update UI immediately for responsive feel - toggle the current state
      img.src = !currentIsPlaying ? pauseIcon : playIcon;
      
      // Clear any existing timeout
      if (manualChangeTimeout) {
        clearTimeout(manualChangeTimeout);
      }
      
      // Set timeout to force sync with Spotify state after 500ms
      manualChangeTimeout = setTimeout(() => {
        if (lastSpotifyState !== null) {
          // Apply the last known Spotify state after delay
          img.src = lastSpotifyState ? pauseIcon : playIcon;
        }
        manualChangeTimeout = null;
      }, 500);
    });
    
    // Listen for play state changes from main process
    if (window.electronAPI && window.electronAPI.onPlayStateChange) {
      window.electronAPI.onPlayStateChange((event, isPlaying) => {
        // Always store the latest state from Spotify
        lastSpotifyState = isPlaying;
        
        const img = playPauseButton.querySelector('img');
        if (img && !manualChangeTimeout) {
          // Only update icon if we're not in a manual change period
          img.src = isPlaying ? pauseIcon : playIcon;
        }
      });
    }
  }

  // Snap button
  const snapButton = document.getElementById('snap-button');
  if (snapButton) {
    snapButton.addEventListener('click', () => {
      window.electronAPI.snapWindow();
    });
  }

  // Pin/Settings button
  const pinButton = document.getElementById('pin-button');
  if (pinButton) {
    pinButton.addEventListener('click', () => {
      window.electronAPI.togglePin();
    });
    
    // Listen for pin state changes from main process
    if (window.electronAPI && window.electronAPI.onPinStateChange) {
      window.electronAPI.onPinStateChange((event, isPinned) => {
        const img = pinButton.querySelector('img');
        if (img) {
          // Update icon based on actual pin state
          img.src = isPinned ? pinIcon : pinoffIcon;
        }
      });
    }
  }
});
