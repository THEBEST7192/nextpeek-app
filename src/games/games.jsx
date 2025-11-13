import slotsGameCode from './slots.hc?raw';
import templeosFont from './holyc/templeos_font.ttf';

const injectStyles = () => {
  const gameModal = document.getElementById('game-modal');
  if (!gameModal) {
    console.error('#game-modal not found, cannot inject styles.');
    return { nesCssLink: null, style: null };
  }

  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: 'TempleOS';
            src: url(${templeosFont}) format('truetype');
      font-weight: normal;
      font-style: normal;
    }

    #game-modal,
    #game-modal * {
      font-family: 'TempleOS', monospace;
    }

    #game-modal .game-output {
      flex: 1;
      padding: 16px;
      background-color: #121212;
      font-size: 12px;
      line-height: 1.5;
      border: none;
      resize: none;
      overflow-y: auto;
      color: white !important;
    }
    /* NES.css: https://github.com/nostalgic-css/NES.css */
    /* nes-pointer */
    .nes-pointer {
      cursor: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAzElEQVRYR+2X0Q6AIAhF5f8/2jYXZkwEjNSVvVUjDpcrGgT7FUkI2D9xRfQETwNIyWO85wfINfQUEyxBG2ArsLwC0jioGt5zFcwF4OYDPi/mBYKm4t0U8ATgRm3ThFoAqkhNgWkA0jJLvaOVSs7j3qMnSgXWBMiWPXe94QqMBMBc1VZIvaTu5u5pQewq0EqNZvIEMCmxAawK0DNkay9QmfFNAJUXfgGgUkLaE7j/h8fnASkxHTz0DGIBMCnBeeM7AArpUd3mz2x3C7wADglA8BcWMZhZAAAAAElFTkSuQmCC) 14 0, pointer;
    }

    /* nes-btn */
    .nes-btn {
      border-image-slice: 2;
      border-image-width: 2;
      border-image-repeat: stretch;
      border-image-source: url('data:image/svg+xml;utf8,<?xml version="1.0" encoding="UTF-8" ?><svg version="1.1" width="5" height="5" xmlns="http://www.w3.org/2000/svg"><path d="M2 1 h1 v1 h-1 z M1 2 h1 v1 h-1 z M3 2 h1 v1 h-1 z M2 3 h1 v1 h-1 z" fill="rgb(33,37,41)" /></svg>');
      border-image-outset: 2;
      position: relative;
      display: inline-block;
      padding: 6px 8px;
      margin: 4px;
      text-align: center;
      vertical-align: middle;
      cursor: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAzElEQVRYR+2X0Q6AIAhF5f8/2jYXZkwEjNSVvVUjDpcrGgT7FUkI2D9xRfQETwNIyWO85wfINfQUEyxBG2ArsLwC0jioGt5zFcwF4OYDPi/mBYKm4t0U8ATgRm3ThFoAqkhNgWkA0jJLvaOVSs7j3qMnSgXWBMiWPXe94QqMBMBc1VZIvaTu5u5pQewq0EqNZvIEMCmxAawK0DNkay9QmfFNAJUXfgGgUkLaE7j/h8fnASkxHTz0DGIBMCnBeeM7AArpUd3mz2x3C7wADglA8BcWMZhZAAAAAElFTkSuQmCC) 14 0, pointer;
      -webkit-user-select: none;
         -moz-user-select: none;
          -ms-user-select: none;
              user-select: none;
      color: #212529;
      background-color: #fff;
    }

    @media all and (-webkit-min-device-pixel-ratio: 0) and (min-resolution: 0.001dpcm) {
      .nes-btn {
        border-image-repeat: space;
      }
    }

    @supports (-moz-appearance: meterbar) {
      .nes-btn {
        border-image-repeat: stretch;
      }
    }

    .nes-btn::after {
      position: absolute;
      top: -4px;
      right: -4px;
      bottom: -4px;
      left: -4px;
      content: "";
      box-shadow: inset -4px -4px #adafbc;
    }

    .nes-btn:hover {
      color: #212529;
      text-decoration: none;
      background-color: #e7e7e7;
    }

    .nes-btn:hover::after {
      box-shadow: inset -6px -6px #adafbc;
    }

    .nes-btn:focus {
      box-shadow: 0 0 0 6px rgba(173, 175, 188, 0.3);
    }

    .nes-btn:active:not(.is-disabled)::after {
      box-shadow: inset 4px 4px #adafbc;
    }

    .nes-btn:focus {
      outline: 0;
    }

    .nes-btn.is-disabled, .nes-btn.is-disabled:hover, .nes-btn.is-disabled:focus {
      color: #212529;
      cursor: not-allowed;
      background-color: #d3d3d3;
      box-shadow: inset -4px -4px #adafbc;
      opacity: 0.6;
    }

    /* nes-btn.is-success */
    .nes-btn.is-success {
      color: #fff;
      background-color: #92cc41;
    }

    .nes-btn.is-success::after {
      position: absolute;
      top: -4px;
      right: -4px;
      bottom: -4px;
      left: -4px;
      content: "";
      box-shadow: inset -4px -4px #4aa52e;
    }

    .nes-btn.is-success:hover {
      color: #fff;
      text-decoration: none;
      background-color: #76c442;
    }

    .nes-btn.is-success:hover::after {
      box-shadow: inset -6px -6px #4aa52e;
    }

    .nes-btn.is-success:focus {
      box-shadow: 0 0 0 6px rgba(74, 165, 46, 0.3);
    }

    .nes-btn.is-success:active:not(.is-disabled)::after {
      box-shadow: inset 4px 4px #4aa52e;
    }
  `;
  gameModal.append(style);

  return { style };
};

export const initializeSlotsGame = () => {
  const { style } = injectStyles();
  const money = Number(localStorage.getItem('casino_money')) || 120; // Get initial money
  const gameModal = document.getElementById('game-modal');
  if (gameModal) {
    gameModal.classList.add('nes-pointer');
  }
  return { money, style };
};

const buildHolyCSource = (money, bet) => {
  const s1 = Math.floor(Math.random() * 10);
  const s2 = Math.floor(Math.random() * 10);
  const s3 = Math.floor(Math.random() * 10);

  const header = `I64 SYMBOL_DIVISOR = 10922;
I64 credits = ${money};
I64 bet = ${bet};
I64 s1 = ${s1};
I64 s2 = ${s2};
I64 s3 = ${s3};
U8  result = 0;
I64 winnings = 0;

`;

  const source = header + String(slotsGameCode);

  // Debug: log the generated source to see what's being passed to HolyC
  console.log('Generated HolyC source:');
  console.log(source);

  return source;
};

const validateAndSanitizeBet = (betInput, walletMoney) => {
  const sanitizedBetString = String(betInput).replace(/-/g, '');
  const parsedBet = parseInt(sanitizedBetString, 10);

  if (isNaN(parsedBet) || parsedBet <= 0) {
    return { isValid: false, errorMessage: 'Invalid bet: Bet must be a positive number.' };
  }

  if (walletMoney === 0) {
    return { isValid: false, errorMessage: `Invalid bet: You have 0 credits.`, betExceedsWallet: true };
  }

  if (parsedBet > walletMoney) {
    return { isValid: false, errorMessage: `Invalid bet: Bet exceeds your current money. You have ${walletMoney} credits.` };
  }

  return { isValid: true, parsedBet };
};

export const runSlotsGame = async (money, bet, sellSoulDecision = null) => {
  let currentMoney = money;

  let validationResult = validateAndSanitizeBet(bet, currentMoney);

  if (!validationResult.isValid) {
    if (validationResult.betExceedsWallet) {
      if (sellSoulDecision === null) {
        return { output: `${validationResult.errorMessage}\nDo you want to sell your soul for 67 credits? Type 1 for Yes, 0 for No.`, money: currentMoney, requiresSoulSellDecision: true };
      } else if (sellSoulDecision === '1') {
        currentMoney += 67;
        validationResult = validateAndSanitizeBet(bet, currentMoney);
        if (!validationResult.isValid) {
          return { output: `Soul sold! You now have ${currentMoney} credits.\n${validationResult.errorMessage}`, money: currentMoney };
        }
        // If valid now, return updated money and message, don't run game automatically
        return { output: `Soul sold! You now have ${currentMoney} credits. Please place a new bet.`, money: currentMoney, requiresSoulSellDecision: false };
      } else if (sellSoulDecision === '0') {
        return { output: 'You chose not to sell your soul. Bet cancelled.', money: currentMoney };
      } else {
        return { output: 'Invalid input for selling soul. Bet cancelled.', money: currentMoney };
      }
    } else {
      return { output: validationResult.errorMessage, money: currentMoney };
    }
  }

  const stdinEl = document.getElementById('stdin');
  const stdoutEl = document.getElementById('stdout/stderr');
  if (!stdinEl || !stdoutEl) return { output: '', money: currentMoney };
  stdinEl.value = buildHolyCSource(currentMoney, validationResult.parsedBet);
  await window.holyc_web_run();
  const output = stdoutEl.value || '';
  const match = output.match(/Credits:\s*(\d+)/);
  const newMoney = match ? parseInt(match[1], 10) : currentMoney;
  return { output, money: newMoney };
};

