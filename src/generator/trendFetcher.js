/**
 * Trend Fetcher — X_BOT Daily Trending Topic Research Engine
 *
 * Fetches real trending topics from multiple free sources so the bot always
 * posts about what people are actually talking about on X right now.
 *
 * Source priority:
 *   1. Google Trends Daily RSS (geo=US, global English audience)
 *   2. AI-generated trending topics (Cloudflare → Gemini) using current date context
 *   3. Hardcoded engagement-proven evergreen fallback topics
 */

import https from 'https';
import http from 'http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { historyStore } from '../db/historyStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const CACHE_FILE = path.join(DATA_DIR, 'trends_cache.json');

// How many hours before the cache is considered stale
const CACHE_TTL_HOURS = 6;

/* =========================================================
   CACHE HELPERS
========================================================= */

function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const cache = JSON.parse(raw);
    if (!cache.fetchedAt || !Array.isArray(cache.trends)) return null;
    const ageHours = (Date.now() - new Date(cache.fetchedAt).getTime()) / 3_600_000;
    if (ageHours > CACHE_TTL_HOURS) return null;
    return cache;
  } catch {
    return null;
  }
}

function writeCache(trends) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({
      fetchedAt: new Date().toISOString(),
      trends
    }, null, 2), 'utf8');
  } catch (e) {
    console.warn('[TrendFetcher] Cache write failed:', e.message);
  }
}

/* =========================================================
   HTTP HELPER — returns plain text body
========================================================= */

function fetchUrl(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 X_BOT/1.0' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

/* =========================================================
   SOURCE 1 — GOOGLE TRENDS RSS
========================================================= */

/**
 * Parses Google Trends RSS XML and returns trend title + traffic context.
 */
function parseGoogleTrendsRSS(xml) {
  const trends = [];
  // Match <item> blocks
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const item of items.slice(0, 10)) {
    const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/))?.[1]?.trim();
    const traffic = item.match(/approx_traffic[^>]*>(.*?)</)?.[1]?.trim() || '';
    const news = (item.match(/<ht:news_item_title><!\[CDATA\[(.*?)\]\]>/g) || [])
      .map(m => m.replace(/<ht:news_item_title><!\[CDATA\[/, '').replace(/\]\]>/, '').trim())
      .slice(0, 2)
      .join('; ');
    if (title) {
      trends.push({ topic: title, context: news || traffic || 'Trending on Google', source: 'google_trends' });
    }
  }
  return trends;
}

async function fetchGoogleTrends() {
  const urls = [
    'https://trends.google.com/trends/trendingsearches/daily/rss?geo=US',
    'https://trends.google.com/trends/trendingsearches/daily/rss?geo=GB',
  ];
  for (const url of urls) {
    try {
      const xml = await fetchUrl(url, 8000);
      const trends = parseGoogleTrendsRSS(xml);
      if (trends.length >= 3) {
        console.log(`[TrendFetcher] ✓ Google Trends: fetched ${trends.length} trends`);
        return trends;
      }
    } catch (e) {
      console.warn(`[TrendFetcher] Google Trends failed: ${e.message}`);
    }
  }
  return [];
}

/* =========================================================
   SOURCE 2 — AI-GENERATED TRENDING TOPICS
========================================================= */

async function callCloudflareForTrends(prompt) {
  const cfToken = process.env.CLOUDFLARE_API_TOKEN || config.cloudflareApiToken;
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || config.cloudflareAccountId;
  const model = process.env.CLOUDFLARE_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
  if (!cfToken || !cfAccountId) return null;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      messages: [
        { role: 'system', content: 'You are a social media trend analyst. Return only valid JSON.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 512,
      temperature: 0.6
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
          const text = json?.result?.response || '';
          const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            resolve(parsed);
          } else {
            reject(new Error('No JSON in response'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('CF timeout')); });
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
      generationConfig: { temperature: 0.6, maxOutputTokens: 512 }
    });
    const model = 'gemini-1.5-flash-latest';
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
            const parsed = JSON.parse(match[0]);
            resolve(parsed);
          } else {
            reject(new Error('No JSON in Gemini response'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Gemini timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function fetchAITrends() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const prompt = `Today is ${dateStr}.

List 6 currently trending global topics on X (Twitter) and social media RIGHT NOW that would get maximum engagement and shares.

Focus on: geopolitics, AI/technology breakthroughs, economic events, surprising statistics, viral controversies, environmental crises, or social justice issues with global impact.

Do NOT include sports scores, celebrity gossip, or entertainment.

Return ONLY valid JSON in this exact format:
{
  "trends": [
    { "topic": "Brief topic name", "context": "1-2 sentence explanation of why it's trending and key facts" },
    { "topic": "...", "context": "..." }
  ]
}`;

  // Try Cloudflare first
  try {
    const result = await callCloudflareForTrends(prompt);
    if (result?.trends && Array.isArray(result.trends) && result.trends.length >= 3) {
      console.log(`[TrendFetcher] ✓ Cloudflare AI: fetched ${result.trends.length} AI trends`);
      return result.trends.map(t => ({ ...t, source: 'ai_cloudflare' }));
    }
  } catch (e) {
    console.warn(`[TrendFetcher] Cloudflare AI trends failed: ${e.message}`);
  }

  // Gemini fallback
  try {
    const result = await callGeminiForTrends(prompt);
    if (result?.trends && Array.isArray(result.trends) && result.trends.length >= 3) {
      console.log(`[TrendFetcher] ✓ Gemini: fetched ${result.trends.length} AI trends`);
      return result.trends.map(t => ({ ...t, source: 'ai_gemini' }));
    }
  } catch (e) {
    console.warn(`[TrendFetcher] Gemini trends failed: ${e.message}`);
  }

  return [];
}

/* =========================================================
   SOURCE 3 — EVERGREEN FALLBACK TOPICS
   High-engagement, global, non-biased topics
========================================================= */

const EVERGREEN_FALLBACKS = [
  { topic: 'AI replacing jobs faster than new ones are created', context: 'The World Economic Forum estimates AI will displace 85 million jobs by 2025 while creating only 97 million new ones — but those new roles require skills most workers don\'t have yet.', source: 'fallback' },
  { topic: 'Central banks raising interest rates as inflation remains sticky', context: 'Despite aggressive rate hikes, global inflation in food and energy remains above targets in 2025, squeezing household budgets worldwide.', source: 'fallback' },
  { topic: 'Climate tipping points reached sooner than predicted', context: 'Scientists warn that the Amazon, Greenland ice sheet, and Atlantic currents are approaching irreversible tipping points years ahead of IPCC projections.', source: 'fallback' },
  { topic: 'US-China trade war escalating with new tariff rounds', context: 'New rounds of US tariffs on Chinese goods in 2025 are reshaping global supply chains, pushing manufacturing to Vietnam, Mexico, and India.', source: 'fallback' },
  { topic: 'Global debt hitting record highs as governments overspend', context: 'Global public debt exceeded $100 trillion in 2024. Interest payments now consume more of national budgets than education or healthcare in many countries.', source: 'fallback' },
  { topic: 'AI chatbots outperforming doctors and lawyers on exams', context: 'GPT-4 and its successors now pass bar exams, medical licensing tests, and coding interviews — raising urgent questions about professional gatekeeping.', source: 'fallback' },
  { topic: 'Youth unemployment crisis in Africa and South Asia', context: 'Over 60% of Africa\'s population is under 25. With formal jobs scarce, millions of young people are turning to gig work, online freelancing, and informal economies.', source: 'fallback' },
  { topic: 'Water scarcity becoming a national security crisis', context: 'Over 2 billion people lack access to safe drinking water. Major aquifers in India, the US, and China are being depleted faster than rainfall can replenish them.', source: 'fallback' },
  { topic: 'Social media algorithms amplifying outrage and division', context: 'Internal research from major platforms confirms that outrage-based content gets 3x more engagement — and platforms prioritize it because it drives ad revenue.', source: 'fallback' },
  { topic: 'Billionaires\' wealth grew 54% while median wages stagnated', context: 'Oxfam reports that the world\'s richest 1% captured nearly two-thirds of all new global wealth since 2020, while billions saw real wages fall due to inflation.', source: 'fallback' },
];

/* =========================================================
   MAIN EXPORT — getTrendingTopics()
========================================================= */

/**
 * Returns an array of trending topics with context, using cache if fresh.
 * Each topic: { topic: string, context: string, source: string }
 *
 * @param {boolean} [forceRefresh=false] - Bypass cache and fetch fresh
 * @returns {Promise<Array<{topic: string, context: string, source: string}>>}
 */
export async function getTrendingTopics(forceRefresh = false) {
  // Check cache first
  if (!forceRefresh) {
    const cached = readCache();
    if (cached) {
      console.log(`[TrendFetcher] Using cached trends (${cached.trends.length} topics, fetched ${cached.fetchedAt})`);
      return cached.trends;
    }
  }

  console.log('[TrendFetcher] Fetching fresh trending topics...');
  let allTrends = [];

  // Source 1: Google Trends RSS (fastest, most real-time)
  const googleTrends = await fetchGoogleTrends();
  allTrends.push(...googleTrends);

  // Source 2: AI-generated (if we need more or Google failed)
  if (allTrends.length < 5) {
    const aiTrends = await fetchAITrends();
    allTrends.push(...aiTrends);
  }

  // Source 3: Evergreen fallback (always mix in some high-engagement topics)
  if (allTrends.length < 3) {
    // Shuffle and take 6 evergreen topics
    const shuffled = [...EVERGREEN_FALLBACKS].sort(() => Math.random() - 0.5);
    allTrends.push(...shuffled.slice(0, 6));
  }

  // Deduplicate by topic name
  const seen = new Set();
  const unique = allTrends.filter(t => {
    const key = t.topic.toLowerCase().slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Take top 10
  const final = unique.slice(0, 10);

  if (final.length > 0) {
    writeCache(final);
    console.log(`[TrendFetcher] ✓ Fetched ${final.length} unique trending topics`);
  }

  return final.length > 0 ? final : EVERGREEN_FALLBACKS.slice(0, 6);
}

/**
 * Picks ONE trending topic from the list, avoiding recently used ones.
 * @param {string[]} usedTopics - List of already-posted topic strings to avoid
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<{topic: string, context: string, source: string}>}
 */
export async function pickUnusedTrendingTopic(usedTopics = [], forceRefresh = false) {
  const trends = await getTrendingTopics(forceRefresh);
  const usedLower = usedTopics.map(t => t.toLowerCase());

  // Helper to test if a topic overlaps with used topics
  const isUsed = (t) => {
    const topicLower = t.toLowerCase();
    if (historyStore.hasSeenTopic(t)) return true;
    if (usedLower.some(u => u === topicLower)) return true;

    // Check keyword overlap
    const words = topicLower.split(/[^a-z0-9]+/i).filter(w => w.length >= 4);
    if (words.length > 0) {
      for (const u of usedLower) {
        const matchingWords = words.filter(w => u.includes(w));
        if (matchingWords.length >= Math.min(2, words.length)) {
          return true;
        }
      }
    }
    return false;
  };

  // Find first unused topic from trends
  for (const trend of trends) {
    if (!isUsed(trend.topic)) {
      console.log(`[TrendFetcher] Selected topic: "${trend.topic}" (source: ${trend.source})`);
      return trend;
    }
  }

  // If all cached trends were used, try evergreen fallbacks that haven't been used yet
  for (const fallback of EVERGREEN_FALLBACKS) {
    if (!isUsed(fallback.topic)) {
      console.log(`[TrendFetcher] Selected unused evergreen fallback: "${fallback.topic}"`);
      return fallback;
    }
  }

  // Force refresh if allowed
  if (!forceRefresh) {
    console.log('[TrendFetcher] All cached & fallback topics used. Forcing refresh...');
    return pickUnusedTrendingTopic(usedTopics, true);
  }

  // Absolute fallback
  const fallback = EVERGREEN_FALLBACKS[Math.floor(Math.random() * EVERGREEN_FALLBACKS.length)];
  console.log(`[TrendFetcher] Using evergreen fallback: "${fallback.topic}"`);
  return fallback;
}

/**
 * Formats trending topics as a WhatsApp-friendly list string.
 * @param {Array} trends
 * @returns {string}
 */
export function formatTrendsForWhatsApp(trends) {
  if (!trends || trends.length === 0) return '⚠️ No trending topics available right now.';
  const lines = [`🔥 *Today's Trending Topics*\n`];
  trends.slice(0, 6).forEach((t, i) => {
    lines.push(`*${i + 1}.* ${t.topic}`);
    if (t.context) lines.push(`   _${t.context.slice(0, 100)}${t.context.length > 100 ? '...' : ''}_`);
    lines.push('');
  });
  lines.push(`_Reply *3* to write about a custom topic instead._`);
  return lines.join('\n');
}
