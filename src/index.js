#!/usr/bin/env node

/**
 * X_BOT — AI Multilingual Content Generation Engine for X (Twitter)
 * Entry point for Command Line Interface
 */

import { MenuController } from './cli/menu.js';
import { ansi } from './utils/ansi.js';

process.on('SIGINT', () => {
  console.log(`\n\n${ansi.yellowText('Session ended by user (Ctrl+C). Exiting X_BOT.')}\n`);
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  console.error(`\n${ansi.redText('[Unexpected Error]')}`, reason?.message || reason);
});

async function main() {
  const menu = new MenuController();
  await menu.start();
}

main().catch((err) => {
  console.error(`\n${ansi.redText('[Fatal Error]')}`, err);
  process.exit(1);
});
