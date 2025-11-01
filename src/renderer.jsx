import React from 'react';
import ReactDOM from 'react-dom/client';
import NowPlaying from './components/NowPlaying.jsx';

document.addEventListener('DOMContentLoaded', () => {
  // Close button
  const closeButton = document.getElementById('close-button');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      window.electronAPI.closeWindow();
    });
  }

  // Spotify login button
  const spotifyLoginBtn = document.getElementById('spotify-login-btn');
  const loginScreen = document.getElementById('login-screen');
  const spotifyLoginTextEl = document.getElementById('spotify-login-text');
  const rootElement = document.getElementById('root');
  const root = ReactDOM.createRoot(rootElement);

  const renderApp = async (accessToken) => {
    if (rootElement) {
      document.body.classList.add('logged-in'); // Add class when logged in
      root.render(
        <React.StrictMode>
          <NowPlaying accessToken={accessToken} />
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
      document.body.classList.remove('logged-in'); // Remove class when not logged in
      loginScreen.style.display = 'block';
    }
  };

  if (spotifyLoginBtn && window.electronAPI) {
    // Initialize status on load
    if (window.electronAPI.getSpotifyAuthStatus) {
      window.electronAPI.getSpotifyAuthStatus().then((status) => {
        if (status && status.accessToken) {
          hideLoginScreen();
          renderApp(status.accessToken);
        } else {
          showLoginScreen();
        }
      }).catch(() => {
        showLoginScreen();
      });
    }

    // Start OAuth login on click
    spotifyLoginBtn.addEventListener('click', () => {
      if (window.electronAPI.startSpotifyAuth) {
        window.electronAPI.startSpotifyAuth();
        // Provide immediate feedback
        spotifyLoginBtn.disabled = true;
        if (spotifyLoginTextEl) {
          spotifyLoginTextEl.textContent = 'Opening Spotify…';
        }
      }
    });

    // Handle success
    if (window.electronAPI.onSpotifyAuthSuccess) {
      window.electronAPI.onSpotifyAuthSuccess((event, { accessToken }) => {
        hideLoginScreen();
        renderApp(accessToken);
      });
    }

    // Handle error
    if (window.electronAPI.onSpotifyAuthError) {
      window.electronAPI.onSpotifyAuthError((event, message) => {
        // Restore button state and show error
        spotifyLoginBtn.disabled = false;
        if (spotifyLoginTextEl) {
          spotifyLoginTextEl.textContent = 'Log in with Spotify';
        }
        if (message) {
          alert(`Spotify auth failed: ${message}`);
        }
        showLoginScreen();
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

  // Play/Pause button
  const playPauseButton = document.getElementById('play-pause-button');
  if (playPauseButton) {
    playPauseButton.addEventListener('click', () => {
      window.electronAPI.togglePlayPause();
    });
    
    // Listen for play state changes from main process
    if (window.electronAPI && window.electronAPI.onPlayStateChange) {
      window.electronAPI.onPlayStateChange((event, isPlaying) => {
        const img = playPauseButton.querySelector('img');
        if (img) {
          // Update icon based on actual play state
          img.src = isPlaying ? './src/assets/icons/pause.svg' : './src/assets/icons/play.svg';
        }
      });
    }
  }

  // Skip previous button
  const skipPreviousButton = document.getElementById('skip-previous-button');
  if (skipPreviousButton) {
    skipPreviousButton.addEventListener('click', () => {
      window.electronAPI.skipPrevious();
    });
  }

  // Skip next button
  const skipNextButton = document.getElementById('skip-next-button');
  if (skipNextButton) {
    skipNextButton.addEventListener('click', () => {
      window.electronAPI.skipNext();
    });
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
          img.src = isPinned ? './src/assets/icons/pin.svg' : './src/assets/icons/pinoff.svg';
        }
      });
    }
  }
});
