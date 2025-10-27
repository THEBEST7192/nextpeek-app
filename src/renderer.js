/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 */

import './index.css';

// Initialize titlebar controls
document.addEventListener('DOMContentLoaded', () => {
  // Close button
  const closeButton = document.getElementById('close-button');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      window.electronAPI.closeWindow();
    });
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
      // Toggle between play and pause icons
      const img = playPauseButton.querySelector('img');
      if (img) {
        const currentSrc = img.src;
        if (currentSrc.includes('play.svg')) {
          img.src = './src/assets/icons/pause.svg';
        } else {
          img.src = './src/assets/icons/play.svg';
        }
      }
    });
  }

  // Previous button
  const prevButton = document.getElementById('prev-button');
  if (prevButton) {
    prevButton.addEventListener('click', () => {
      window.electronAPI.skipPrevious();
    });
  }

  // Next button
  const nextButton = document.getElementById('next-button');
  if (nextButton) {
    nextButton.addEventListener('click', () => {
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
    window.electronAPI.onPinStateChange((event, isPinned) => {
      const img = pinButton.querySelector('img');
      if (img) {
        // Update icon based on actual pin state
        img.src = isPinned ? './src/assets/icons/pin.svg' : './src/assets/icons/pinoff.svg';
      }
    });
  }
});
