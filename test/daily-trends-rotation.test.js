import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { historyStore } from '../src/db/historyStore.js';
import {
  getTodayDateKey,
  isCacheValidForToday,
  classifyTrendCategory,
  parseGoogleTrendsRss,
  parseDailyCategoryRss,
  interleaveTrendsByCategory,
  selectBestUnusedTrend,
  getTrendingTopics,
  formatTrendsForWhatsApp
} from '../src/generator/trendFetcher.js';
import { generateEnglishPost } from '../src/generator/aiService.js';
import { whatsappWorkflow } from '../src/whatsapp/workflow.js';

const TRENDS_CACHE_PATH = path.resolve(process.cwd(), 'data/trends_cache.json');

function snapshotState() {
  const cachedFile = fs.existsSync(TRENDS_CACHE_PATH)
    ? fs.readFileSync(TRENDS_CACHE_PATH, 'utf8')
    : null;
  return {
    posts: [...historyStore.posts],
    seedTopics: Array.from(historyStore.seedTopics),
    cachedFile,
    fetch: globalThis.fetch,
    cfToken: process.env.CLOUDFLARE_API_TOKEN,
    cfAccount: process.env.CLOUDFLARE_ACCOUNT_ID,
    cfgCfToken: config.cloudflareApiToken,
    cfgCfAccount: config.cloudflareAccountId,
    gemini: process.env.GEMINI_API_KEY,
    grok: process.env.GROK_API_KEY,
    xai: process.env.XAI_API_KEY,
    groq: process.env.GROQ_API_KEY,
    ownerPhone: config.ownerPhoneNumber
  };
}

function restoreState(snap) {
  globalThis.fetch = snap.fetch;
  if (snap.cfToken !== undefined) process.env.CLOUDFLARE_API_TOKEN = snap.cfToken; else delete process.env.CLOUDFLARE_API_TOKEN;
  if (snap.cfAccount !== undefined) process.env.CLOUDFLARE_ACCOUNT_ID = snap.cfAccount; else delete process.env.CLOUDFLARE_ACCOUNT_ID;
  config.cloudflareApiToken = snap.cfgCfToken;
  config.cloudflareAccountId = snap.cfgCfAccount;
  if (snap.gemini !== undefined) process.env.GEMINI_API_KEY = snap.gemini; else delete process.env.GEMINI_API_KEY;
  if (snap.grok !== undefined) process.env.GROK_API_KEY = snap.grok; else delete process.env.GROK_API_KEY;
  if (snap.xai !== undefined) process.env.XAI_API_KEY = snap.xai; else delete process.env.XAI_API_KEY;
  if (snap.groq !== undefined) process.env.GROQ_API_KEY = snap.groq; else delete process.env.GROQ_API_KEY;
  config.ownerPhoneNumber = snap.ownerPhone;

  historyStore.posts = snap.posts;
  historyStore.seedTopics = new Set(snap.seedTopics);
  historyStore.rebuildIndexes();
  historyStore.save();

  if (snap.cachedFile !== null) {
    fs.writeFileSync(TRENDS_CACHE_PATH, snap.cachedFile, 'utf8');
  } else if (fs.existsSync(TRENDS_CACHE_PATH)) {
    fs.unlinkSync(TRENDS_CACHE_PATH);
  }
}

test('isCacheValidForToday invalidates yesterday cache immediately even within 3-hour TTL window', () => {
  const istZone = 'Asia/Kolkata';
  const beforeMidnight = new Date('2026-11-23T18:10:00.000Z'); // 23:40 IST on Nov 23
  const afterMidnight = new Date('2026-11-23T18:45:00.000Z');  // 00:15 IST on Nov 24

  const cache = {
    fetchedAt: beforeMidnight.toISOString(),
    fetchedDate: getTodayDateKey(beforeMidnight, istZone),
    trends: [{ topic: 'Sample yesterday India trend', category: 'INDIA_JOBS_YOUTH' }]
  };

  assert.equal(
    isCacheValidForToday(cache, new Date('2026-11-23T18:20:00.000Z'), istZone),
    true,
    'Same IST calendar date within 3h must remain valid'
  );
  assert.equal(
    isCacheValidForToday(cache, afterMidnight, istZone),
    false,
    'Cache from yesterday must expire immediately on calendar day rollover'
  );
  assert.equal(
    isCacheValidForToday({ ...cache, fetchedDate: undefined }, new Date('2026-11-23T18:20:00.000Z'), istZone),
    false,
    'Legacy cache missing fetchedDate must invalidate cleanly'
  );
});

test('India RSS parsers extract multi-beat India daily trends and filter cricket/lottery noise', () => {
  const sampleGoogleTrendsXml = `<?xml version="1.0" encoding="UTF-8" ?>
    <rss version="2.0" xmlns:ht="https://trends.google.com/trending/rss">
      <channel>
        <item>
          <title>IPL score live cricket match highlights</title>
          <ht:approx_traffic>500,000+</ht:approx_traffic>
          <ht:news_item_title>Team announces final eleven for match</ht:news_item_title>
        </item>
        <item>
          <title>10-minute delivery riders India</title>
          <ht:approx_traffic>200,000+</ht:approx_traffic>
          <ht:news_item_title>Indian delivery riders strike over rising fuel costs and penalties</ht:news_item_title>
        </item>
        <item>
          <title>Kota coaching pressure</title>
          <ht:approx_traffic>100,000+</ht:approx_traffic>
          <ht:news_item_title>Kota coaching center fees surge even as top seat odds shrink</ht:news_item_title>
        </item>
      </channel>
    </rss>`;

  const parsedTrends = parseGoogleTrendsRss(sampleGoogleTrendsXml, 'IN');
  assert.equal(parsedTrends.length, 2, 'Cricket score item should be filtered out');
  assert.equal(parsedTrends[0].category, 'INDIA_TECH_SCAMS_GIG');
  assert.equal(parsedTrends[0].isIndiaTopic, true);
  assert.equal(parsedTrends[1].category, 'INDIA_EDUCATION_MIGRATION');
  assert.equal(parsedTrends[1].isIndiaTopic, true);

  const sampleCategoryNewsXml = `<rss version="2.0"><channel>
    <item><title>Private hospital bills wipe out Indian family savings fast - The Hindu</title></item>
    <item><title>Karunya lottery result today announced - Daily News</title></item>
  </channel></rss>`;

  const parsedNews = parseDailyCategoryRss(sampleCategoryNewsXml, {
    category: 'INDIA_HEALTH_FOOD',
    source: 'daily_rss_india_health',
    isIndiaTopic: true
  });
  assert.equal(parsedNews.length, 1);
  assert.equal(parsedNews[0].topic, 'Private hospital bills wipe out Indian family savings fast');
  assert.equal(parsedNews[0].category, 'INDIA_HEALTH_FOOD');
  assert.equal(parsedNews[0].isIndiaTopic, true);
  assert.equal(classifyTrendCategory('Instant phone loan apps hit Indian salaried youth', ''), 'INDIA_TECH_SCAMS_GIG');
});

test('interleaveTrendsByCategory spreads diverse India sectors ahead of static INDIA_DATA', () => {
  const input = [
    ...Array.from({ length: 6 }, (_, i) => ({
      topic: `Static India metric number ${i + 1} for annual macro chart`,
      category: 'INDIA_DATA',
      source: 'world_bank_india',
      isIndiaTopic: true
    })),
    { topic: '10-minute delivery riders face fuel squeeze in Indian cities', category: 'INDIA_TECH_SCAMS_GIG', source: 'google_trends_in', isIndiaTopic: true },
    { topic: 'Engineering graduates line up for clerk jobs in northern India', category: 'INDIA_JOBS_YOUTH', source: 'daily_rss_india_jobs', isIndiaTopic: true },
    { topic: 'Household net savings hit lows as Indian families pledge gold', category: 'INDIA_ECONOMY_DEBT', source: 'daily_rss_india_economy', isIndiaTopic: true },
    { topic: 'Private hospital bills force Indian families into app loans', category: 'INDIA_HEALTH_FOOD', source: 'daily_rss_india_health', isIndiaTopic: true },
    { topic: 'Monsoon waterlogging shuts expressways across Indian metros', category: 'INDIA_CITIES_AIR_WATER', source: 'daily_rss_india_cities', isIndiaTopic: true }
  ];

  const day1 = interleaveTrendsByCategory(input, { daySeed: 0, maxItems: 12 });
  const day2 = interleaveTrendsByCategory(input, { daySeed: 1, maxItems: 12 });

  assert.notEqual(day1[0].category, 'INDIA_DATA', 'Static INDIA_DATA must never hijack slot 0 ahead of live India trends');
  assert.notEqual(day1[0].category, day1[1].category, 'Adjacent slots must span different India sectors');
  assert.notEqual(day1[0].topic, day2[0].topic, 'Different daySeed rotates starting India sector');

  const formatted = formatTrendsForWhatsApp(day1);
  assert.ok(formatted.includes('Trending Topics'));
  assert.ok(formatted.includes('[India'));
});

test('selectBestUnusedTrend rotates India categories and respects seenSeedTopics', () => {
  const snap = snapshotState();
  historyStore.reset();

  try {
    const sampleTrends = [
      { topic: 'Indian engineers face flat entry pay despite soaring rent', category: 'INDIA_JOBS_YOUTH', source: 'daily_rss_india_jobs', isIndiaTopic: true },
      { topic: 'Indian IT freshers wait months for delayed onboarding offers', category: 'INDIA_JOBS_YOUTH', source: 'daily_rss_india_jobs', isIndiaTopic: true },
      { topic: 'Private clinic bills push Indian families into gold loans', category: 'INDIA_HEALTH_FOOD', source: 'daily_rss_india_health', isIndiaTopic: true },
      { topic: 'Kota coaching fees drain middle-class savings in India', category: 'INDIA_EDUCATION_MIGRATION', source: 'daily_rss_india_education', isIndiaTopic: true }
    ];

    historyStore.recordSeenTopic(sampleTrends[0].topic, false);
    const pick2 = selectBestUnusedTrend(sampleTrends, [], {
      recentCategories: ['INDIA_JOBS_YOUTH']
    });
    assert.equal(pick2.category, 'INDIA_HEALTH_FOOD', 'Should rotate away from recent INDIA_JOBS_YOUTH category');

    historyStore.recordSeenTopic(pick2.topic, false);
    const pick3 = selectBestUnusedTrend(sampleTrends, [], {
      recentCategories: ['INDIA_HEALTH_FOOD', 'INDIA_JOBS_YOUTH']
    });
    assert.equal(pick3.category, 'INDIA_EDUCATION_MIGRATION', 'Should rotate into unused INDIA_EDUCATION_MIGRATION category');
  } finally {
    restoreState(snap);
  }
});

test('End-to-end daily generation stays India-focused while picking completely new India topics & sectors every post', async () => {
  const snap = snapshotState();
  historyStore.reset();
  if (fs.existsSync(TRENDS_CACHE_PATH)) fs.unlinkSync(TRENDS_CACHE_PATH);

  process.env.CLOUDFLARE_API_TOKEN = 'test-cf-token';
  process.env.CLOUDFLARE_ACCOUNT_ID = 'test-cf-acct';
  config.cloudflareApiToken = 'test-cf-token';
  config.cloudflareAccountId = 'test-cf-acct';
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROK_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.GROQ_API_KEY;

  let aiCallIdx = 0;
  const capturedPrompts = [];

  globalThis.fetch = async (url, init = {}) => {
    const urlStr = String(url);

    if (urlStr.includes('trends.google.com/trending/rss?geo=IN')) {
      return new Response(`<rss version="2.0" xmlns:ht="https://trends.google.com/trending/rss"><channel>
        <item><title>10-minute delivery riders strike India</title><ht:news_item_title>Quick delivery riders protest petrol costs and fines across Indian cities</ht:news_item_title></item>
      </channel></rss>`, { status: 200 });
    }
    if (urlStr.includes('news.google.com/rss/search')) {
      const dec = decodeURIComponent(urlStr);
      if (dec.includes('youth jobless') || dec.includes('layoffs')) {
        return new Response(`<rss version="2.0"><channel><item><title>Indian fresh IT graduates face longest wait for first office offer - Mint</title></item></channel></rss>`, { status: 200 });
      }
      if (dec.includes('household debt') || dec.includes('GST')) {
        return new Response(`<rss version="2.0"><channel><item><title>Indian families pawn gold as household savings hit multi-year low - Reuters</title></item></channel></rss>`, { status: 200 });
      }
      if (dec.includes('hospital bills') || dec.includes('child nutrition')) {
        return new Response(`<rss version="2.0"><channel><item><title>Medicine price hike strains middle-class Indian clinic budgets - The Hindu</title></item></channel></rss>`, { status: 200 });
      }
      return new Response(`<rss version="2.0"><channel></channel></rss>`, { status: 200 });
    }
    if (urlStr.includes('api.worldbank.org')) {
      return new Response(JSON.stringify([{ page: 1 }, [{ date: '2025', value: 71.6 }]]), { status: 200 });
    }
    if (urlStr.includes('air-quality-api.open-meteo.com')) {
      return new Response(JSON.stringify({ current: { pm2_5: 82.5, pm10: 140, european_aqi: 95 } }), { status: 200 });
    }
    if (urlStr.includes('open.er-api.com')) {
      return new Response(JSON.stringify({ rates: { INR: 86.2 } }), { status: 200 });
    }
    if (urlStr.includes('api.cloudflare.com')) {
      const body = JSON.parse(init.body || '{}');
      const userPrompt = body?.messages?.[1]?.content || '';
      if (userPrompt.includes('7 BRAND-NEW, COMPLETELY DIFFERENT')) {
        return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify({ trends: [] }) } }), { status: 200 });
      }
      capturedPrompts.push(userPrompt);
      aiCallIdx++;
      const drafts = [
        {
          topic: 'Quick grocery delivery riders pay fuel and risk from thin pay in India',
          text: 'Behind shiny ten-minute grocery apps across India hides a brutal wage squeeze almost nobody checks closely.\n\nYoung Indian riders buy their own petrol, pay road fines, and absorb bike repairs while rushing traffic for tiny fees per trip. With 71.6% of workers lacking sick leave or job contracts, one rain crash stops income overnight.\n\nIs saving ten minutes on snack bags worth pushing young Indians into unpaid road risk?'
        },
        {
          topic: 'Fresh Indian engineering graduates wait months while entry tech pay stays flat',
          text: 'A cold job shock greets millions of Indian graduates leaving college with fresh computer degrees this year.\n\nStarting software pay barely moved over a decade while 71.6% of working Indians still lack steady contracts or paid leave. Thousands wait months for delayed offer letters while paying steep city room rents out of parent savings.\n\nWhy keep adding millions of engineering seats across India when steady starter pay lags badly?'
        },
        {
          topic: 'Indian families pawn home gold as household cash savings sink lower',
          text: 'Loud growth ads hide a quiet pocket squeeze inside Indian towns: net household savings fell to multi-decade lows.\n\nBecause food prices and private school tuition climbed faster than monthly wages, regular Indians now pledge family gold just to handle normal bills. Rising debt loads alongside 34% federal tax going to old interest squeeze real family budgets.\n\nCan an economy brag about big headlines while ordinary Indians pawn gold for school fees?'
        },
        {
          topic: 'Rising Indian medicine prices push regular families toward clinic debt',
          text: 'Behind bright private clinic ads across India, families pay over 43.9% of all medical costs directly from their own pockets.\n\nWith roughly 1.6 public hospital beds per 1,000 Indians, rising tablet prices turn one minor fever into sudden loans on family jewelry. Cheap neighborhood clinics lack doctors, forcing everyday workers straight into pricey private wards.\n\nHow long can working Indians manage when one hospital bill wipes out two years of savings?'
        }
      ];
      const chosen = drafts[(aiCallIdx - 1) % drafts.length];
      return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(chosen) } }), { status: 200 });
    }
    throw new Error(`Unexpected fetch URL: ${urlStr}`);
  };

  try {
    const trends = await getTrendingTopics(true);
    assert.ok(trends.length >= 4, 'Should gather multi-beat India trends');
    assert.ok(trends.every(t => t.isIndiaTopic === true), 'Every daily trend must stay India-focused');

    const generated = [];
    for (let i = 0; i < 4; i++) {
      const post = await generateEnglishPost('', '');
      generated.push(post);
      assert.ok(post.english.charCount >= 400 && post.english.charCount <= 600, `Post ${i + 1} length ${post.english.charCount}`);
      assert.ok(/\b(india|indian|indians)\b/i.test(post.english.text), `Post ${i + 1} must be India-related`);
    }

    const uniqueTopics = new Set(generated.map(g => g.topic));
    const uniqueSeeds = new Set(generated.map(g => g.seedTopic));
    const uniqueCategories = new Set(generated.map(g => g.trendCategory));

    assert.equal(uniqueTopics.size, 4, 'Four consecutive calls must produce 4 completely different India topics');
    assert.equal(uniqueSeeds.size, 4, 'Four consecutive calls must draw 4 distinct India seed trends');
    assert.ok(uniqueCategories.size >= 3, `Expected diverse India categories, got: ${Array.from(uniqueCategories).join(', ')}`);
    assert.ok(
      capturedPrompts.every(p => p.includes('as a Pakistani talking about Indians')),
      'Every daily India trend post must use Pakistani-observer-on-India voice'
    );
  } finally {
    restoreState(snap);
  }
});

test('Offline 16-run generation, Option 5, and concurrency stay 100% India-related with zero repeats', async () => {
  const snap = snapshotState();
  historyStore.reset();
  if (fs.existsSync(TRENDS_CACHE_PATH)) fs.unlinkSync(TRENDS_CACHE_PATH);

  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  config.cloudflareApiToken = '';
  config.cloudflareAccountId = '';
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROK_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.GROQ_API_KEY;
  globalThis.fetch = async () => { throw new Error('Offline mode'); };

  try {
    const offlineTopics = [];
    for (let i = 0; i < 16; i++) {
      const post = await generateEnglishPost('', '');
      assert.ok(post.english.charCount >= 400 && post.english.charCount <= 600, `Offline post ${i + 1} charCount=${post.english.charCount}`);
      assert.ok(/\b(india|indian|indians)\b/i.test(post.english.text), `Offline post ${i + 1} must stay about India/Indians`);
      offlineTopics.push(post.topic);
    }
    const uniqueOffline = new Set(offlineTopics);
    assert.equal(uniqueOffline.size, 16, `Expected 16 unique India topics offline, got ${uniqueOffline.size}: ${offlineTopics.join(' | ')}`);

    config.ownerPhoneNumber = '923001234567';
    whatsappWorkflow.currentPendingPost = null;
    const first = await whatsappWorkflow.generateAndSend('', '');
    const retry = await whatsappWorkflow.handleOwnerReply('5', '923001234567');
    assert.ok(retry.post, 'Option 5 must produce a replacement India post');
    assert.notEqual(retry.post.topic, first.post.topic, 'Option 5 must pick a brand-new topic');
    assert.ok(/\b(india|indian|indians)\b/i.test(retry.post.english.text), 'Option 5 replacement must stay about India/Indians');

    const [concA, concB] = await Promise.all([
      generateEnglishPost('', ''),
      generateEnglishPost('', '')
    ]);
    assert.notEqual(concA.topic, concB.topic, 'Concurrent India calls must produce distinct topics');
    assert.notEqual(concA.english.text, concB.english.text, 'Concurrent India calls must produce distinct texts');
  } finally {
    restoreState(snap);
  }
});

test('Retry loop switches to a new India trend seed on duplicate collision instead of hammering the same topic', async () => {
  const snap = snapshotState();
  historyStore.reset();
  if (fs.existsSync(TRENDS_CACHE_PATH)) fs.unlinkSync(TRENDS_CACHE_PATH);

  const collidingPostText =
    'Tiny two-minute loan apps on Indian phones quietly trap millions of young earners under heavy debt every month.\n\n' +
    'After hidden fees and sharp late fines pile up, one small clinic bill snowballs into five desperate app loans chasing one flat salary while rude recovery callers ring coworkers and parents at night.\n\n' +
    'Why do millions of working Indians end up relying on costly phone apps just to reach month end?';

  historyStore.recordPost({
    topic: 'Instant Indian phone loan app debt trap',
    subtopic: 'High-fee phone loan apps squeezing Indian youth',
    seedTopic: 'Earlier unrelated loan seed',
    trendCategory: 'INDIA_ECONOMY_DEBT',
    genreId: 'INDIA_ECONOMY_DEBT',
    category: 'INDIA_ECONOMY_DEBT',
    englishText: collidingPostText
  });

  process.env.CLOUDFLARE_API_TOKEN = 'test-cf-token';
  process.env.CLOUDFLARE_ACCOUNT_ID = 'test-cf-acct';
  config.cloudflareApiToken = 'test-cf-token';
  config.cloudflareAccountId = 'test-cf-acct';
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROK_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.GROQ_API_KEY;

  const seenPromptSeeds = [];
  globalThis.fetch = async (url, init = {}) => {
    const urlStr = String(url);
    if (urlStr.includes('trends.google.com/trending/rss?geo=IN')) {
      return new Response(`<rss version="2.0" xmlns:ht="https://trends.google.com/trending/rss"><channel>
        <item><title>Indian metro rent shock</title><ht:news_item_title>Bengaluru landlords raise deposits ten months ahead of starter tech pay</ht:news_item_title></item>
      </channel></rss>`, { status: 200 });
    }
    if (urlStr.includes('news.google.com')) {
      const dec = decodeURIComponent(urlStr);
      if (dec.includes('youth jobless') || dec.includes('layoffs')) {
        return new Response(`<rss version="2.0"><channel><item><title>Indian MBAs stand in hours-long queues for few office peon seats - Mint</title></item></channel></rss>`, { status: 200 });
      }
      return new Response(`<rss version="2.0"><channel></channel></rss>`, { status: 200 });
    }
    if (urlStr.includes('api.worldbank.org')) {
      return new Response(JSON.stringify([{ page: 1 }, [{ date: '2025', value: 71.6 }]]), { status: 200 });
    }
    if (urlStr.includes('air-quality-api.open-meteo.com')) {
      return new Response(JSON.stringify({ current: { pm2_5: 55, pm10: 90, european_aqi: 70 } }), { status: 200 });
    }
    if (urlStr.includes('open.er-api.com')) {
      return new Response(JSON.stringify({ rates: { INR: 86.2 } }), { status: 200 });
    }
    if (urlStr.includes('api.cloudflare.com')) {
      const body = JSON.parse(init.body || '{}');
      const userPrompt = body?.messages?.[1]?.content || '';
      if (userPrompt.includes('7 BRAND-NEW, COMPLETELY DIFFERENT')) {
        return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify({ trends: [] }) } }), { status: 200 });
      }
      const match = userPrompt.match(/(?:TODAY'S TRENDING TOPIC|ISSUE \/ ANGLE): "([^"]+)"/);
      if (match) seenPromptSeeds.push(match[1]);

      if (seenPromptSeeds.length === 1) {
        return new Response(JSON.stringify({
          success: true,
          result: {
            response: JSON.stringify({
              topic: 'Instant Indian phone loan app debt trap',
              text: collidingPostText
            })
          }
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        success: true,
        result: {
          response: JSON.stringify({
            topic: 'Indian tech city deposits freeze fresh engineering savers',
            text: 'Fresh tech workers moving to Indian cities hit a harsh math wall: flat starter salaries meet ten-month rent deposits.\n\nWith 71.6% of workers lacking solid safety nets, landlords demand big up-front cash before handing keys to small rooms far from offices. Young engineers spend nearly everything on rooms and crowded travel.\n\nHow do big tech parks expect young Indian builders to save when rent eats every rupee?'
          })
        }
      }), { status: 200 });
    }
    throw new Error(`Unexpected fetch URL: ${urlStr}`);
  };

  try {
    const result = await generateEnglishPost('', '');
    assert.equal(seenPromptSeeds.length, 2, 'Expected 2 AI attempts after duplicate rejection on Attempt 1');
    assert.notEqual(seenPromptSeeds[0], seenPromptSeeds[1], 'Attempt 2 must switch to a new India trend seed after Attempt 1 collision');
    assert.equal(result.topic, 'Indian tech city deposits freeze fresh engineering savers');
  } finally {
    restoreState(snap);
  }
});
