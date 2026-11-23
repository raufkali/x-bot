/**
 * Daily Multi-Topic India Trend Fetcher — X_BOT Engine
 *
 * Keeps the core focus 100% on India realities, downsides & everyday effects
 * while ensuring EVERY day and EVERY consecutive post covers a completely
 * NEW India topic across diverse categories (never stuck on a single topic).
 *
 * Source priority:
 *   1. Google Trends Daily RSS (geo=IN — real daily trending searches in India today)
 *   2. Fresh Daily Multi-Beat India RSS (hl=en-IN&gl=IN when:2d/3d across Jobs, Debt/Prices, Health/Food, Cities/Water/Air, Tech/Gig/Scams, Farms/Energy, Education)
 *   3. Daily AI-synthesized India paradoxes & trends excluding recently covered topics
 *   4. Verified Live India Data Angles (World Bank IND, Open-Meteo Live Air Quality, USD/INR FX) — interleaved, never starving live daily trends
 *   5. Multi-category evergreen India fallbacks (rotated & deduplicated)
 */

import https from 'https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { historyStore, normalizeText } from '../db/historyStore.js';
import {
  getLiveIndiaFactsSnapshot,
  buildDataDrivenDownsideTopics
} from '../integrations/indiaDataService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const CACHE_FILE = path.join(DATA_DIR, 'trends_cache.json');

// Cache refreshes automatically every 3 hours OR immediately on any new calendar day
const CACHE_TTL_HOURS = 3;

const CATEGORY_ORDER = [
  'INDIA_JOBS_YOUTH',
  'INDIA_ECONOMY_DEBT',
  'INDIA_HEALTH_FOOD',
  'INDIA_CITIES_AIR_WATER',
  'INDIA_TECH_SCAMS_GIG',
  'INDIA_FARM_ENERGY',
  'INDIA_EDUCATION_MIGRATION',
  'INDIA_DATA'
];

const CATEGORY_LABELS = {
  INDIA_JOBS_YOUTH: 'India Jobs & Youth',
  INDIA_ECONOMY_DEBT: 'India Debt & Prices',
  INDIA_HEALTH_FOOD: 'India Health & Food',
  INDIA_CITIES_AIR_WATER: 'India Cities, Air & Water',
  INDIA_TECH_SCAMS_GIG: 'India Tech, Apps & Gig',
  INDIA_FARM_ENERGY: 'India Farms & Energy',
  INDIA_EDUCATION_MIGRATION: 'India Exams & Brain Drain',
  INDIA_DATA: 'India Live Data',
  DAILY_TRENDS: 'India Daily Trend'
};

/* =========================================================
   DATE & CACHE HELPERS
========================================================= */

/**
 * Returns YYYY-MM-DD for the configured timezone (ensures daily cache rollover).
 */
export function getTodayDateKey(now = new Date(), timeZone = config.scheduleTimezone || 'Asia/Kolkata') {
  try {
    return new Date(now).toLocaleDateString('en-CA', { timeZone });
  } catch {
    return new Date(now).toISOString().slice(0, 10);
  }
}

/**
 * Cache is valid ONLY if fetched on today's calendar date AND younger than CACHE_TTL_HOURS.
 */
export function isCacheValidForToday(cache, now = new Date(), timeZone = config.scheduleTimezone || 'Asia/Kolkata') {
  if (!cache || !cache.fetchedAt || !cache.fetchedDate || !Array.isArray(cache.trends) || cache.trends.length === 0) {
    return false;
  }
  const todayKey = getTodayDateKey(now, timeZone);
  if (cache.fetchedDate !== todayKey) {
    return false;
  }
  const ageHours = (new Date(now).getTime() - new Date(cache.fetchedAt).getTime()) / 3_600_000;
  return Number.isFinite(ageHours) && ageHours >= 0 && ageHours <= CACHE_TTL_HOURS;
}

function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const cache = JSON.parse(raw);
    if (!isCacheValidForToday(cache)) return null;
    return cache;
  } catch {
    return null;
  }
}

function writeCache(trends) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const now = new Date();
    fs.writeFileSync(CACHE_FILE, JSON.stringify({
      fetchedAt: now.toISOString(),
      fetchedDate: getTodayDateKey(now),
      trends
    }, null, 2), 'utf8');
  } catch (e) {
    console.warn('[TrendFetcher] Cache write failed:', e.message);
  }
}

/* =========================================================
   HTTP HELPER
========================================================= */

async function fetchUrl(url, timeoutMs = 5500) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 X_BOT/1.0' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return await res.text();
}

/* =========================================================
   XML & CATEGORY HELPERS (PURE / TESTABLE)
========================================================= */

function decodeXmlEntities(str = '') {
  return String(str)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NOISE_AND_NEWS_CEREMONY_PATTERN = /\b(lottery|karunya|sambad|satta|matka|dream11|player props|betting odds|ipl score|live score|cricket score|match highlights|box office|horoscope|rashifal|panchang|admit card|exam result|answer key|weather today|gold rate today|petrol price today|bigg boss|bollywood|trailer release|inaugurat|flagged off|platinum jubilee|addresses rally|birthday wishes|wedding|76ers vs|bucks vs|lakers vs|celtics vs|knicks vs|warriors vs|nfl|nba|premier league|champions league|fantasy picks)\b/i;

export function classifyTrendCategory(title = '', context = '', defaultCategory = 'INDIA_ECONOMY_DEBT') {
  const combined = `${title} ${context}`.toLowerCase();
  if (/\b(loan apps?|digital scams?|upi fraud|delivery riders?|gig workers?|quick commerce|blinkit|zomato|swiggy|cyber|data centers?|software|ai layoffs?|it layoffs?)\b/.test(combined)) {
    return 'INDIA_TECH_SCAMS_GIG';
  }
  if (/\b(jobs?|hires?|hiring|layoffs?|workers?|careers?|resumes?|salary|salaries|wages?|unemploy|youth|graduates?)\b/.test(combined)) {
    return 'INDIA_JOBS_YOUTH';
  }
  if (/\b(coaching|kota|tuition|exams?|neet|jee|upsc|schools?|colleges?|brain drain|passports?|visas?|emigrat)\b/.test(combined)) {
    return 'INDIA_EDUCATION_MIGRATION';
  }
  if (/\b(hospitals?|health|medical|doctors?|medicines?|clinics?|nutrition|stunt|wards?|beds?|sick|bills?)\b/.test(combined)) {
    return 'INDIA_HEALTH_FOOD';
  }
  if (/\b(water|tankers?|air pollution|smog|pm2\.5|aqi|floods?|flooding|traffic|rent|rents|housing|metro|power cuts?|blackouts?)\b/.test(combined)) {
    return 'INDIA_CITIES_AIR_WATER';
  }
  if (/\b(farms?|farmers?|crops?|droughts?|grain|coal|electricity|solar|heatwaves?|stubble|groundwater|villages?)\b/.test(combined)) {
    return 'INDIA_FARM_ENERGY';
  }
  if (/\b(inflation|debt|tax|taxes|gst|interest|rupee|inr|banks?|credit|emi|prices?|cost of living|savings?|households?)\b/.test(combined)) {
    return 'INDIA_ECONOMY_DEBT';
  }
  return defaultCategory;
}

/**
 * Parses Google Trends Daily RSS (`https://trends.google.com/trending/rss?geo=IN`)
 */
export function parseGoogleTrendsRss(xml = '', geo = 'IN') {
  const trends = [];
  const items = String(xml).match(/<item>[\s\S]*?<\/item>/g) || [];

  for (const item of items.slice(0, 14)) {
    const rawTitle = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/))?.[1];
    if (!rawTitle) continue;
    const cleanTitle = decodeXmlEntities(rawTitle);
    if (cleanTitle.length < 4 || NOISE_AND_NEWS_CEREMONY_PATTERN.test(cleanTitle)) continue;

    const traffic = decodeXmlEntities((item.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/))?.[1] || '');
    const newsTitle = decodeXmlEntities((item.match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/))?.[1] || '');
    if (newsTitle && NOISE_AND_NEWS_CEREMONY_PATTERN.test(newsTitle)) continue;

    const contextParts = [
      `Trending in India today (${geo}${traffic ? `, ${traffic} searches` : ''})`,
      newsTitle ? `Angle: ${newsTitle}` : ''
    ].filter(Boolean);

    const category = classifyTrendCategory(cleanTitle, newsTitle, 'INDIA_ECONOMY_DEBT');
    const topicText = newsTitle && newsTitle.length >= 22 && newsTitle.length <= 120
      ? newsTitle
      : `${cleanTitle} in India: hidden cost on ordinary families`;

    trends.push({
      topic: topicText,
      context: contextParts.join('. ') + '. Focus on the hidden structural downside or everyday impact on ordinary Indians, not a stiff news summary.',
      source: `google_trends_${String(geo).toLowerCase()}`,
      category,
      isIndiaTopic: true
    });
  }

  return trends;
}

/**
 * Parses Google News India Search RSS for a given India daily category config.
 */
export function parseDailyCategoryRss(xml = '', categoryMeta = {}) {
  const trends = [];
  const items = String(xml).match(/<item>[\s\S]*?<\/item>/g) || [];
  const category = categoryMeta.category || 'INDIA_ECONOMY_DEBT';

  for (const item of items.slice(0, 10)) {
    const rawTitle = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/))?.[1];
    if (!rawTitle) continue;

    let cleanTitle = decodeXmlEntities(rawTitle);
    let publisher = '';
    const dashIdx = cleanTitle.lastIndexOf(' - ');
    if (dashIdx > 15) {
      publisher = cleanTitle.slice(dashIdx + 3).trim();
      cleanTitle = cleanTitle.slice(0, dashIdx).trim();
    }

    if (cleanTitle.length < 20 || NOISE_AND_NEWS_CEREMONY_PATTERN.test(cleanTitle)) {
      continue;
    }

    const resolvedCategory = classifyTrendCategory(cleanTitle, publisher, category);

    trends.push({
      topic: cleanTitle,
      context: `Live India daily trend${publisher ? ` (${publisher})` : ''}: ${cleanTitle}. Explain the surprising hidden cause and real effect on everyday Indians—never write like a news bulletin.`,
      source: categoryMeta.source || 'daily_rss_india',
      category: resolvedCategory,
      isIndiaTopic: true
    });
  }

  return trends;
}

/* =========================================================
   LIVE DAILY INDIA FETCHERS (MULTI-CATEGORY)
========================================================= */

const DAILY_CATEGORY_QUERIES = [
  {
    category: 'INDIA_JOBS_YOUTH',
    source: 'daily_rss_india_jobs',
    isIndiaTopic: true,
    hl: 'en-IN',
    gl: 'IN',
    ceid: 'IN:en',
    query: 'India (jobs OR layoffs OR unemployment OR "youth jobless" OR salary OR graduate) when:2d'
  },
  {
    category: 'INDIA_ECONOMY_DEBT',
    source: 'daily_rss_india_economy',
    isIndiaTopic: true,
    hl: 'en-IN',
    gl: 'IN',
    ceid: 'IN:en',
    query: 'India ("household debt" OR inflation OR GST OR tax OR "cost of living" OR rupee) when:2d'
  },
  {
    category: 'INDIA_HEALTH_FOOD',
    source: 'daily_rss_india_health',
    isIndiaTopic: true,
    hl: 'en-IN',
    gl: 'IN',
    ceid: 'IN:en',
    query: 'India ("hospital bills" OR healthcare OR "food prices" OR "child nutrition" OR medicines) when:3d'
  },
  {
    category: 'INDIA_CITIES_AIR_WATER',
    source: 'daily_rss_india_cities',
    isIndiaTopic: true,
    hl: 'en-IN',
    gl: 'IN',
    ceid: 'IN:en',
    query: 'India ("water crisis" OR "air pollution" OR smog OR flooding OR "traffic gridlock" OR rent) when:3d'
  },
  {
    category: 'INDIA_TECH_SCAMS_GIG',
    source: 'daily_rss_india_tech_gig',
    isIndiaTopic: true,
    hl: 'en-IN',
    gl: 'IN',
    ceid: 'IN:en',
    query: 'India ("loan apps" OR "digital scam" OR "gig workers" OR "delivery riders" OR "IT layoffs") when:3d'
  },
  {
    category: 'INDIA_EDUCATION_MIGRATION',
    source: 'daily_rss_india_education',
    isIndiaTopic: true,
    hl: 'en-IN',
    gl: 'IN',
    ceid: 'IN:en',
    query: 'India (farmers OR "crop loss" OR coaching OR "exam stress" OR "brain drain" OR passport) when:3d'
  }
];

async function fetchGoogleTrendsDaily() {
  try {
    const url = 'https://trends.google.com/trending/rss?geo=IN';
    const xml = await fetchUrl(url, 4500);
    return parseGoogleTrendsRss(xml, 'IN').slice(0, 6);
  } catch {
    return [];
  }
}

async function fetchDailyCategoryTrends() {
  const settled = await Promise.allSettled(
    DAILY_CATEGORY_QUERIES.map(async (meta) => {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(meta.query)}&hl=${meta.hl}&gl=${meta.gl}&ceid=${meta.ceid}`;
      const xml = await fetchUrl(url, 4500);
      return parseDailyCategoryRss(xml, meta).slice(0, 3);
    })
  );

  const collected = [];
  for (const r of settled) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      collected.push(...r.value);
    }
  }
  return collected;
}

/* =========================================================
   SOURCE 3 — DAILY AI INDIA TREND SYNTHESIS
========================================================= */

async function callCloudflareForTrends(prompt) {
  const cfToken = process.env.CLOUDFLARE_API_TOKEN || config.cloudflareApiToken;
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || config.cloudflareAccountId;
  const model = process.env.CLOUDFLARE_AI_MODEL || config.cloudflareAiModel || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  if (!cfToken || !cfAccountId) return null;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      messages: [
        { role: 'system', content: 'You research fresh, varied daily India reality trends and structural downsides across jobs, household debt, health, city water/air, gig workers, coaching/brain drain, and farming. Never repeat previously posted topics. Return only valid JSON.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 750,
      temperature: 0.75
    });
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${cfAccountId}/ai/run/${model}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const text = json?.result?.response || json?.result?.choices?.[0]?.message?.content || '';
          const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
          if (match) {
            resolve(JSON.parse(match[0]));
          } else {
            reject(new Error('No JSON in response'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('CF timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function callGeminiForTrends(prompt) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.75, maxOutputTokens: 750 }
    });
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
          if (match) {
            resolve(JSON.parse(match[0]));
          } else {
            reject(new Error('No JSON in Gemini response'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Gemini timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function fetchAITrends(excludeTopics = []) {
  const cfToken = process.env.CLOUDFLARE_API_TOKEN || config.cloudflareApiToken;
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || config.cloudflareAccountId;
  const geminiKey = process.env.GEMINI_API_KEY;
  if ((!cfToken || !cfAccountId) && !geminiKey) return [];

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const excludeList = Array.isArray(excludeTopics) && excludeTopics.length > 0
    ? excludeTopics.slice(-20).map(t => `- ${t}`).join('\n')
    : '- None yet';

  const prompt = `Today is ${dateStr}.

Give 7 BRAND-NEW, COMPLETELY DIFFERENT trending topics specifically about INDIA and ORDINARY INDIANS — one topic from EACH of these 7 different India sectors so every single post explores a brand new angle:
1. INDIA_JOBS_YOUTH (engineer jobless crisis, frozen entry IT pay, peon applications by PhDs/MBAs, contract work)
2. INDIA_ECONOMY_DEBT (household net savings falling, GST on daily goods, instant loan apps, federal debt interest, city rent squeeze)
3. INDIA_HEALTH_FOOD (private clinic bills, hospital bed scarcity, child nutrition vs food exports, counterfeit medicines)
4. INDIA_CITIES_AIR_WATER (tanker mafias, metro gridlock, urban monsoon flooding, winter smog shutting schools, summer grid blackouts)
5. INDIA_TECH_SCAMS_GIG (10-minute delivery riders after fuel/repairs, digital payment arrest scams, deepfake extortion)
6. INDIA_FARM_ENERGY (groundwater collapse under paddy fields, farm debt, village roads vs highway tolls, coal electricity lock-in)
7. INDIA_EDUCATION_MIGRATION (Kota coaching factory stress, paper leaks, wealthy & skilled Indians renouncing passports)

Rules:
- EVERY topic MUST be specifically about India or ordinary Indians.
- Spotlight a rarely-known structural paradox or real everyday consequence — NEVER generic obvious news headlines.
- NEVER repeat or overlap with any of these recently covered India topics:
${excludeList}

Return ONLY valid JSON:
{
  "trends": [
    {
      "topic": "Specific plain-English India topic headline",
      "category": "INDIA_JOBS_YOUTH | INDIA_ECONOMY_DEBT | INDIA_HEALTH_FOOD | INDIA_CITIES_AIR_WATER | INDIA_TECH_SCAMS_GIG | INDIA_FARM_ENERGY | INDIA_EDUCATION_MIGRATION",
      "isIndiaTopic": true,
      "context": "1-2 simple sentences explaining the hidden cause and real effect on ordinary Indians"
    }
  ]
}`;

  const normalizeAiList = (trends, source) => trends
    .filter(t => t && typeof t.topic === 'string' && t.topic.trim().length >= 12)
    .map(t => {
      const cat = CATEGORY_ORDER.includes(t.category)
        ? t.category
        : classifyTrendCategory(t.topic, t.context || '');
      return {
        topic: t.topic.trim(),
        context: String(t.context || '').trim(),
        source,
        category: cat,
        isIndiaTopic: true
      };
    });

  try {
    const result = await callCloudflareForTrends(prompt);
    if (result?.trends && Array.isArray(result.trends) && result.trends.length >= 2) {
      const normalized = normalizeAiList(result.trends, 'ai_cloudflare_india_daily');
      console.log(`[TrendFetcher] ✓ Cloudflare AI: synthesized ${normalized.length} fresh India topics`);
      return normalized;
    }
  } catch (e) {
    console.warn(`[TrendFetcher] Cloudflare AI daily India trends failed: ${e.message}`);
  }

  try {
    const result = await callGeminiForTrends(prompt);
    if (result?.trends && Array.isArray(result.trends) && result.trends.length >= 2) {
      const normalized = normalizeAiList(result.trends, 'ai_gemini_india_daily');
      console.log(`[TrendFetcher] ✓ Gemini: synthesized ${normalized.length} fresh India topics`);
      return normalized;
    }
  } catch (e) {
    console.warn(`[TrendFetcher] Gemini daily India trends failed: ${e.message}`);
  }

  return [];
}

/* =========================================================
   SOURCE 5 — DIVERSE MULTI-CATEGORY EVERGREEN INDIA FALLBACKS
========================================================= */

const EVERGREEN_FALLBACKS = [
  {
    topic: '10-minute delivery riders in India earn thin pay after bike repairs and fuel',
    context: 'App-based delivery workers race dangerous city traffic to cover fuel, EMI, and fines while platforms market instant convenience.',
    source: 'fallback_india_trend',
    category: 'INDIA_TECH_SCAMS_GIG',
    isIndiaTopic: true
  },
  {
    topic: 'India sends over 90% of its fresh water to crops while big cities buy tanker water',
    context: 'World Bank figures show 90.4% of fresh water goes to thirsty rice and sugar fields with free farm power, leaving under 10% for homes.',
    source: 'fallback_india_trend',
    category: 'INDIA_CITIES_AIR_WATER',
    isIndiaTopic: true
  },
  {
    topic: 'Instant phone loan apps trap young Indian earners in steep hidden debt',
    context: 'Quick digital loan apps charge crushing fees and hound late borrowers through phone contacts when paychecks run short.',
    source: 'fallback_india_trend',
    category: 'INDIA_ECONOMY_DEBT',
    isIndiaTopic: true
  },
  {
    topic: 'Millions of Indian students spend family savings inside crowded coaching factories',
    context: 'Parents mortgage property and pay steep coaching fees in hubs like Kota for tests where fewer than 1% win seats.',
    source: 'fallback_india_trend',
    category: 'INDIA_EDUCATION_MIGRATION',
    isIndiaTopic: true
  },
  {
    topic: 'Over 71% of Indian workers hold zero written contracts or sick pay safety',
    context: 'World Bank 2025 data puts 71.6% of workers in fragile jobs where one sickness or broken bike cuts off income overnight.',
    source: 'fallback_india_trend',
    category: 'INDIA_JOBS_YOUTH',
    isIndiaTopic: true
  },
  {
    topic: 'India has just 1.6 hospital beds per 1,000 people behind booming private clinic ads',
    context: 'Crowded public wards push ordinary Indian families to pay 43.9% of all medical costs directly from their own pockets.',
    source: 'fallback_india_trend',
    category: 'INDIA_HEALTH_FOOD',
    isIndiaTopic: true
  },
  {
    topic: 'Indian highway tolls keep jumping while village clinic and school roads stay unpaved',
    context: 'Massive cash pours into glossy expressways for car owners while rural towns still struggle with flooded dirt lanes.',
    source: 'fallback_india_trend',
    category: 'INDIA_FARM_ENERGY',
    isIndiaTopic: true
  },
  {
    topic: 'Over 34% of India federal tax cash vanishes paying only old debt interest',
    context: 'World Bank data shows one-third of central tax money goes straight to bond lenders before funding one school or clinic.',
    source: 'fallback_india_trend',
    category: 'INDIA_ECONOMY_DEBT',
    isIndiaTopic: true
  },
  {
    topic: 'Skilled Indians and wealthy families leave for foreign passports in record waves',
    context: 'Doctors, coders, and business owners move abroad seeking cleaner air, steady rules, and safer careers for their kids.',
    source: 'fallback_india_trend',
    category: 'INDIA_EDUCATION_MIGRATION',
    isIndiaTopic: true
  },
  {
    topic: 'Indian tech city rents doubled while entry IT starting salaries stayed frozen',
    context: 'Young engineers arriving in Bengaluru or Gurugram spend half their monthly pay on small flats and long traffic jams.',
    source: 'fallback_india_trend',
    category: 'INDIA_CITIES_AIR_WATER',
    isIndiaTopic: true
  },
  {
    topic: 'Over 35% of young Indian kids grow stunted while grain warehouses export harvests',
    context: 'Lack of daily protein and clean water leaves one in three young children under-nourished despite huge rice and wheat exports.',
    source: 'fallback_india_trend',
    category: 'INDIA_HEALTH_FOOD',
    isIndiaTopic: true
  },
  {
    topic: 'Coal still supplies 72% of India power while winter smoke shuts city schools',
    context: 'Coal plants and crop smoke push hazardous northern air up to 15 times safe limits every winter.',
    source: 'fallback_india_trend',
    category: 'INDIA_FARM_ENERGY',
    isIndiaTopic: true
  }
];

/* =========================================================
   DIVERSITY, INTERLEAVING & SELECTION LOGIC (PURE)
========================================================= */

function significantWords(text = '') {
  return normalizeText(text)
    .split(/\s+/)
    .filter(w => w.length >= 4 && w !== 'india' && w !== 'indian' && w !== 'indians');
}

function topicsOverlap(topicA = '', topicB = '') {
  const normA = normalizeText(topicA);
  const normB = normalizeText(topicB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.slice(0, 42) === normB.slice(0, 42)) return true;

  const wordsA = significantWords(normA);
  const wordsBSet = new Set(significantWords(normB));
  if (wordsA.length === 0 || wordsBSet.size === 0) return false;

  const overlapCount = wordsA.filter(w => wordsBSet.has(w)).length;
  const minLen = Math.min(wordsA.length, wordsBSet.size);
  return overlapCount >= Math.max(2, Math.ceil(minLen * 0.5));
}

/**
 * Deduplicates and round-robin interleaves India trends across categories so
 * consecutive posts always pick genuinely new India topics across fresh sectors.
 */
export function interleaveTrendsByCategory(rawTrends = [], options = {}) {
  const maxItems = Number(options.maxItems) || 24;
  const daySeed = Number.isFinite(options.daySeed)
    ? options.daySeed
    : Math.floor(Date.now() / 86_400_000);

  const deduped = [];
  for (const raw of rawTrends) {
    if (!raw || typeof raw.topic !== 'string' || raw.topic.trim().length < 10) continue;
    const topic = raw.topic.trim();
    if (deduped.some(existing => topicsOverlap(existing.topic, topic))) {
      continue;
    }
    const category = raw.category || classifyTrendCategory(topic, raw.context || '');

    deduped.push({
      ...raw,
      topic,
      category,
      isIndiaTopic: true
    });
  }

  const buckets = new Map();
  for (const item of deduped) {
    const key = item.category || 'INDIA_ECONOMY_DEBT';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }

  const baseOrder = [...CATEGORY_ORDER, ...Array.from(buckets.keys()).filter(k => !CATEGORY_ORDER.includes(k))];
  const liveOrder = baseOrder.filter(k => buckets.has(k));
  if (liveOrder.length === 0) return [];

  const rot = daySeed % liveOrder.length;
  const rotatedKeys = [...liveOrder.slice(rot), ...liveOrder.slice(0, rot)];

  // Live daily India news/trends always interleave ahead of slower static INDIA_DATA
  const orderedKeys = [
    ...rotatedKeys.filter(k => k !== 'INDIA_DATA'),
    ...rotatedKeys.filter(k => k === 'INDIA_DATA')
  ];

  const interleaved = [];
  let added = true;
  while (added && interleaved.length < maxItems) {
    added = false;
    for (const k of orderedKeys) {
      const list = buckets.get(k);
      if (list && list.length > 0) {
        interleaved.push(list.shift());
        added = true;
        if (interleaved.length >= maxItems) break;
      }
    }
  }

  return interleaved;
}

/**
 * Pure selector picking ONE genuinely unused India trending topic while actively
 * rotating away from recent topics, seed topics, and recently posted categories.
 */
export function selectBestUnusedTrend(trends = [], usedTopics = [], options = {}) {
  const avoidTopics = Array.isArray(options.avoidTopics) ? options.avoidTopics : [];
  const recentCategories = Array.isArray(options.recentCategories) ? options.recentCategories : [];
  const checkHistoryStore = options.checkHistoryStore !== false;
  const rotationOffset = Number(options.rotationOffset) || 0;

  const combinedUsed = Array.from(new Set([
    ...usedTopics,
    ...avoidTopics
  ].filter(Boolean)));

  const isTopicUsed = (candidateTopic) => {
    if (!candidateTopic) return true;
    if (checkHistoryStore && historyStore.hasSeenTopic(candidateTopic)) return true;
    return combinedUsed.some(u => topicsOverlap(candidateTopic, u));
  };

  const candidates = trends.filter(t => t && t.topic && !isTopicUsed(t.topic));

  if (candidates.length > 0) {
    const lastCat = recentCategories[0] || '';
    const recentTwoCats = new Set(recentCategories.slice(0, 2));

    const freshDifferentCategoryLive = candidates.find(t =>
      !String(t.source || '').startsWith('fallback_') &&
      t.category !== 'INDIA_DATA' &&
      !recentTwoCats.has(t.category)
    );
    if (freshDifferentCategoryLive) return freshDifferentCategoryLive;

    const freshDifferentCategory = candidates.find(t =>
      !recentTwoCats.has(t.category)
    );
    if (freshDifferentCategory) return freshDifferentCategory;

    const notLastCategory = candidates.find(t => t.category !== lastCat);
    if (notLastCategory) return notLastCategory;

    return candidates[0];
  }

  const nonAvoided = trends.filter(t => t && t.topic && !avoidTopics.some(a => topicsOverlap(t.topic, a)));
  if (nonAvoided.length > 0) {
    return nonAvoided[rotationOffset % nonAvoided.length];
  }

  return trends[rotationOffset % Math.max(1, trends.length)] || null;
}

/* =========================================================
   MAIN EXPORTS — getTrendingTopics & pickUnusedTrendingTopic
========================================================= */

/**
 * Returns a fresh, diverse array of today's India trending topics interleaved across categories.
 */
export async function getTrendingTopics(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = readCache();
    if (cached) {
      console.log(`[TrendFetcher] Using today's cached India trends (${cached.trends.length} topics, date ${cached.fetchedDate})`);
      return cached.trends;
    }
  }

  console.log('[TrendFetcher] Fetching fresh daily India trends across live sources...');
  const recentUsed = historyStore.getRecentSeedTopics(25);

  const [googleTrendsRes, dailyRssRes, aiTrendsRes, indiaSnapshotRes] = await Promise.allSettled([
    fetchGoogleTrendsDaily(),
    fetchDailyCategoryTrends(),
    fetchAITrends(recentUsed),
    getLiveIndiaFactsSnapshot(forceRefresh)
  ]);

  const liveTrends = [];
  if (googleTrendsRes.status === 'fulfilled' && Array.isArray(googleTrendsRes.value)) {
    liveTrends.push(...googleTrendsRes.value);
  }
  if (dailyRssRes.status === 'fulfilled' && Array.isArray(dailyRssRes.value)) {
    liveTrends.push(...dailyRssRes.value);
  }
  if (aiTrendsRes.status === 'fulfilled' && Array.isArray(aiTrendsRes.value)) {
    liveTrends.push(...aiTrendsRes.value);
  }

  const macroDataTrends = [];
  if (indiaSnapshotRes.status === 'fulfilled' && indiaSnapshotRes.value) {
    try {
      const dataTopics = buildDataDrivenDownsideTopics(indiaSnapshotRes.value);
      macroDataTrends.push(...dataTopics);
    } catch (e) {
      console.warn(`[TrendFetcher] India data topic warning: ${e.message}`);
    }
  }

  const combined = [
    ...liveTrends,
    ...macroDataTrends,
    ...EVERGREEN_FALLBACKS
  ];

  const final = interleaveTrendsByCategory(combined, { maxItems: 24 });

  if (final.length > 0) {
    writeCache(final);
    console.log(`[TrendFetcher] ✓ Prepared ${final.length} diverse India topics (${liveTrends.length} live signals)`);
  }

  return final.length > 0 ? final : EVERGREEN_FALLBACKS.slice(0, 8);
}

/**
 * Picks ONE unused India trending topic from today's list, rotating categories and
 * auto-refreshing if all cached topics have been used.
 */
export async function pickUnusedTrendingTopic(usedTopics = [], forceRefresh = false, options = {}) {
  const trends = await getTrendingTopics(forceRefresh);
  const recentSeedHistory = historyStore.getRecentSeedTopics(40);
  const recentCategories = Array.isArray(options.recentCategories)
    ? options.recentCategories
    : historyStore.getRecentCategories(3);
  const avoidTopics = Array.isArray(options.avoidTopics) ? options.avoidTopics : [];

  const allUsed = Array.from(new Set([
    ...usedTopics,
    ...recentSeedHistory
  ]));

  const hasUnusedInList = trends.some(t =>
    t && t.topic &&
    !historyStore.hasSeenTopic(t.topic) &&
    !allUsed.some(u => topicsOverlap(t.topic, u)) &&
    !avoidTopics.some(a => topicsOverlap(t.topic, a))
  );

  if (!hasUnusedInList && !forceRefresh) {
    console.log('[TrendFetcher] All cached India trends have been covered. Refreshing fresh India topics...');
    return pickUnusedTrendingTopic(usedTopics, true, options);
  }

  const selected = selectBestUnusedTrend(
    [...trends, ...EVERGREEN_FALLBACKS],
    allUsed,
    {
      avoidTopics,
      recentCategories,
      rotationOffset: historyStore.posts.length + (Number(options.attempt) || 0)
    }
  );

  const chosen = selected || EVERGREEN_FALLBACKS[historyStore.posts.length % EVERGREEN_FALLBACKS.length];
  console.log(`[TrendFetcher] Selected India trend [${chosen.category || 'INDIA_ECONOMY_DEBT'}]: "${chosen.topic}" (source: ${chosen.source})`);
  return chosen;
}

/**
 * Formats today's diverse India trending topics as a WhatsApp-friendly list string.
 */
export function formatTrendsForWhatsApp(trends) {
  if (!trends || trends.length === 0) return '⚠️ No trending topics available right now.';
  const lines = [`📈 *Today's India Trending Topics — Fresh Mix*\n`];
  trends.slice(0, 8).forEach((t, i) => {
    const label = CATEGORY_LABELS[t.category] || 'India Trend';
    lines.push(`*${i + 1}. [${label}]* ${t.topic}`);
    if (t.context) lines.push(`   _${t.context.slice(0, 100)}${t.context.length > 100 ? '...' : ''}_`);
    lines.push('');
  });
  lines.push(`_Reply *1* to generate a post or *3* for a custom topic._`);
  return lines.join('\n');
}

/* =========================================================
   CUSTOM TOPIC LIVE TREND SIGNALS (GLOBAL / TOPIC-SPECIFIC)
========================================================= */

const INDIA_OR_PAKISTAN_NOISE_REGEX = /\b(india|indian|indians|pakistan|pakistani|pakistanis)\b/i;

export async function fetchCustomTopicTrends(topic = '', options = {}) {
  const cleanTopic = String(topic || '').replace(/\s+/g, ' ').trim();
  if (!cleanTopic) return [];

  const excludeRegionalNoise = options.excludeRegionalNoise !== false && !INDIA_OR_PAKISTAN_NOISE_REGEX.test(cleanTopic);
  const timeoutMs = Number(options.timeoutMs) || 4500;

  try {
    const query = `${cleanTopic} trends OR bottleneck OR shift OR paradox when:14d`;
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const xml = await fetchUrl(url, timeoutMs);
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    const results = [];
    const seen = new Set();

    for (const item of items.slice(0, 14)) {
      const rawTitle = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/))?.[1];
      if (!rawTitle) continue;

      let cleanTitle = decodeXmlEntities(rawTitle);
      let publisher = '';
      const dashIdx = cleanTitle.lastIndexOf(' - ');
      if (dashIdx > 15) {
        publisher = cleanTitle.slice(dashIdx + 3).trim();
        cleanTitle = cleanTitle.slice(0, dashIdx).trim();
      }

      if (cleanTitle.length < 18) continue;
      if (NOISE_AND_NEWS_CEREMONY_PATTERN.test(cleanTitle)) continue;
      if (excludeRegionalNoise && INDIA_OR_PAKISTAN_NOISE_REGEX.test(cleanTitle)) continue;

      const dedupKey = cleanTitle.toLowerCase().slice(0, 48);
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      results.push({
        title: cleanTitle,
        publisher,
        source: 'custom_topic_live_rss'
      });

      if (results.length >= 5) break;
    }

    return results;
  } catch (err) {
    console.warn(`[TrendFetcher] Custom topic live trend lookup skipped (${cleanTopic}): ${err.message}`);
    return [];
  }
}

export function formatCustomTrendsBrief(topic = '', items = []) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const cleanTopic = String(topic || '').trim();
  const lines = items.slice(0, 5).map(it => `- ${it.title}${it.publisher ? ` (${it.publisher})` : ''}`);
  return `LIVE TRENDS RIGHT NOW AROUND "${cleanTopic}":\n${lines.join('\n')}`;
}
