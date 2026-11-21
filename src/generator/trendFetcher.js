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

async function fetchUrl(url, timeoutMs = 8000) {
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
   SOURCE 1 — GOOGLE TRENDS & GOOGLE NEWS INDIA RSS
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

const NOISE_TREND_PATTERN = /\b(lottery|karunya|sambad|satta|matka|dream11|player props|betting odds|ipl score|live score|cricket score|match highlights|box office|horoscope|rashifal|panchang|admit card|exam result|answer key|weather today|gold rate today|petrol price today|76ers vs|bucks vs|lakers vs|celtics vs)\b/i;

/**
 * Parses Google Trends RSS XML and returns trend title + traffic context.
 */
function parseGoogleTrendsRSS(xml) {
  const trends = [];
  // Match <item> blocks
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const item of items.slice(0, 15)) {
    const rawTitle = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/))?.[1];
    const title = decodeXmlEntities(rawTitle || '');
    const traffic = decodeXmlEntities(item.match(/approx_traffic[^>]*>([\s\S]*?)</)?.[1] || '');
    const news = (item.match(/<ht:news_item_title>[\s\S]*?<\/ht:news_item_title>/g) || [])
      .map(m => decodeXmlEntities(m.replace(/<\/?ht:news_item_title>/g, '')))
      .filter(Boolean)
      .slice(0, 2)
      .join('; ');
    if (title && !NOISE_TREND_PATTERN.test(title) && !NOISE_TREND_PATTERN.test(news)) {
      trends.push({
        topic: news ? `${title}: ${news}` : title,
        context: news || (traffic ? `Trending in India (${traffic} searches)` : 'Trending in India'),
        source: 'google_trends_india'
      });
    }
  }
  return trends;
}

/**
 * Parses Google News India RSS XML for current Indian business, policy, and national trends.
 */
function parseGoogleNewsIndiaRSS(xml) {
  const trends = [];
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const item of items.slice(0, 12)) {
    const rawTitle = (item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/))?.[1];
    if (!rawTitle) continue;

    let cleanTitle = decodeXmlEntities(rawTitle);
    let publisher = '';
    const dashIdx = cleanTitle.lastIndexOf(' - ');
    if (dashIdx > 15) {
      publisher = cleanTitle.slice(dashIdx + 3).trim();
      cleanTitle = cleanTitle.slice(0, dashIdx).trim();
    }

    if (NOISE_TREND_PATTERN.test(cleanTitle) || /\b(bigg boss|bollywood gossip|trailer release)\b/i.test(cleanTitle)) {
      continue;
    }

    if (cleanTitle.length >= 15) {
      trends.push({
        topic: cleanTitle,
        context: publisher ? `Latest India news trend (${publisher})` : 'Latest India news trend',
        source: 'google_news_india'
      });
    }
  }
  return trends;
}

async function fetchGoogleTrends() {
  const trendUrls = [
    'https://trends.google.com/trending/rss?geo=IN',
    'https://trends.google.com/trends/trendingsearches/daily/rss?geo=IN',
  ];
  const collected = [];

  // Prioritize Google News India Business, Nation & Technology headlines for analytical depth
  const newsUrls = [
    'https://news.google.com/rss/headlines/section/TOPIC/BUSINESS?hl=en-IN&gl=IN&ceid=IN:en',
    'https://news.google.com/rss/headlines/section/TOPIC/NATION?hl=en-IN&gl=IN&ceid=IN:en',
    'https://news.google.com/rss/headlines/section/TOPIC/TECHNOLOGY?hl=en-IN&gl=IN&ceid=IN:en'
  ];

  for (const url of newsUrls) {
    try {
      const xml = await fetchUrl(url, 8000);
      const newsTrends = parseGoogleNewsIndiaRSS(xml);
      if (newsTrends.length > 0) {
        console.log(`[TrendFetcher] ✓ Google News India RSS: fetched ${newsTrends.length} trends`);
        collected.push(...newsTrends.slice(0, 3));
      }
    } catch (e) {
      console.warn(`[TrendFetcher] Google News India failed: ${e.message}`);
    }
  }

  for (const url of trendUrls) {
    try {
      const xml = await fetchUrl(url, 8000);
      const trends = parseGoogleTrendsRSS(xml);
      if (trends.length > 0) {
        console.log(`[TrendFetcher] ✓ Google Trends India (geo=IN): fetched ${trends.length} clean trends`);
        collected.push(...trends.slice(0, 4));
        break;
      }
    } catch (e) {
      console.warn(`[TrendFetcher] Google Trends India failed (${url}): ${e.message}`);
    }
  }

  return collected;
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

List 6 currently trending topics in INDIA on X (Twitter) and Indian news RIGHT NOW that invite sharp analytical discussion and high engagement.

Focus strictly on India: Indian economy, RBI & rupee, UPI & fintech, manufacturing & trade tariffs, youth jobs & IT sector shifts, infrastructure, elections & governance, urban water/air crises, energy transition, or global geopolitics impacting India.

Do NOT include cricket match scores, celebrity gossip, or movie reviews.

Return ONLY valid JSON in this exact format:
{
  "trends": [
    { "topic": "Brief India-focused topic name", "context": "1-2 sentence analytical explanation of why it's trending in India and key numbers/facts" },
    { "topic": "...", "context": "..." }
  ]
}`;

  // Try Cloudflare first
  try {
    const result = await callCloudflareForTrends(prompt);
    if (result?.trends && Array.isArray(result.trends) && result.trends.length >= 3) {
      console.log(`[TrendFetcher] ✓ Cloudflare AI: fetched ${result.trends.length} India AI trends`);
      return result.trends.map(t => ({ ...t, source: 'ai_cloudflare_india' }));
    }
  } catch (e) {
    console.warn(`[TrendFetcher] Cloudflare AI trends failed: ${e.message}`);
  }

  // Gemini fallback
  try {
    const result = await callGeminiForTrends(prompt);
    if (result?.trends && Array.isArray(result.trends) && result.trends.length >= 3) {
      console.log(`[TrendFetcher] ✓ Gemini: fetched ${result.trends.length} India AI trends`);
      return result.trends.map(t => ({ ...t, source: 'ai_gemini_india' }));
    }
  } catch (e) {
    console.warn(`[TrendFetcher] Gemini trends failed: ${e.message}`);
  }

  return [];
}

/* =========================================================
   SOURCE 3 — INDIA-FOCUSED EVERGREEN ANALYTICAL FALLBACKS
========================================================= */

const EVERGREEN_FALLBACKS = [
  { topic: 'India UPI processes 16+ billion monthly payments while rural credit lags', context: 'India handles nearly half of global real-time digital payments via UPI, yet millions of small rural businesses still lack formal bank credit.', source: 'fallback_india' },
  { topic: 'India youth jobs crisis: millions of graduates struggle for formal work', context: 'Over 65% of Indians are under 35, yet formal manufacturing and white-collar hiring has failed to match the 12 million young people entering the workforce yearly.', source: 'fallback_india' },
  { topic: 'India household savings hit multi-decade low as personal debt climbs', context: 'RBI data shows Indian household net financial savings fell sharply while unsecured personal loans and EMI spending surged across urban middle-class families.', source: 'fallback_india' },
  { topic: 'India IT services face AI disruption across $250 billion export sector', context: 'India employs over 5.4 million tech workers in IT outsourcing, where generative AI tools are now automating routine coding and support roles.', source: 'fallback_india' },
  { topic: 'India food inflation squeezes families despite record GDP headlines', context: 'While headline GDP growth tops 6-7%, staple vegetable, pulse, and healthcare costs in Indian cities continue outpacing middle-class wage growth.', source: 'fallback_india' },
  { topic: 'India semiconductor push vs heavy reliance on Chinese electronics imports', context: 'India imports tens of billions in electronic components and active pharma ingredients from China even as domestic PLI assembly plants expand.', source: 'fallback_india' },
  { topic: 'India urban water crisis hits Bengaluru and Delhi groundwater reserves', context: 'NITI Aayog warned that major Indian cities face severe groundwater depletion, forcing millions to depend on expensive private water tankers.', source: 'fallback_india' },
  { topic: 'India billionaire wealth concentration vs shrinking middle-class consumption', context: 'World Inequality Lab data shows India\'s top 1% hold over 40% of national wealth, raising concerns over weak mass consumer demand.', source: 'fallback_india' },
  { topic: 'India air pollution crisis costs the economy billions in lost productivity', context: 'Air quality across northern India regularly exceeds safe WHO limits by 15-20x, cutting life expectancy and straining public hospitals every winter.', source: 'fallback_india' },
  { topic: 'India green energy surge vs 70% coal dependency for electricity', context: 'India is rapidly adding solar capacity to meet 2030 targets, yet coal still generates over 70% of the country\'s daily power grid load.', source: 'fallback_india' },
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
  if (!trends || trends.length === 0) return '⚠️ No India trending topics available right now.';
  const lines = [`🔥 *Today's Trending Topics in India*\n`];
  trends.slice(0, 6).forEach((t, i) => {
    lines.push(`*${i + 1}.* ${t.topic}`);
    if (t.context) lines.push(`   _${t.context.slice(0, 100)}${t.context.length > 100 ? '...' : ''}_`);
    lines.push('');
  });
  lines.push(`_Reply *3* to write about a custom topic instead._`);
  return lines.join('\n');
}
