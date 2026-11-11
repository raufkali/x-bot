import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Grok / Groq AI Settings
  grokMode: process.env.GROK_MODE || 'auto',
  grokUrl: process.env.GROK_URL || 'https://grok.com',
  chromeCdpUrl: process.env.CHROME_CDP_URL || '',
  browserExecutablePath: process.env.BROWSER_EXECUTABLE_PATH || '',
  browserHeadless: String(process.env.BROWSER_HEADLESS || 'true').toLowerCase() === 'true',
  browserTimeoutMs: Number(process.env.BROWSER_TIMEOUT_MS || 45000),
  defaultTone: process.env.DEFAULT_TONE || 'Informative',
  defaultAudience: process.env.DEFAULT_AUDIENCE || 'General Public',
  maxTwitterChars: 280,
  appName: 'X_BOT',
  appVersion: '1.0.0',

  // Meta WhatsApp Cloud API Settings
  whatsappToken: process.env.WHATSAPP_TOKEN || '',
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
  ownerPhoneNumber: process.env.OWNER_PHONE_NUMBER || '', // E.164 format without + (e.g. 923001234567)
  webhookVerifyToken: process.env.WEBHOOK_VERIFY_TOKEN || 'xbot_verify_token_2026',
  serverPort: Number(process.env.PORT || 3000),
  graphApiVersion: process.env.GRAPH_API_VERSION || 'v21.0'
};
