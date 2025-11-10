import React, { useEffect, useCallback } from 'react';
import closeIcon from '../assets/icons/close.svg';

const SettingsModal = ({ isOpen, onClose, currentTheme, onThemeChange }) => {
  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose]);

  const handleOverlayMouseDown = (event) => {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  };

  const handleThemeSelect = (themeKey) => {
    if (onThemeChange) {
      onThemeChange(themeKey);
    }
  };

  const themes = [
    { key: 'solid', title: 'Solid', description: 'Opaque background with higher contrast.' },
    { key: 'transparent', title: 'Transparent', description: 'Transparent background that reveals your desktop.' },
    { key: 'rainbow', title: 'Rainbow (LGBT)', description: 'Classic rainbow pride flag colors.' },
    { key: 'gay', title: 'Green and Blue Gradient (Gay)', description: 'Gay pride flag colors.' },
    { key: 'trans', title: 'White, Blue, Pink (Trans)', description: 'Transgender pride flag colors.' },
    { key: 'lesbian', title: 'Pink Orange (Lesbian)', description: 'Lesbian pride flag colors.' },
    { key: 'asexual', title: 'Gray Purple (Asexual)', description: 'Asexual pride flag colors.' },
    { key: 'aroace', title: 'Orange and Blue (Aroace)', description: 'Aromantic asexual pride flag colors.' },
    { key: 'bi', title: 'Purple and Blue (Bi)', description: 'Bisexual pride flag colors.' },
    { key: 'straight', title: 'Black and White (Straight)', description: 'Straight pride flag colors.' },
    { key: 'straightAlly', title: 'Straight Ally', description: 'Black and white with rainbow stripe, supports LGBT community.' },
  ];

  if (!isOpen) {
    return null;
  }

  return (
    <div className="settings-modal-overlay" onMouseDown={handleOverlayMouseDown}>
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="settings-modal__header">
          <h2 id="settings-modal-title">Settings</h2>
          <button
            type="button"
            className="settings-modal__close-button"
            onClick={handleClose}
            aria-label="Close settings"
          >
            <img src={closeIcon} alt="" aria-hidden="true" />
          </button>
        </div>

        <div className="settings-modal__content">
          <section className="settings-section">
            <div className="settings-section__header">
              <h3>Appearance</h3>
              <p>Choose how the window blends with your desktop.</p>
            </div>
            <div className="settings-theme-options" role="radiogroup" aria-label="Theme">
              {themes.map((theme) => (
                <button
                  key={theme.key}
                  type="button"
                  role="radio"
                  aria-checked={currentTheme === theme.key}
                  className={`settings-theme-option${currentTheme === theme.key ? ' settings-theme-option--active' : ''}`}
                  onClick={() => handleThemeSelect(theme.key)}
                >
                  <span className="settings-theme-option__title">{theme.title}</span>
                  <span className="settings-theme-option__description">{theme.description}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
