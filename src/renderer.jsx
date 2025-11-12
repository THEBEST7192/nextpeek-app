import React from 'react';
import ReactDOM from 'react-dom/client';
import NowPlaying from './components/NowPlaying.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import { runSlotsGame, initializeSlotsGame } from './games/games.jsx';
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
  const loginSettingsBtn = document.getElementById('login-settings-button');
  const rootElement = document.getElementById('root');
  const root = ReactDOM.createRoot(rootElement);
  let currentTheme = document.body.dataset.theme || 'solid';
  let customImageTextColor = document.body.dataset.customImageTextColor || 'white';
  let isLoginSettingsOpen = false;
  let loginSettingsRoot = null;
  let renderLoginSettingsModal = () => {};

  const updateThemeUI = (themePayload) => {
    const payload = typeof themePayload === 'string' ? { theme: themePayload } : themePayload || {};
    const {
      theme = 'solid',
      customImageBase64 = null,
      customImageTextColor: payloadTextColor = null,
    } = payload;

    currentTheme = theme;
    document.body.dataset.theme = theme;

    const hasCustomBackground = theme === 'customImage' && customImageBase64;
    const imageUrl = hasCustomBackground ? `data:image/png;base64,${customImageBase64}` : 'none';
    document.body.style.setProperty('--custom-image-url', `url('${imageUrl}')`);
    document.body.classList.toggle('has-custom-background', Boolean(hasCustomBackground));

    if (typeof payloadTextColor === 'string') {
      customImageTextColor = payloadTextColor;
    }

    if (theme === 'customImage' && typeof customImageTextColor === 'string') {
      document.body.dataset.customImageTextColor = customImageTextColor;
    } else {
      delete document.body.dataset.customImageTextColor;
    }

    if (isLoginSettingsOpen) {
      renderLoginSettingsModal();
    }
  };

  updateThemeUI(currentTheme);

  const applyTheme = (themeKey) => {
    if (!window.electronAPI?.toggleTheme) {
      return;
    }

    try {
      const result = window.electronAPI.toggleTheme(themeKey);
      if (result?.then) {
        result.then((payload) => {
          updateThemeUI(payload);
        }).catch((error) => {
          console.error('Failed to apply theme:', error);
        });
      }
    } catch (error) {
      console.error('Failed to apply theme:', error);
    }
  };

  const uploadCustomBackground = async () => {
    if (!window.electronAPI?.uploadCustomBackground) {
      return;
    }

    try {
      const payload = await window.electronAPI.uploadCustomBackground();
      if (!payload?.canceled) {
        updateThemeUI(payload);
      }
    } catch (error) {
      console.error('Failed to upload custom background:', error);
    }
  };

  if (window.electronAPI?.onThemeChange) {
    window.electronAPI.onThemeChange((event, payload) => {
      updateThemeUI(payload);
    });
  }

  const setCustomImageTextColor = async (color) => {
    if (!window.electronAPI?.setCustomImageTextColor) {
      return;
    }

    try {
      const payload = await window.electronAPI.setCustomImageTextColor(color);
      if (payload?.success) {
        customImageTextColor = color;
        updateThemeUI(payload);
      }
    } catch (error) {
      console.error('Failed to set custom image text color:', error);
    }
  };

  renderLoginSettingsModal = () => {
    if (!loginSettingsRoot) {
      const modalContainer = document.createElement('div');
      document.body.appendChild(modalContainer);
      loginSettingsRoot = ReactDOM.createRoot(modalContainer);
    }

    loginSettingsRoot.render(
      <React.StrictMode>
        <SettingsModal
          isOpen={isLoginSettingsOpen}
          onClose={() => {
            isLoginSettingsOpen = false;
            renderLoginSettingsModal();
          }}
          currentTheme={currentTheme}
          onThemeChange={(themeKey) => {
            updateThemeUI(themeKey);
            applyTheme(themeKey);
          }}
          onUploadImage={uploadCustomBackground}
          customImageTextColor={customImageTextColor}
          onCustomImageTextColorChange={(color) => {
            setCustomImageTextColor(color);
          }}
        />
      </React.StrictMode>
    );
  };

  if (loginSettingsBtn) {
    loginSettingsBtn.addEventListener('click', () => {
      isLoginSettingsOpen = true;
      renderLoginSettingsModal();
    });
  }

  // Casino button
  const loginCasinoBtn = document.getElementById('login-casino-button');
  const gameModal = document.getElementById('game-modal');
  const gameCloseBtn = document.getElementById('game-close-btn');
  const gameOutput = document.getElementById('stdout/stderr');
  const spinButton = document.getElementById('spin-button');
  const moneyDisplay = document.getElementById('money-display');
  const betInput = document.getElementById('bet-input');

  // Persisted money across spins (and sessions)
  let money = Number(localStorage.getItem('casino_money')) || 120;
  const setMoney = (value) => {
    money = Number(value) || 0;
    localStorage.setItem('casino_money', String(money));
    if (moneyDisplay) moneyDisplay.textContent = String(money);
  };
  // Initialize money display on load
  setMoney(money);

  let injectedStyles = null;

  if (loginCasinoBtn) {
    loginCasinoBtn.addEventListener('click', async () => {
      if (gameModal && gameOutput) {
        gameModal.style.display = 'flex';
        if (!injectedStyles) { // Only initialize if styles haven't been injected yet
          try {
            const { money: initialMoney, style } = initializeSlotsGame();
            let currentMoney = initialMoney;
            gameOutput.value = `Welcome to the Casino!\nYou have ${currentMoney} credits.`;
            setMoney(initialMoney);
            injectedStyles = { style };
          } catch (error) {
            gameOutput.value = `Error initializing game: ${error.message}\n`;
            console.error('Game initialization error:', error);
          }
        }
      }
    });
  }

  if (spinButton) {
    let isSpinning = false;
    let isAwaitingSoulSellDecision = false;
    let pendingBet = 0; // To store the bet that caused the soul-sell prompt

    spinButton.addEventListener('click', async () => {
      if (isSpinning) {
        return;
      }
      isSpinning = true;
      spinButton.disabled = true; // Disable button during cooldown

      const currentInput = betInput ? betInput.value : '';

      if (gameOutput) {
        gameOutput.value = 'Processing...\n';

        try {
          let result;
          if (isAwaitingSoulSellDecision) {
            const sellSoulDecision = currentInput;
            result = await runSlotsGame(money, pendingBet, sellSoulDecision); // Pass pendingBet
            isAwaitingSoulSellDecision = false; // Reset state
            pendingBet = 0; // Clear pending bet
          } else {
            const betValue = Number(currentInput) || 1;
            result = await runSlotsGame(money, betValue);
            if (result.requiresSoulSellDecision) {
              pendingBet = betValue; // Store the bet that caused the prompt
            }
          }

          if (result.requiresSoulSellDecision) {
            gameOutput.value = result.output;
            isAwaitingSoulSellDecision = true;
            betInput.value = ''; // Clear input for next decision
          } else {
            gameOutput.value = result.output;
            setMoney(result.money);
            betInput.value = ''; // Clear input after game
          }
        } catch (error) {
          gameOutput.value = `Error running game: ${error.message}\n`;
          console.error('Game error:', error);
        } finally {
          setTimeout(() => {
            isSpinning = false;
            spinButton.disabled = false; // Re-enable button after cooldown
          }, 2000);
        }
      }
    });
    betInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') spinButton.click();
    });
  }

  if (gameCloseBtn) {
    gameCloseBtn.addEventListener('click', () => {
      if (gameModal) {
        gameModal.style.display = 'none';
      }
    });
  }

  // Close game modal when clicking outside
  if (gameModal) {
    gameModal.addEventListener('click', (e) => {
      if (e.target === gameModal) {
        gameModal.style.display = 'none';
      }
    });
  }

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
