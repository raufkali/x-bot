#!/usr/bin/env node

/**
 * X_BOT — AI Multilingual Content Generation Engine for X (Twitter)
 * Entry point for Command Line Interface
 */

import { MenuController } from './cli/menu.js';
import { startServer } from './whatsapp/server.js';
import { ansi } from './utils/ansi.js';

process.on('SIGINT', () => {
  console.log(`\n\n${ansi.yellowText('Session ended by user (Ctrl+C). Exiting X_BOT.')}\n`);
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  console.error(`\n${ansi.redText('[Unexpected Error]')}`, reason?.message || reason);
});

async function main() {
  // If running in cloud hosting (Render, Railway) or non-interactive container
  if (process.env.RENDER || (process.env.PORT && !process.stdin.isTTY)) {
    console.log('[X_BOT] Cloud server environment detected. Starting WhatsApp Webhook HTTP Server...');
    startServer(process.env.PORT || 3000);
    return;
  }

  const menu = new MenuController();
  await menu.start();
}

main().catch((err) => {
  console.error(`\n${ansi.redText('[Fatal Error]')}`, err);
  process.exit(1);
});
