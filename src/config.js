import dotenv from 'dotenv';
dotenv.config();

export const config = {
  grokMode: process.env.GROK_MODE || 'auto', // 'auto' | 'manual'
  grokUrl: process.env.GROK_URL || 'https://grok.com',
  chromeCdpUrl: process.env.CHROME_CDP_URL || '',
  browserExecutablePath: process.env.BROWSER_EXECUTABLE_PATH || '',
  browserHeadless: String(process.env.BROWSER_HEADLESS || 'true').toLowerCase() === 'true',
  browserTimeoutMs: Number(process.env.BROWSER_TIMEOUT_MS || 45000),
  defaultTone: process.env.DEFAULT_TONE || 'Informative',
  defaultAudience: process.env.DEFAULT_AUDIENCE || 'General Public',
  maxTwitterChars: 280,
  appName: 'X_BOT',
  appVersion: '1.0.0'
};
