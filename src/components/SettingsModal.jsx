import React, { useEffect, useCallback } from 'react';
import closeIcon from '../assets/icons/close.svg';

const SettingsModal = ({ isOpen, onClose, currentTheme, onThemeChange, onUploadImage, customImageTextColor, onCustomImageTextColorChange }) => {
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
    { key: 'customImage', title: 'Upload image', description: 'Select a custom background image from your computer.', isUpload: true },
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
              {themes.map((theme) => {
                const isActive = currentTheme === theme.key;
                const handleClick = () => {
                  if (theme.isUpload) {
                    if (onUploadImage) {
                      onUploadImage();
                    }
                  } else {
                    handleThemeSelect(theme.key);
                  }
                };

                return (
                  <button
                    key={theme.key}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    className={`settings-theme-option${isActive ? ' settings-theme-option--active' : ''}${theme.isUpload ? ' settings-theme-option--upload' : ''}`}
                    onClick={handleClick}
                  >
                    <span className="settings-theme-option__title">{theme.title}</span>
                    <span className="settings-theme-option__description">{theme.description}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {currentTheme === 'customImage' && (
            <section className="settings-section">
              <div className="settings-section__header">
                <h3>Text & Icon Color</h3>
                <p>Choose text color that works with your background.</p>
              </div>
              <div className="settings-text-color-options" role="radiogroup" aria-label="Text Color">
                <button
                  type="button"
                  role="radio"
                  aria-checked={customImageTextColor === 'white'}
                  className={`settings-text-color-option${customImageTextColor === 'white' ? ' settings-text-color-option--active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCustomImageTextColorChange?.('white');
                  }}
                >
                  <span className="settings-text-color-option__preview" style={{ backgroundColor: '#ffffff', border: '1px solid #333' }}></span>
                  <span className="settings-text-color-option__label">White</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={customImageTextColor === 'black'}
                  className={`settings-text-color-option${customImageTextColor === 'black' ? ' settings-text-color-option--active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCustomImageTextColorChange?.('black');
                  }}
                >
                  <span className="settings-text-color-option__preview" style={{ backgroundColor: '#000000' }}></span>
                  <span className="settings-text-color-option__label">Black</span>
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
