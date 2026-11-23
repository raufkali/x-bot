/**
 * Trend & Downside Topic Fetcher — X_BOT India Reality Engine
 *
 * Researches India's current structural downsides and their real-world effects
 * (NOT generic news headlines or celebrity/ceremony updates), grounded in live
 * verified public data.
 *
 * Source priority:
 *   1. Live India Data Integration (World Bank IND, Open-Meteo Live Air Quality, USD/INR FX)
 *   2. Targeted Google News India Structural-Issues Search RSS (reframed as downsides, not news)
 *   3. AI-synthesized India downside angles (Cloudflare Llama 3.3 70B → Gemini)
 *   4. Hardcoded India downside & effect fallback topics
 */

import https from 'https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { historyStore } from '../db/historyStore.js';
import {
  getLiveIndiaFactsSnapshot,
  buildDataDrivenDownsideTopics
} from '../integrations/indiaDataService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const CACHE_FILE = path.join(DATA_DIR, 'trends_cache.json');

// How many hours before the cache is considered stale
const CACHE_TTL_HOURS = 3;

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
   SOURCE 1 & 2 — LIVE INDIA DATA + ISSUE-TARGETED RSS
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

const NOISE_AND_NEWS_CEREMONY_PATTERN = /\b(lottery|karunya|sambad|satta|matka|dream11|player props|betting odds|ipl score|live score|cricket score|match highlights|box office|horoscope|rashifal|panchang|admit card|exam result|answer key|weather today|gold rate today|petrol price today|bigg boss|bollywood|trailer release|inaugurat|flagged off|platinum jubilee|addresses rally|birthday wishes|wedding|76ers vs|bucks vs|lakers vs|celtics vs)\b/i;

/**
 * Parses targeted Google News India Search RSS and extracts underlying downside
 * issue themes rather than raw news-headline phrasing.
 */
function parseIndiaIssueRSS(xml) {
  const trends = [];
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
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

    if (NOISE_AND_NEWS_CEREMONY_PATTERN.test(cleanTitle)) {
      continue;
    }

    if (cleanTitle.length >= 20) {
      trends.push({
        topic: `Why ${cleanTitle.charAt(0).toLowerCase() + cleanTitle.slice(1)} hurts everyday families in India`,
        context: `Underlying issue spotted in current Indian data/reporting${publisher ? ` (${publisher})` : ''}: ${cleanTitle}. Write about the root downside and its everyday effect, NOT as a news bulletin.`,
        source: 'india_issue_signal'
      });
    }
  }
  return trends;
}

async function fetchIndiaIssueSignals() {
  const collected = [];

  // Targeted searches for real structural downsides in India (last 30 days)
  const issueQueries = [
    'India+household+debt+OR+savings+drop+RBI+when:30d',
    'India+youth+unemployment+OR+layoffs+OR+job+crisis+when:30d',
    'India+air+pollution+health+cost+OR+water+crisis+tanker+when:30d'
  ];

  for (const q of issueQueries) {
    try {
      const url = `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`;
      const xml = await fetchUrl(url, 7000);
      const parsed = parseIndiaIssueRSS(xml);
      if (parsed.length > 0) {
        collected.push(...parsed.slice(0, 2));
      }
    } catch (e) {
      console.warn(`[TrendFetcher] India issue RSS failed: ${e.message}`);
    }
  }

  return collected;
}

/* =========================================================
   SOURCE 3 — AI-GENERATED INDIA DOWNSIDE TOPICS
========================================================= */

async function callCloudflareForTrends(prompt) {
  const cfToken = process.env.CLOUDFLARE_API_TOKEN || config.cloudflareApiToken;
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || config.cloudflareAccountId;
  const model = process.env.CLOUDFLARE_AI_MODEL || config.cloudflareAiModel || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  if (!cfToken || !cfAccountId) return null;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      messages: [
        { role: 'system', content: 'You identify real structural problems in India and their everyday effects on people. Never give news bulletins. Return only valid JSON.' },
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
            resolve(JSON.parse(match[0]));
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

List 6 RARELY-KNOWN, CRAZY-TO-HEAR structural DOWNSIDES in INDIA right now and their hidden EFFECTS on regular families, workers, students, or small shops.

Rules:
- SKIP obvious everyday talk (do NOT write generic complaints like "traffic is bad" or "food costs more").
- Pick surprising paradoxes and hidden structural traps few outsiders know (e.g. India pumps over 90% of fresh water into exported farm crops leaving tech cities on tankers; 34% of central tax cash vanishes paying old loan interest before building one clinic; 71.6% of workers have zero written contracts; over 35% of young kids grow stunted while grain exports hit records).
- NOT news bulletins (do NOT list speeches, inaugurations, cricket scores, or celebrity gossip).
- Write each topic in very simple everyday English.

Return ONLY valid JSON:
{
  "trends": [
    { "topic": "Surprising hidden downside headline", "context": "1-2 simple sentences on why it happens and the crazy real effect on ordinary Indians" }
  ]
}`;

  try {
    const result = await callCloudflareForTrends(prompt);
    if (result?.trends && Array.isArray(result.trends) && result.trends.length >= 3) {
      console.log(`[TrendFetcher] ✓ Cloudflare AI: fetched ${result.trends.length} India downside topics`);
      return result.trends.map(t => ({ ...t, source: 'ai_cloudflare_india_downsides' }));
    }
  } catch (e) {
    console.warn(`[TrendFetcher] Cloudflare AI trends failed: ${e.message}`);
  }

  try {
    const result = await callGeminiForTrends(prompt);
    if (result?.trends && Array.isArray(result.trends) && result.trends.length >= 3) {
      console.log(`[TrendFetcher] ✓ Gemini: fetched ${result.trends.length} India downside topics`);
      return result.trends.map(t => ({ ...t, source: 'ai_gemini_india_downsides' }));
    }
  } catch (e) {
    console.warn(`[TrendFetcher] Gemini trends failed: ${e.message}`);
  }

  return [];
}

/* =========================================================
   SOURCE 4 — INDIA DOWNSIDES & EFFECTS FALLBACK TOPICS
========================================================= */

const EVERGREEN_FALLBACKS = [
  { topic: 'India sends over 90% of its fresh water to crops while big cities buy tanker water', context: 'World Bank data shows 90.4% of fresh water goes to thirsty rice and sugar fields with free power, leaving under 10% for city taps and homes.', source: 'fallback_india_downside' },
  { topic: 'Over 34% of India federal tax cash vanishes paying only old debt interest', context: 'World Bank figures show one-third of central tax money goes straight to bond lenders before paying for one school, nurse, or train.', source: 'fallback_india_downside' },
  { topic: 'Over 71% of Indian workers hold zero written contracts or sick pay safety', context: 'World Bank 2025 numbers put 71.6% of Indian workers in unstable jobs where one injury or slow week cuts off family cash.', source: 'fallback_india_downside' },
  { topic: 'Over 35% of young Indian kids grow stunted while India exports huge piles of grain', context: 'World Bank data shows over 1 in 3 kids under five lack protein and clean water even as farm warehouses overflow for export.', source: 'fallback_india_downside' },
  { topic: 'India has just 1.6 hospital beds per 1,000 people behind its booming hospital ads', context: 'World Bank data links crowded public wards to Indians paying nearly 44% of all health bills straight from their own pockets.', source: 'fallback_india_downside' },
  { topic: 'Two out of three adult women in India stay locked outside paid work', context: 'Only 32.4% of adult women hold paid jobs due to unsafe transit and scarce nearby roles, leaving homes on one paycheck.', source: 'fallback_india_downside' },
  { topic: 'India burns coal for over 72% of its power even as city air hits toxic winter highs', context: 'Heavy coal power fills northern air with fine dust up to 15x WHO limits, shutting schools and draining worker pay.', source: 'fallback_india_downside' },
  { topic: 'Over 41% of Indian workers stay stuck on tiny farms for barely any yearly cash', context: 'With factory hiring weak and yearly output around $2,702 per person, one bad monsoon traps whole villages in loan debt.', source: 'fallback_india_downside' }
];

/* =========================================================
   MAIN EXPORT — getTrendingTopics()
========================================================= */

/**
 * Returns an array of India downside & real-effect topics grounded in live data.
 */
export async function getTrendingTopics(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = readCache();
    if (cached) {
      console.log(`[TrendFetcher] Using cached India downside topics (${cached.trends.length} topics, fetched ${cached.fetchedAt})`);
      return cached.trends;
    }
  }

  console.log('[TrendFetcher] Fetching live India data & downside topics...');
  let allTrends = [];

  // Source 1: Live verified India data angles (World Bank + Open-Meteo AQI + Live FX)
  try {
    const snapshot = await getLiveIndiaFactsSnapshot(forceRefresh);
    const dataTopics = buildDataDrivenDownsideTopics(snapshot);
    allTrends.push(...dataTopics);
  } catch (e) {
    console.warn(`[TrendFetcher] Live India data integration warning: ${e.message}`);
  }

  // Source 2: Targeted Google News India structural downside RSS (reframed as issues, not news)
  const issueSignals = await fetchIndiaIssueSignals();
  allTrends.push(...issueSignals);

  // Source 3: AI-synthesized India downside angles (if needed)
  if (allTrends.length < 6) {
    const aiTrends = await fetchAITrends();
    allTrends.push(...aiTrends);
  }

  // Source 4: Evergreen downside fallbacks
  if (allTrends.length < 6) {
    allTrends.push(...EVERGREEN_FALLBACKS.slice(0, 6));
  }

  // Interleave live data, real-time issue signals, and macro downsides cleanly
  const seen = new Set();
  const unique = allTrends.filter(t => {
    const key = t.topic.toLowerCase().slice(0, 42);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const final = unique.slice(0, 12);

  if (final.length > 0) {
    writeCache(final);
    console.log(`[TrendFetcher] ✓ Prepared ${final.length} India downside & effect topics`);
  }

  return final.length > 0 ? final : EVERGREEN_FALLBACKS.slice(0, 6);
}

/**
 * Picks ONE unused India downside topic from the list.
 */
export async function pickUnusedTrendingTopic(usedTopics = [], forceRefresh = false) {
  const trends = await getTrendingTopics(forceRefresh);
  const usedLower = usedTopics.map(t => t.toLowerCase());

  const isUsed = (t) => {
    const topicLower = t.toLowerCase();
    if (historyStore.hasSeenTopic(t)) return true;
    if (usedLower.some(u => u === topicLower)) return true;

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

  for (const trend of trends) {
    if (!isUsed(trend.topic)) {
      console.log(`[TrendFetcher] Selected downside topic: "${trend.topic}" (source: ${trend.source})`);
      return trend;
    }
  }

  for (const fallback of EVERGREEN_FALLBACKS) {
    if (!isUsed(fallback.topic)) {
      console.log(`[TrendFetcher] Selected unused downside fallback: "${fallback.topic}"`);
      return fallback;
    }
  }

  if (!forceRefresh) {
    console.log('[TrendFetcher] All cached & fallback topics used. Forcing refresh...');
    return pickUnusedTrendingTopic(usedTopics, true);
  }

  const fallback = EVERGREEN_FALLBACKS[0];
  console.log(`[TrendFetcher] Using evergreen downside fallback: "${fallback.topic}"`);
  return fallback;
}

/**
 * Formats India downside topics as a WhatsApp-friendly list string.
 */
export function formatTrendsForWhatsApp(trends) {
  if (!trends || trends.length === 0) return '⚠️ No India downside topics available right now.';
  const lines = [`⚠️ *Today's Trending Topics — India Reality & Downsides*\n`];
  trends.slice(0, 6).forEach((t, i) => {
    lines.push(`*${i + 1}.* ${t.topic}`);
    if (t.context) lines.push(`   _${t.context.slice(0, 100)}${t.context.length > 100 ? '...' : ''}_`);
    lines.push('');
  });
  lines.push(`_Reply *3* to write about a custom topic instead._`);
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

