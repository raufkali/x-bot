// Lightweight ANSI formatting utilities for clean terminal UI

const ESC = '\x1b[';

export const ansi = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  italic: `${ESC}3m`,
  underline: `${ESC}4m`,

  // Foreground Colors
  black: `${ESC}30m`,
  red: `${ESC}31m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  cyan: `${ESC}36m`,
  white: `${ESC}37m`,
  gray: `${ESC}90m`,

  // Emerald / Bright Green palette
  emerald: `${ESC}38;2;16;185;129m`,       // #10B981
  emeraldDark: `${ESC}38;2;5;150;105m`,    // #059669
  emeraldLight: `${ESC}38;2;52;211;153m`,  // #34D399
  emeraldBg: `${ESC}48;2;16;185;129m`,

  // Backgrounds
  bgRed: `${ESC}41m`,
  bgGreen: `${ESC}42m`,
  bgYellow: `${ESC}43m`,
  bgBlue: `${ESC}44m`,
  bgGray: `${ESC}100m`,
  bgDark: `${ESC}48;2;30;41;59m`,

  // Helpers
  colorize: (colorCode, text) => `${colorCode}${text}${ansi.reset}`,
  boldText: (text) => `${ansi.bold}${text}${ansi.reset}`,
  dimText: (text) => `${ansi.dim}${text}${ansi.reset}`,
  emeraldText: (text) => `${ansi.emerald}${text}${ansi.reset}`,
  yellowText: (text) => `${ansi.yellow}${text}${ansi.reset}`,
  redText: (text) => `${ansi.red}${text}${ansi.reset}`,
  cyanText: (text) => `${ansi.cyan}${text}${ansi.reset}`,
  grayText: (text) => `${ansi.gray}${text}${ansi.reset}`,

  badge: (text, bg = ansi.emeraldBg, fg = ansi.white) =>
    ` ${bg}${ansi.bold}${fg} ${text} ${ansi.reset} `,

  separator: (char = '=', length = 60, color = ansi.gray) =>
    `${color}${char.repeat(length)}${ansi.reset}`,

  line: (char = '-', length = 60, color = ansi.gray) =>
    `${color}${char.repeat(length)}${ansi.reset}`
};
