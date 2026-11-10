/**
 * Terminal Input Handlers
 * Supports single line prompts, choice selections, and multiline pasting.
 */

import readline from 'readline';
import { ansi } from '../utils/ansi.js';

/**
 * Creates an active readline interface
 */
export function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Asks a single question and returns the trimmed response
 * @param {readline.Interface} rl 
 * @param {string} promptText 
 * @returns {Promise<string>}
 */
export function askQuestion(rl, promptText) {
  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      resolve(answer ? answer.trim() : '');
    });
  });
}

/**
 * Prompts user to select from a numbered list of choices
 * @param {readline.Interface} rl 
 * @param {string} title 
 * @param {string[]} choices 
 * @param {number} defaultIndex - 1-based index
 * @returns {Promise<string>} Selected choice string
 */
export async function askChoice(rl, title, choices, defaultIndex = 1) {
  console.log(`\n${ansi.boldText(title)}`);
  choices.forEach((choice, idx) => {
    const num = idx + 1;
    const isDef = num === defaultIndex;
    console.log(`  ${ansi.emeraldText(`${num}.`)} ${choice} ${isDef ? ansi.dimText('(Default)') : ''}`);
  });

  while (true) {
    const raw = await askQuestion(rl, `${ansi.emeraldText('Choose an option')} [1-${choices.length}] (Enter for default): `);
    if (!raw) {
      return choices[defaultIndex - 1];
    }
    const selectedNum = parseInt(raw, 10);
    if (!isNaN(selectedNum) && selectedNum >= 1 && selectedNum <= choices.length) {
      return choices[selectedNum - 1];
    }
    console.log(ansi.yellowText(`Invalid selection. Please enter a number between 1 and ${choices.length}.`));
  }
}

/**
 * Reads multi-line text input (especially for pasting Grok output or detailed topic)
 * Ends when user types 'END' on a fresh line, or double Enter on an empty line.
 * @param {readline.Interface} rl 
 * @param {string} promptMessage 
 * @returns {Promise<string>}
 */
export function readMultiLine(rl, promptMessage = 'Enter / paste text:') {
  return new Promise((resolve) => {
    console.log(`\n${ansi.boldText(promptMessage)}`);
    console.log(ansi.dimText("  (Paste your content. When finished, type 'END' on a new line and press Enter):"));
    console.log(ansi.separator('-', 50, ansi.gray));

    const lines = [];
    let emptyLineCount = 0;

    const onLine = (line) => {
      const trimmed = line.trim();

      if (trimmed === 'END' || trimmed === 'end') {
        cleanup();
        resolve(lines.join('\n').trim());
        return;
      }

      // Check if user hit double enter on an empty line after entering some text
      if (trimmed === '') {
        emptyLineCount++;
        if (emptyLineCount >= 2 && lines.length > 0) {
          cleanup();
          resolve(lines.join('\n').trim());
          return;
        }
      } else {
        emptyLineCount = 0;
      }

      lines.push(line);
    };

    const cleanup = () => {
      rl.removeListener('line', onLine);
    };

    rl.on('line', onLine);
  });
}
