import React, { useEffect, useCallback } from 'react';

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
            ×
          </button>
        </div>

        <div className="settings-modal__content">
          <section className="settings-section">
            <div className="settings-section__header">
              <h3>Appearance</h3>
              <p>Choose how the window blends with your desktop.</p>
            </div>
            <div className="settings-theme-options" role="radiogroup" aria-label="Theme">
              <button
                type="button"
                role="radio"
                aria-checked={currentTheme === 'solid'}
                className={`settings-theme-option${currentTheme === 'solid' ? ' settings-theme-option--active' : ''}`}
                onClick={() => handleThemeSelect('solid')}
              >
                <span className="settings-theme-option__title">Solid</span>
                <span className="settings-theme-option__description">Opaque background with higher contrast.</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={currentTheme === 'transparent'}
                className={`settings-theme-option${currentTheme === 'transparent' ? ' settings-theme-option--active' : ''}`}
                onClick={() => handleThemeSelect('transparent')}
              >
                <span className="settings-theme-option__title">Transparent</span>
                <span className="settings-theme-option__description">Transparent background that reveals your desktop.</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
