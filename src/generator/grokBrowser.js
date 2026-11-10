/**
 * Browser Automation for Free Grok Chat (https://grok.com)
 * Uses Playwright to connect to an existing session or launch a browser instance.
 * Strictly compliant: does not bypass security or CAPTCHA, reports issues transparently.
 */

import { chromium } from 'playwright';
import { config } from '../config.js';

/**
 * Diagnostic check to see if automated browser environment is reachable
 * @returns {Promise<{ available: boolean, mode: string, message: string }>}
 */
export async function checkBrowserAvailability() {
  if (config.grokMode === 'manual') {
    return {
      available: false,
      mode: 'MANUAL',
      message: 'Configured to Manual Grok Mode.'
    };
  }

  // Check if CDP is reachable
  if (config.chromeCdpUrl) {
    try {
      const browser = await chromium.connectOverCDP(config.chromeCdpUrl, { timeout: 3000 });
      await browser.close();
      return {
        available: true,
        mode: 'AUTOMATED (CDP)',
        message: `Connected to existing browser via CDP at ${config.chromeCdpUrl}`
      };
    } catch (err) {
      return {
        available: false,
        mode: 'MANUAL',
        message: `CDP endpoint (${config.chromeCdpUrl}) not responding: ${err.message}`
      };
    }
  }

  return {
    available: true,
    mode: 'AUTOMATED',
    message: 'Playwright browser automation ready.'
  };
}

/**
 * Attempts automated generation on grok.com
 *
 * @param {string} prompt - Prompt to send
 * @param {Function} [statusCallback] - Callback for real-time progress messages
 * @returns {Promise<{ success: boolean, rawText?: string, error?: string, requiresManual: boolean }>}
 */
export async function generateWithGrokBrowser(prompt, statusCallback = () => {}) {
  let browser = null;
  let context = null;

  try {
    statusCallback('Initializing browser connection...');

    if (config.chromeCdpUrl) {
      statusCallback(`Connecting to existing browser session at ${config.chromeCdpUrl}...`);
      browser = await chromium.connectOverCDP(config.chromeCdpUrl, {
        timeout: config.browserTimeoutMs
      });
      const contexts = browser.contexts();
      context = contexts.length > 0 ? contexts[0] : await browser.newContext();
    } else {
      statusCallback('Launching browser instance for Grok Chat...');
      const launchOptions = {
        headless: config.browserHeadless,
        timeout: config.browserTimeoutMs
      };
      if (config.browserExecutablePath) {
        launchOptions.executablePath = config.browserExecutablePath;
      }
      browser = await chromium.launch(launchOptions);
      context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      });
    }

    const page = await context.newPage();
    page.setDefaultTimeout(config.browserTimeoutMs);

    statusCallback(`Navigating to ${config.grokUrl}...`);
    await page.goto(config.grokUrl, { waitUntil: 'domcontentloaded', timeout: config.browserTimeoutMs });

    // Wait a brief moment for dynamic hydration
    await page.waitForTimeout(2000);

    // Check for Cloudflare challenge or security verification
    const isCloudflare = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      return (
        text.includes('Checking your browser before accessing') ||
        text.includes('Verify you are human') ||
        document.title.includes('Just a moment') ||
        document.querySelector('#challenge-running') !== null
      );
    });

    if (isCloudflare) {
      await page.close();
      if (browser && !config.chromeCdpUrl) await browser.close();
      return {
        success: false,
        error: 'Cloudflare security check detected on grok.com. Please complete verification in your browser session or use Manual Grok Mode.',
        requiresManual: true
      };
    }

    // Check if user is required to log in
    const requiresLogin = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      return (
        text.includes('Sign in to continue') ||
        text.includes('Log in with X') ||
        text.includes('Sign In to Grok')
      );
    });

    if (requiresLogin) {
      await page.close();
      if (browser && !config.chromeCdpUrl) await browser.close();
      return {
        success: false,
        error: 'Grok requires authentication. Open grok.com in an authenticated browser profile or switch to Manual Mode.',
        requiresManual: true
      };
    }

    // Locate chat input textarea or contenteditable element
    statusCallback('Locating chat input box on Grok...');
    const inputSelector = 'textarea, [contenteditable="true"]';
    await page.waitForSelector(inputSelector, { timeout: 10000 });

    const input = await page.$(inputSelector);
    if (!input) {
      throw new Error('Unable to find Grok chat input field on the page.');
    }

    statusCallback('Submitting prompt to Grok...');
    await input.click();
    await input.fill(prompt);
    await page.keyboard.press('Enter');

    // Wait for response to begin generating
    statusCallback('Waiting for Grok to begin generating response...');
    await page.waitForTimeout(3000);

    // Monitor response until completed
    statusCallback('Grok is thinking and generating content...');
    let previousText = '';
    let stableCount = 0;
    const maxWaitSeconds = 60;
    const startTime = Date.now();

    while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
      await page.waitForTimeout(2000);

      // Extract latest assistant message
      const latestMessageText = await page.evaluate(() => {
        // Look for message containers
        const messageElements = document.querySelectorAll(
          '[data-testid*="message"], .message-bubble, .prose, [class*="response"], article'
        );
        if (messageElements.length > 0) {
          const lastEl = messageElements[messageElements.length - 1];
          return lastEl.innerText || '';
        }
        return '';
      });

      if (latestMessageText && latestMessageText === previousText && latestMessageText.length > 100) {
        stableCount++;
        // If content remained identical for 2 checks (4 seconds), generation has finished
        if (stableCount >= 2) {
          statusCallback('Response generation completed!');
          await page.close();
          if (browser && !config.chromeCdpUrl) await browser.close();
          return {
            success: true,
            rawText: latestMessageText,
            requiresManual: false
          };
        }
      } else {
        stableCount = 0;
        previousText = latestMessageText;
      }
    }

    // If text was gathered before timeout
    if (previousText && previousText.length > 80) {
      await page.close();
      if (browser && !config.chromeCdpUrl) await browser.close();
      return {
        success: true,
        rawText: previousText,
        requiresManual: false
      };
    }

    throw new Error('Grok response timed out or returned empty content.');

  } catch (err) {
    if (browser && !config.chromeCdpUrl) {
      try { await browser.close(); } catch (_) {}
    }
    return {
      success: false,
      error: err.message,
      requiresManual: true
    };
  }
}
