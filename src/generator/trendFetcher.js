/**
 * Daily Multi-Source Trend Fetcher — X_BOT Daily Trends Engine
 *
 * Researches fresh, diverse trending topics every day across multiple categories
 * so consecutive posts never hammer a single topic or static list.
 *
 * Source priority:
 *   1. Google Trends Daily RSS (geo=US & geo=IN, real daily trending searches)
 *   2. Fresh Daily Multi-Category RSS (when:2d across Tech/AI, Economy, Work, Climate/Energy, Health, World, India)
 *   3. Daily AI-synthesized trends excluding recently posted topics (Cloudflare Llama 3.3 70B → Gemini)
 *   4. Verified Live Data Angles (World Bank IND, Open-Meteo Live Air Quality, USD/INR FX) — interleaved, never starving live trends
 *   5. Multi-category evergreen fallbacks (rotated & deduplicated)
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
  'TECH_AI',
  'ECONOMY_MARKETS',
  'WORK_CAREERS',
  'CLIMATE_ENERGY',
  'HEALTH_SOCIETY',
  'WORLD_GEOPOLITICS',
  'INDIA_REALITY',
  'INDIA_DATA'
];

const CATEGORY_LABELS = {
  TECH_AI: 'Tech & AI',
  ECONOMY_MARKETS: 'Economy & Money',
  WORK_CAREERS: 'Jobs & Work',
  CLIMATE_ENERGY: 'Energy & Climate',
  HEALTH_SOCIETY: 'Health & Life',
  WORLD_GEOPOLITICS: 'Global Shifts',
  INDIA_REALITY: 'India Reality',
  INDIA_DATA: 'India Data',
  DAILY_TRENDS: 'Daily Trend'
};

/* =========================================================
   DATE & CACHE HELPERS
========================================================= */

/**
 * Returns YYYY-MM-DD for the configured timezone (ensures daily cache rollover).
 */
export function getTodayDateKey(now = new Date(), timeZone = config.scheduleTimezone || 'UTC') {
  try {
    return new Date(now).toLocaleDateString('en-CA', { timeZone });
  } catch {
    return new Date(now).toISOString().slice(0, 10);
  }
}

/**
 * Cache is valid ONLY if fetched on today's calendar date AND younger than CACHE_TTL_HOURS.
 */
export function isCacheValidForToday(cache, now = new Date(), timeZone = config.scheduleTimezone || 'UTC') {
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

const INDIA_MENTION_PATTERN = /\b(india|indian|indians|delhi|mumbai|kolkata|bengaluru|bangalore|rupee|rbi|bharti)\b/i;

export function classifyTrendCategory(title = '', context = '', defaultCategory = 'DAILY_TRENDS') {
  const combined = `${title} ${context}`.toLowerCase();
  if (/\b(ai|artificial intelligence|llm|openai|chatgpt|claude|gemini|chip|chips|semiconductor|nvidia|robot|software|cyber|cloud|model collapse|gpu|data center)\b/.test(combined)) {
    return 'TECH_AI';
  }
  if (/\b(job|jobs|hire|hiring|layoff|layoffs|worker|workers|career|resume|remote work|gig|salary|wage|unemploy)\b/.test(combined)) {
    return 'WORK_CAREERS';
  }
  if (/\b(solar|coal|power grid|electricity|water|tanker|drought|climate|smog|pm2\.5|air quality|battery|ev|oil|energy|transformer)\b/.test(combined)) {
    return 'CLIMATE_ENERGY';
  }
  if (/\b(hospital|health|medical|doctor|medicine|clinic|nutrition|stunt|biotech|vaccine|sleep|mental)\b/.test(combined)) {
    return 'HEALTH_SOCIETY';
  }
  if (/\b(inflation|debt|tax|interest rate|fed|central bank|rupee|dollar|tariff|bond|bank|credit|gdp|rent|grocery|housing|cost of living)\b/.test(combined)) {
    return 'ECONOMY_MARKETS';
  }
  if (/\b(shipping|red sea|strait|taiwan|minerals|trade war|supply chain|sanction|border|port|china|europe)\b/.test(combined)) {
    return 'WORLD_GEOPOLITICS';
  }
  if (INDIA_MENTION_PATTERN.test(combined)) {
    return 'INDIA_REALITY';
  }
  return defaultCategory;
}

/**
 * Parses Google Trends Daily RSS (`https://trends.google.com/trending/rss?geo=...`)
 */
export function parseGoogleTrendsRss(xml = '', geo = 'US') {
  const trends = [];
  const items = String(xml).match(/<item>[\s\S]*?<\/item>/g) || [];
  const isIndiaGeo = String(geo).toUpperCase() === 'IN';

  for (const item of items.slice(0, 12)) {
    const rawTitle = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/))?.[1];
    if (!rawTitle) continue;
    const cleanTitle = decodeXmlEntities(rawTitle);
    if (cleanTitle.length < 4 || NOISE_AND_NEWS_CEREMONY_PATTERN.test(cleanTitle)) continue;

    const traffic = decodeXmlEntities((item.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/))?.[1] || '');
    const newsTitle = decodeXmlEntities((item.match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/))?.[1] || '');
    if (newsTitle && NOISE_AND_NEWS_CEREMONY_PATTERN.test(newsTitle)) continue;

    const isIndiaTopic = isIndiaGeo || INDIA_MENTION_PATTERN.test(`${cleanTitle} ${newsTitle}`);
    const contextParts = [
      `Trending today (${geo}${traffic ? `, ${traffic} searches` : ''})`,
      newsTitle ? `Angle: ${newsTitle}` : ''
    ].filter(Boolean);

    const category = classifyTrendCategory(cleanTitle, newsTitle, isIndiaTopic ? 'INDIA_REALITY' : 'DAILY_TRENDS');
    const topicText = newsTitle && newsTitle.length >= 22 && newsTitle.length <= 115
      ? newsTitle
      : `${cleanTitle}: why this daily trend matters right now`;

    trends.push({
      topic: topicText,
      context: contextParts.join('. ') + '. Focus on the hidden second-order mechanism or real everyday impact, not a stiff news summary.',
      source: `google_trends_${String(geo).toLowerCase()}`,
      category,
      isIndiaTopic
    });
  }

  return trends;
}

/**
 * Parses Google News Search RSS for a given daily category config.
 */
export function parseDailyCategoryRss(xml = '', categoryMeta = {}) {
  const trends = [];
  const items = String(xml).match(/<item>[\s\S]*?<\/item>/g) || [];
  const category = categoryMeta.category || 'DAILY_TRENDS';
  const defaultIndia = Boolean(categoryMeta.isIndiaTopic);

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

    const isIndiaTopic = defaultIndia || INDIA_MENTION_PATTERN.test(cleanTitle);
    const resolvedCategory = classifyTrendCategory(cleanTitle, publisher, category);

    trends.push({
      topic: cleanTitle,
      context: `Live daily trend${publisher ? ` (${publisher})` : ''}: ${cleanTitle}. Explain the surprising hidden cause or everyday consequence—never write like a news bulletin.`,
      source: categoryMeta.source || 'daily_rss_trend',
      category: resolvedCategory,
      isIndiaTopic
    });
  }

  return trends;
}

/* =========================================================
   LIVE DAILY FETCHERS
========================================================= */

const DAILY_CATEGORY_QUERIES = [
  {
    category: 'TECH_AI',
    source: 'daily_rss_tech_ai',
    isIndiaTopic: false,
    hl: 'en-US',
    gl: 'US',
    ceid: 'US:en',
    query: '(AI OR semiconductors OR cybersecurity OR cloud OR automation) (shift OR bottleneck OR cost OR breakthrough) when:2d'
  },
  {
    category: 'ECONOMY_MARKETS',
    source: 'daily_rss_economy',
    isIndiaTopic: false,
    hl: 'en-US',
    gl: 'US',
    ceid: 'US:en',
    query: '(inflation OR "cost of living" OR debt OR "interest rates" OR housing OR tariffs) impact when:2d'
  },
  {
    category: 'WORK_CAREERS',
    source: 'daily_rss_work',
    isIndiaTopic: false,
    hl: 'en-US',
    gl: 'US',
    ceid: 'US:en',
    query: '(layoffs OR hiring OR "job market" OR "remote work" OR "entry level" OR skills) trend when:3d'
  },
  {
    category: 'CLIMATE_ENERGY',
    source: 'daily_rss_energy',
    isIndiaTopic: false,
    hl: 'en-US',
    gl: 'US',
    ceid: 'US:en',
    query: '("power grid" OR electricity OR solar OR water crisis OR "data center power") when:3d'
  },
  {
    category: 'HEALTH_SOCIETY',
    source: 'daily_rss_health',
    isIndiaTopic: false,
    hl: 'en-US',
    gl: 'US',
    ceid: 'US:en',
    query: '("healthcare costs" OR "medical bills" OR food prices OR nutrition OR burnout) when:3d'
  },
  {
    category: 'INDIA_REALITY',
    source: 'india_issue_signal',
    isIndiaTopic: true,
    hl: 'en-IN',
    gl: 'IN',
    ceid: 'IN:en',
    query: 'India (jobs OR "household debt" OR "air pollution" OR "water crisis" OR "medical bills" OR rupee) when:3d'
  }
];

async function fetchGoogleTrendsDaily() {
  const geos = ['US', 'IN'];
  const settled = await Promise.allSettled(
    geos.map(async (geo) => {
      const url = `https://trends.google.com/trending/rss?geo=${geo}`;
      const xml = await fetchUrl(url, 4500);
      return parseGoogleTrendsRss(xml, geo);
    })
  );

  const combined = [];
  for (const r of settled) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      combined.push(...r.value.slice(0, 4));
    }
  }
  return combined;
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
   SOURCE 3 — DAILY AI TREND SYNTHESIS (NEVER DEAD CODE)
========================================================= */

async function callCloudflareForTrends(prompt) {
  const cfToken = process.env.CLOUDFLARE_API_TOKEN || config.cloudflareApiToken;
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || config.cloudflareAccountId;
  const model = process.env.CLOUDFLARE_AI_MODEL || config.cloudflareAiModel || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  if (!cfToken || !cfAccountId) return null;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      messages: [
        { role: 'system', content: 'You surface fresh, varied daily trends across AI/Tech, Economy, Jobs, Energy/Climate, Health, World Shifts, and India. Never repeat old themes. Return only valid JSON.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 700,
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
      generationConfig: { temperature: 0.75, maxOutputTokens: 700 }
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
    ? excludeTopics.slice(-15).map(t => `- ${t}`).join('\n')
    : '- None yet';

  const prompt = `Today is ${dateStr}.

Give 8 BRAND-NEW, DIVERSE trending discussion topics for X right now — ONE topic from EACH of these 8 different domains so every post covers a completely different trend:
1. TECH_AI (hidden AI economics, chips, coding tools, agent reliability, energy demands)
2. ECONOMY_MARKETS (inflation, household debt, currency pressure, housing, credit traps)
3. WORK_CAREERS (ghost jobs, AI hiring filters, skill gaps, gig pay)
4. CLIMATE_ENERGY (grid bottlenecks, water stress, heat impact, clean energy shifts)
5. HEALTH_SOCIETY (medical bills, ultra-processed food, sleep/attention loss, medicine access)
6. WORLD_GEOPOLITICS (shipping routes, mineral supply chains, tariffs, global manufacturing shifts)
7. INDIA_REALITY (surprising structural truth affecting everyday families, jobs, or cities in India)
8. TECH_AI or ECONOMY_MARKETS (a fresh surprising 2025-2026 paradox)

Rules:
- NEVER write generic surface chatter ("prices are high", "AI is growing fast").
- Every topic must spotlight a surprising, counter-intuitive mechanism or real-world consequence.
- DO NOT repeat or overlap with any of these recently covered topics:
${excludeList}

Return ONLY valid JSON:
{
  "trends": [
    {
      "topic": "Specific, plain-English surprising trend headline",
      "category": "TECH_AI | ECONOMY_MARKETS | WORK_CAREERS | CLIMATE_ENERGY | HEALTH_SOCIETY | WORLD_GEOPOLITICS | INDIA_REALITY",
      "isIndiaTopic": false,
      "context": "1-2 simple sentences on the hidden cause and real everyday impact"
    }
  ]
}`;

  const normalizeAiList = (trends, source) => trends
    .filter(t => t && typeof t.topic === 'string' && t.topic.trim().length >= 12)
    .map(t => {
      const cat = CATEGORY_ORDER.includes(t.category)
        ? t.category
        : classifyTrendCategory(t.topic, t.context || '');
      const isIndiaTopic = typeof t.isIndiaTopic === 'boolean'
        ? t.isIndiaTopic
        : (cat === 'INDIA_REALITY' || INDIA_MENTION_PATTERN.test(t.topic));
      return {
        topic: t.topic.trim(),
        context: String(t.context || '').trim(),
        source,
        category: cat,
        isIndiaTopic
      };
    });

  try {
    const result = await callCloudflareForTrends(prompt);
    if (result?.trends && Array.isArray(result.trends) && result.trends.length >= 2) {
      const normalized = normalizeAiList(result.trends, 'ai_cloudflare_daily_trends');
      console.log(`[TrendFetcher] ✓ Cloudflare AI: synthesized ${normalized.length} diverse daily trends`);
      return normalized;
    }
  } catch (e) {
    console.warn(`[TrendFetcher] Cloudflare AI daily trends failed: ${e.message}`);
  }

  try {
    const result = await callGeminiForTrends(prompt);
    if (result?.trends && Array.isArray(result.trends) && result.trends.length >= 2) {
      const normalized = normalizeAiList(result.trends, 'ai_gemini_daily_trends');
      console.log(`[TrendFetcher] ✓ Gemini: synthesized ${normalized.length} diverse daily trends`);
      return normalized;
    }
  } catch (e) {
    console.warn(`[TrendFetcher] Gemini daily trends failed: ${e.message}`);
  }

  return [];
}

/* =========================================================
   SOURCE 5 — DIVERSE MULTI-CATEGORY EVERGREEN FALLBACKS
========================================================= */

const EVERGREEN_FALLBACKS = [
  {
    topic: 'Four-year power transformer waits are slowing AI data centers faster than chip shortages',
    context: 'Heavy AI reasoning uses far more power per answer, and giant electrical transformers now face multi-year grid wait lists.',
    source: 'fallback_daily_trend',
    category: 'TECH_AI',
    isIndiaTopic: false
  },
  {
    topic: 'Global shipping detours around Africa quietly add weeks and fuel costs to everyday groceries',
    context: 'When narrow sea lanes face disruption, container ships reroute thousands of miles and pass freight bills down to shoppers.',
    source: 'fallback_daily_trend',
    category: 'WORLD_GEOPOLITICS',
    isIndiaTopic: false
  },
  {
    topic: 'Ghost job ads and AI resume bots broke online hiring for ordinary applicants',
    context: 'Firms leave empty listings up to signal growth while applicants mass-apply with bots, leaving 95% of resumes unread.',
    source: 'fallback_daily_trend',
    category: 'WORK_CAREERS',
    isIndiaTopic: false
  },
  {
    topic: 'India sends over 90% of its fresh water to crops while big cities buy tanker water',
    context: 'World Bank figures show 90.4% of fresh water goes to thirsty rice and sugar fields with free farm power, leaving under 10% for homes.',
    source: 'fallback_india_downside',
    category: 'INDIA_REALITY',
    isIndiaTopic: true
  },
  {
    topic: 'Stablecoin issuers now hold more US government debt bills than many mid-sized nations',
    context: 'Digital dollar backing one-for-one pushes crypto firms into tens of billions of short-term Treasury debt.',
    source: 'fallback_daily_trend',
    category: 'ECONOMY_MARKETS',
    isIndiaTopic: false
  },
  {
    topic: 'Over 34% of India federal tax cash vanishes paying only old debt interest',
    context: 'World Bank data shows one-third of central tax money goes straight to bond lenders before funding one school or clinic.',
    source: 'fallback_india_downside',
    category: 'INDIA_REALITY',
    isIndiaTopic: true
  },
  {
    topic: 'Modern feeds ignore follower counts and test every single post cold in the first hour',
    context: 'Algorithms judge watch time and replies from tiny random test groups rather than pushing uploads to subscribers.',
    source: 'fallback_daily_trend',
    category: 'TECH_AI',
    isIndiaTopic: false
  },
  {
    topic: 'Over 71% of Indian workers hold zero written contracts or sick pay safety',
    context: 'World Bank 2025 data puts 71.6% of workers in fragile jobs where one sickness or broken bike cuts off income overnight.',
    source: 'fallback_india_downside',
    category: 'INDIA_REALITY',
    isIndiaTopic: true
  },
  {
    topic: 'Rare earth mineral refining relies overwhelmingly on one country despite EV battery booms',
    context: 'Electric motors and clean power gear depend on minerals cleaned in concentrated overseas refineries.',
    source: 'fallback_daily_trend',
    category: 'CLIMATE_ENERGY',
    isIndiaTopic: false
  },
  {
    topic: 'Over 35% of young Indian kids grow stunted while grain warehouses export record harvests',
    context: 'Lack of daily protein and clean water leaves one in three young children under-nourished despite huge rice and wheat exports.',
    source: 'fallback_india_downside',
    category: 'HEALTH_SOCIETY',
    isIndiaTopic: true
  },
  {
    topic: 'AI models trained on AI-generated web text lose rare facts through model collapse',
    context: 'Recycling synthetic web text flattens sharp ideas into dull averages, making pre-2022 human writing rare priceless fuel.',
    source: 'fallback_daily_trend',
    category: 'TECH_AI',
    isIndiaTopic: false
  },
  {
    topic: 'India has just 1.6 hospital beds per 1,000 people behind booming private clinic ads',
    context: 'Crowded public wards push ordinary families to pay 43.9% of all medical costs directly from their own pockets.',
    source: 'fallback_india_downside',
    category: 'HEALTH_SOCIETY',
    isIndiaTopic: true
  }
];

/* =========================================================
   DIVERSITY, INTERLEAVING & SELECTION LOGIC (PURE)
========================================================= */

function significantWords(text = '') {
  return normalizeText(text)
    .split(/\s+/)
    .filter(w => w.length >= 4);
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
 * Deduplicates and round-robin interleaves trends across categories so consecutive
 * items always span completely different topics and themes.
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
    const isIndiaTopic = typeof raw.isIndiaTopic === 'boolean'
      ? raw.isIndiaTopic
      : (category === 'INDIA_REALITY' || category === 'INDIA_DATA' || INDIA_MENTION_PATTERN.test(topic));

    deduped.push({
      ...raw,
      topic,
      category,
      isIndiaTopic
    });
  }

  // Group into category buckets while preserving freshness order inside each bucket
  const buckets = new Map();
  for (const item of deduped) {
    const key = item.category || 'DAILY_TRENDS';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }

  // Rotate starting category order by daySeed so every new day opens with a different sector
  const baseOrder = [...CATEGORY_ORDER, ...Array.from(buckets.keys()).filter(k => !CATEGORY_ORDER.includes(k))];
  const liveOrder = baseOrder.filter(k => buckets.has(k));
  if (liveOrder.length === 0) return [];

  const rot = daySeed % liveOrder.length;
  const rotatedKeys = [...liveOrder.slice(rot), ...liveOrder.slice(0, rot)];

  // Keep live daily trends ahead of slower macro INDIA_DATA when interleaving
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
 * Pure selector picking ONE genuinely unused trending topic while actively
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
    // 1. Prefer a live daily trend (not static fallback) in a DIFFERENT category from the last 1-2 posts
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

  // Fallback rotation: skip anything explicitly avoided in this generation cycle
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
 * Returns a fresh, diverse array of today's trending topics interleaved across categories.
 */
export async function getTrendingTopics(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = readCache();
    if (cached) {
      console.log(`[TrendFetcher] Using today's cached trends (${cached.trends.length} topics, date ${cached.fetchedDate})`);
      return cached.trends;
    }
  }

  console.log('[TrendFetcher] Fetching fresh daily trends across live sources...');
  const recentUsed = historyStore.getRecentSeedTopics(20);

  // Fetch live daily feeds + India data in parallel so latency stays fast
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

  // Always place fresh daily live trends BEFORE static macro data and evergreen fallbacks
  const combined = [
    ...liveTrends,
    ...macroDataTrends,
    ...EVERGREEN_FALLBACKS
  ];

  const final = interleaveTrendsByCategory(combined, { maxItems: 24 });

  if (final.length > 0) {
    writeCache(final);
    console.log(`[TrendFetcher] ✓ Prepared ${final.length} diverse daily trends (${liveTrends.length} live signals)`);
  }

  return final.length > 0 ? final : EVERGREEN_FALLBACKS.slice(0, 8);
}

/**
 * Picks ONE unused trending topic from today's list, rotating categories and
 * forcing a refresh automatically if all cached daily topics were already covered.
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

  // Check if at least one live/non-exhausted trend remains in today's cache
  const hasUnusedInList = trends.some(t =>
    t && t.topic &&
    !historyStore.hasSeenTopic(t.topic) &&
    !allUsed.some(u => topicsOverlap(t.topic, u)) &&
    !avoidTopics.some(a => topicsOverlap(t.topic, a))
  );

  if (!hasUnusedInList && !forceRefresh) {
    console.log('[TrendFetcher] All cached daily trends have been covered. Refreshing fresh trends...');
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
  console.log(`[TrendFetcher] Selected trend [${chosen.category || 'DAILY_TRENDS'}]: "${chosen.topic}" (source: ${chosen.source})`);
  return chosen;
}

/**
 * Formats today's diverse trending topics as a WhatsApp-friendly list string.
 */
export function formatTrendsForWhatsApp(trends) {
  if (!trends || trends.length === 0) return '⚠️ No trending topics available right now.';
  const lines = [`📈 *Today's Trending Topics — Diverse Daily Mix*\n`];
  trends.slice(0, 8).forEach((t, i) => {
    const label = CATEGORY_LABELS[t.category] || 'Daily Trend';
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

/**
 * Fetches fresh global English trend signals specifically about a user's custom topic
 * (e.g. "ai" -> live AI trends like AI agents, coding copilots, compute costs, AI writing)
 * so generated posts reflect what is actually trending in that domain right now.
 * Never throws; returns [] cleanly if offline or network is blocked.
 *
 * @param {string} topic
 * @param {{ excludeRegionalNoise?: boolean, timeoutMs?: number }} [options]
 * @returns {Promise<Array<{ title: string, publisher: string, source: string }>>}
 */
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

/**
 * Formats live custom-topic trend items into a concise prompt brief.
 *
 * @param {string} topic
 * @param {Array<{ title: string, publisher?: string }>} items
 * @returns {string}
 */
export function formatCustomTrendsBrief(topic = '', items = []) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const cleanTopic = String(topic || '').trim();
  const lines = items.slice(0, 5).map(it => `- ${it.title}${it.publisher ? ` (${it.publisher})` : ''}`);
  return `LIVE TRENDS RIGHT NOW AROUND "${cleanTopic}":\n${lines.join('\n')}`;
}
