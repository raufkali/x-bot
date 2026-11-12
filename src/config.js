import dns from 'node:dns';
import fs from 'node:fs';
import dotenv from 'dotenv';

// Ensure Node network fetches prioritize IPv4 on systems without IPv6 routing
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  // Ignore on older runtimes where not supported
}

// Load standard .env first, then .env.add1 if it exists
dotenv.config();
if (fs.existsSync('.env.add1')) {
  dotenv.config({ path: '.env.add1', override: false });
}

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
  whatsappAppId: process.env.WHATSAPP_APP_ID || '1538340228340646',
  whatsappToken: process.env.WHATSAPP_TOKEN || '',
  whatsappPhoneNumberId: (process.env.WHATSAPP_PHONE_NUMBER_ID === '1395242077013903' ? '1412689751934980' : process.env.WHATSAPP_PHONE_NUMBER_ID) || '1412689751934980',
  whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
  ownerPhoneNumber: process.env.OWNER_PHONE_NUMBER || '', // E.164 format without + (e.g. 923435022880)
  webhookVerifyToken: process.env.WEBHOOK_VERIFY_TOKEN || 'xbot_verify_token_2026',
  serverPort: Number(process.env.PORT || 3000),
  graphApiVersion: process.env.GRAPH_API_VERSION || 'v25.0',
  whatsappTemplateName: process.env.WHATSAPP_TEMPLATE_NAME || '3p_direct_integration_test_template',
  whatsappTemplateLang: process.env.WHATSAPP_TEMPLATE_LANG || 'en_US',

  // Automated Post Scheduling Settings (9:00 AM, 2:00 PM, 8:00 PM)
  scheduleTime: process.env.POST_SCHEDULE_TIME || process.env.DAILY_POST_TIME || '09:00', // Primary / fallback HH:MM
  scheduleTimes: process.env.POST_SCHEDULE_TIMES
    ? process.env.POST_SCHEDULE_TIMES.split(',').map(s => s.trim())
    : ['09:00', '14:00', '20:00'],
  scheduleTimezone: process.env.SCHEDULE_TIMEZONE || 'Asia/Karachi',
  scheduleEnabled: String(process.env.SCHEDULE_ENABLED || 'true').toLowerCase() === 'true',

  // MongoDB Atlas Database (Set via MONGODB_URI in .env or Render dashboard)
  mongoUri: process.env.MONGODB_URI || '',

  // Content Generation Profile
  englishLevel: 'A2',
  contentThemes: 'Geopolitics, Global Power Shifts, Future Forecastings 2035, AI Technology, Economics & Strategic Resources, Global Political Documentary'
};
