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
  const utcZone = 'UTC';
  const beforeMidnight = new Date('2026-11-23T23:30:00.000Z');
  const afterMidnight = new Date('2026-11-24T00:15:00.000Z'); // Only 45 mins later, but new calendar day

  const cache = {
    fetchedAt: beforeMidnight.toISOString(),
    fetchedDate: getTodayDateKey(beforeMidnight, utcZone),
    trends: [{ topic: 'Sample yesterday trend', category: 'TECH_AI' }]
  };

  assert.equal(
    isCacheValidForToday(cache, new Date('2026-11-23T23:55:00.000Z'), utcZone),
    true,
    'Same calendar date within 3h must remain valid'
  );
  assert.equal(
    isCacheValidForToday(cache, afterMidnight, utcZone),
    false,
    'Cache from yesterday must expire immediately on calendar day rollover'
  );
  assert.equal(
    isCacheValidForToday(cache, new Date('2026-11-23T23:55:00.000Z'), 'UTC') &&
      !isCacheValidForToday(
        { ...cache, fetchedAt: new Date('2026-11-23T19:00:00.000Z').toISOString() },
        beforeMidnight,
        utcZone
      ),
    true,
    'Cache older than 3 hours must also expire'
  );
});

test('RSS parsers extract clean daily multi-category trends and filter sports/noise', () => {
  const sampleGoogleTrendsXml = `<?xml version="1.0" encoding="UTF-8" ?>
    <rss version="2.0" xmlns:ht="https://trends.google.com/trending/rss">
      <channel>
        <item>
          <title>76ers vs Celtics NBA Betting Odds</title>
          <ht:approx_traffic>50,000+</ht:approx_traffic>
          <ht:news_item_title>Best player props for tonight</ht:news_item_title>
        </item>
        <item>
          <title>Power grid transformers</title>
          <ht:approx_traffic>200,000+</ht:approx_traffic>
          <ht:news_item_title>Data center power grid waits delay new AI clusters across states</ht:news_item_title>
        </item>
        <item>
          <title>Ghost job listings</title>
          <ht:approx_traffic>100,000+</ht:approx_traffic>
          <ht:news_item_title>Why ghost job listings keep online applicants waiting months</ht:news_item_title>
        </item>
      </channel>
    </rss>`;

  const parsedTrends = parseGoogleTrendsRss(sampleGoogleTrendsXml, 'US');
  assert.equal(parsedTrends.length, 2, 'Sports betting item should be filtered out');
  assert.equal(parsedTrends[0].category, 'TECH_AI');
  assert.equal(parsedTrends[0].isIndiaTopic, false);
  assert.equal(parsedTrends[1].category, 'WORK_CAREERS');

  const sampleCategoryNewsXml = `<rss version="2.0"><channel>
    <item><title>Medical bills push insured families toward sudden credit debt - Reuters</title></item>
    <item><title>Karunya lottery result today announced - Daily News</title></item>
  </channel></rss>`;

  const parsedNews = parseDailyCategoryRss(sampleCategoryNewsXml, {
    category: 'HEALTH_SOCIETY',
    source: 'daily_rss_health',
    isIndiaTopic: false
  });
  assert.equal(parsedNews.length, 1);
  assert.equal(parsedNews[0].topic, 'Medical bills push insured families toward sudden credit debt');
  assert.equal(parsedNews[0].category, 'HEALTH_SOCIETY');
  assert.equal(classifyTrendCategory('Semiconductor chip tariffs hit hardware prices', ''), 'TECH_AI');
});

test('interleaveTrendsByCategory spreads diverse categories and puts live daily trends ahead of INDIA_DATA', () => {
  const input = [
    ...Array.from({ length: 6 }, (_, i) => ({
      topic: `Static India metric number ${i + 1} for household debt burden`,
      category: 'INDIA_DATA',
      source: 'india_data_service',
      isIndiaTopic: true
    })),
    { topic: 'AI reasoning models trigger multi-year waits for power transformers', category: 'TECH_AI', source: 'daily_rss_tech_ai', isIndiaTopic: false },
    { topic: 'AI agent error math compounds across 20 office workflow steps', category: 'TECH_AI', source: 'google_trends_us', isIndiaTopic: false },
    { topic: 'Ghost job listings and bot screening break entry-level hiring', category: 'WORK_CAREERS', source: 'daily_rss_work', isIndiaTopic: false },
    { topic: 'Digital stablecoin reserves buy tens of billions in government bills', category: 'ECONOMY_MARKETS', source: 'daily_rss_economy', isIndiaTopic: false },
    { topic: 'High healthcare deductibles push working families into medical debt', category: 'HEALTH_SOCIETY', source: 'daily_rss_health', isIndiaTopic: false },
    { topic: 'Dirty air in Delhi slows outdoor construction wages all winter', category: 'INDIA_REALITY', source: 'india_issue_signal', isIndiaTopic: true }
  ];

  const day1 = interleaveTrendsByCategory(input, { daySeed: 0, maxItems: 12 });
  const day2 = interleaveTrendsByCategory(input, { daySeed: 1, maxItems: 12 });

  assert.notEqual(day1[0].category, 'INDIA_DATA', 'Static INDIA_DATA must never hijack slot 0 ahead of live trends');
  assert.notEqual(day1[0].category, day1[1].category, 'Adjacent slots must span different categories');
  assert.notEqual(day1[0].topic, day2[0].topic, 'Different daySeed rotates starting category');

  const formatted = formatTrendsForWhatsApp(day1);
  assert.ok(formatted.includes('Trending Topics'));
  assert.ok(formatted.includes('[Tech & AI]') || formatted.includes('[Jobs & Work]'));
});

test('selectBestUnusedTrend rotates categories and respects seenSeedTopics even when final post topic differs', () => {
  const snap = snapshotState();
  historyStore.reset();

  try {
    const sampleTrends = [
      { topic: 'AI transformer bottleneck slows cloud cluster rollouts', category: 'TECH_AI', source: 'daily_rss_tech_ai', isIndiaTopic: false },
      { topic: 'AI agent 20-step workflow math lowers accuracy below forty percent', category: 'TECH_AI', source: 'daily_rss_tech_ai', isIndiaTopic: false },
      { topic: 'Ghost job ads waste months for online applicants', category: 'WORK_CAREERS', source: 'daily_rss_work', isIndiaTopic: false },
      { topic: 'Medical insurance deductibles drain family savings fast', category: 'HEALTH_SOCIETY', source: 'daily_rss_health', isIndiaTopic: false }
    ];

    // Simulate AI rewriting final topic differently from picked seedTopic
    historyStore.recordSeenTopic(sampleTrends[0].topic, false);
    const pick2 = selectBestUnusedTrend(sampleTrends, [], {
      recentCategories: ['TECH_AI']
    });
    assert.equal(pick2.category, 'WORK_CAREERS', 'Should rotate away from recent TECH_AI category');

    historyStore.recordSeenTopic(pick2.topic, false);
    const pick3 = selectBestUnusedTrend(sampleTrends, [], {
      recentCategories: ['WORK_CAREERS', 'TECH_AI']
    });
    assert.equal(pick3.category, 'HEALTH_SOCIETY', 'Should rotate into unused HEALTH_SOCIETY category');
  } finally {
    restoreState(snap);
  }
});

test('End-to-end daily generation rotates across distinct live trends and categories on every post', async () => {
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

    if (urlStr.includes('trends.google.com/trending/rss?geo=US')) {
      return new Response(`<rss version="2.0" xmlns:ht="https://trends.google.com/trending/rss"><channel>
        <item><title>AI grid bottleneck</title><ht:news_item_title>Power grid delays hold back new AI training clusters</ht:news_item_title></item>
      </channel></rss>`, { status: 200 });
    }
    if (urlStr.includes('trends.google.com/trending/rss?geo=IN')) {
      return new Response(`<rss version="2.0" xmlns:ht="https://trends.google.com/trending/rss"><channel>
        <item><title>Indian commuter costs</title><ht:news_item_title>Daily metro and rent bills squeeze office workers across Indian cities</ht:news_item_title></item>
      </channel></rss>`, { status: 200 });
    }
    if (urlStr.includes('news.google.com/rss/search')) {
      const dec = decodeURIComponent(urlStr);
      if (dec.includes('layoffs') || dec.includes('hiring')) {
        return new Response(`<rss version="2.0"><channel><item><title>Bot screening rejects qualified applicants before human review - WSJ</title></item></channel></rss>`, { status: 200 });
      }
      if (dec.includes('inflation') || dec.includes('cost of living')) {
        return new Response(`<rss version="2.0"><channel><item><title>Silent shrinking packages raise grocery bills faster than shelf tags - Bloomberg</title></item></channel></rss>`, { status: 200 });
      }
      if (dec.includes('healthcare') || dec.includes('medical bills')) {
        return new Response(`<rss version="2.0"><channel><item><title>High clinic deductibles delay checkups until minor issues turn urgent - Reuters</title></item></channel></rss>`, { status: 200 });
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
      if (userPrompt.includes('8 BRAND-NEW, DIVERSE')) {
        return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify({ trends: [] }) } }), { status: 200 });
      }
      capturedPrompts.push(userPrompt);
      aiCallIdx++;
      const drafts = [
        {
          topic: 'Power grid waitlists slow AI labs faster than chips',
          text: 'Everyone talks about fast AI chips, yet old electrical power transformers now control who wins the tech race.\n\nHeavy reasoning models draw giant loads of electricity, while big grid transformers take over three years to build and wire. Rich tech labs stack expensive chips inside dark halls waiting years just for steady wall power.\n\nCould boring grid cables decide future AI leaders faster than chip engineers?'
        },
        {
          topic: 'Bot resume filters reject real builders before humans read them',
          text: 'Online hiring turned into a blind machine wall where automated bots reject 90% of real people before a manager sees them.\n\nApplicants blast out AI resumes at light speed, forcing companies to crank keyword filters so high that strong builders get tossed aside in milliseconds. One short public project link sent straight to a founder now beats two hundred cold forms.\n\nWhen did real human proof start beating clean resumes every single week?'
        },
        {
          topic: 'Shrinking packages quietly hide higher weekly food prices',
          text: 'Walk down any grocery aisle today and prices look calmer only because boxes keep losing grams behind the label.\n\nBrands shave ten percent off cereal weight or swap cheap oil into snacks rather than raising sticker numbers on shelves. Working families still end up buying extra bags midweek and paying much more over a whole month.\n\nWhich everyday kitchen item have you caught shrinking fastest on store shelves?'
        },
        {
          topic: 'High clinic deductibles force families to delay cheap checkups',
          text: 'Big medical deductibles turn tiny treatable sicknesses into massive surprise bills before insurance ever pays one dollar.\n\nMillions of workers skip quick morning doctor visits to save fifty bucks out of pocket, letting small infections grow into late emergency trips costing thousands. Delaying early care quietly raises costs for workers and clinics alike.\n\nDoes a high deductible actually save families money if it makes them wait until emergencies hit?'
        }
      ];
      const chosen = drafts[(aiCallIdx - 1) % drafts.length];
      return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(chosen) } }), { status: 200 });
    }
    throw new Error(`Unexpected fetch URL: ${urlStr}`);
  };

  try {
    const trends = await getTrendingTopics(true);
    assert.ok(trends.length >= 4, 'Should gather multi-source daily trends');

    const generated = [];
    for (let i = 0; i < 4; i++) {
      const post = await generateEnglishPost('', '');
      generated.push(post);
      assert.ok(post.english.charCount >= 400 && post.english.charCount <= 600, `Post ${i + 1} length ${post.english.charCount}`);
    }

    const uniqueTopics = new Set(generated.map(g => g.topic));
    const uniqueSeeds = new Set(generated.map(g => g.seedTopic));
    const uniqueCategories = new Set(generated.map(g => g.trendCategory));

    assert.equal(uniqueTopics.size, 4, 'Four consecutive calls must produce 4 completely different topics');
    assert.equal(uniqueSeeds.size, 4, 'Four consecutive calls must draw 4 distinct seed trends');
    assert.ok(uniqueCategories.size >= 3, `Expected diverse categories across posts, got: ${Array.from(uniqueCategories).join(', ')}`);
    assert.ok(
      capturedPrompts.some(p => p.includes('DAILY TRENDING INSIGHTS ENGINE')),
      'Global non-India daily trends should route through createDailyTrendPostPrompt'
    );
  } finally {
    restoreState(snap);
  }
});

test('Offline consecutive posts and Option 5 never repeat or loop back to FALLBACK_BANK[0]', async () => {
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
    for (let i = 0; i < 10; i++) {
      const post = await generateEnglishPost('', '');
      assert.ok(post.english.charCount >= 400 && post.english.charCount <= 600, `Offline post ${i + 1} charCount=${post.english.charCount}`);
      offlineTopics.push(post.topic);
    }
    const uniqueOffline = new Set(offlineTopics);
    assert.equal(uniqueOffline.size, 10, `Expected 10 unique offline topics, got ${uniqueOffline.size}: ${offlineTopics.join(' | ')}`);

    // Verify WhatsApp Option 5 discards seedTopic & topic and picks another fresh topic
    config.ownerPhoneNumber = '923001234567';
    whatsappWorkflow.currentPendingPost = null;
    const first = await whatsappWorkflow.generateAndSend('', '');
    const retry = await whatsappWorkflow.handleOwnerReply('5', '923001234567');
    assert.ok(retry.post, 'Option 5 must produce a replacement post');
    assert.notEqual(retry.post.topic, first.post.topic, 'Option 5 must change topic');

    // Concurrent calls in offline mode must also stay completely distinct
    const [concA, concB] = await Promise.all([
      generateEnglishPost('', ''),
      generateEnglishPost('', '')
    ]);
    assert.notEqual(concA.topic, concB.topic, 'Concurrent calls must produce distinct topics');
    assert.notEqual(concA.english.text, concB.english.text, 'Concurrent calls must produce distinct bodies');
  } finally {
    restoreState(snap);
  }
});

test('Retry loop switches to a new trend seed on duplicate collision instead of hammering the same trend', async () => {
  const snap = snapshotState();
  historyStore.reset();
  if (fs.existsSync(TRENDS_CACHE_PATH)) fs.unlinkSync(TRENDS_CACHE_PATH);

  const collidingPostText =
    'Giant server halls quietly double household water bills in small towns long before neighbors ever figure out why.\n\n' +
    'Cooling chips pulls millions of gallons of cold city water every hot afternoon, so local water boards raise monthly family rates to pay for bigger pipes, new pumps, and extra treatment tanks across quiet streets.\n\n' +
    'Should rich tech giants pay for town water pipes before building giant new server halls?';

  historyStore.recordPost({
    topic: 'Previously Posted Cooling Water Trap',
    subtopic: 'Server hall water draw vs household bills',
    seedTopic: 'Earlier unrelated seed',
    trendCategory: 'CLIMATE_ENERGY',
    genreId: 'CLIMATE_ENERGY',
    category: 'CLIMATE_ENERGY',
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
    if (urlStr.includes('trends.google.com/trending/rss?geo=US')) {
      return new Response(`<rss version="2.0" xmlns:ht="https://trends.google.com/trending/rss"><channel>
        <item><title>AI chip packaging gap</title><ht:news_item_title>Advanced chip packaging slows global AI server deliveries</ht:news_item_title></item>
      </channel></rss>`, { status: 200 });
    }
    if (urlStr.includes('trends.google.com') || urlStr.includes('news.google.com')) {
      const dec = decodeURIComponent(urlStr);
      if (dec.includes('layoffs') || dec.includes('hiring')) {
        return new Response(`<rss version="2.0"><channel><item><title>Remote engineers report sharp pay gaps across time zones - FT</title></item></channel></rss>`, { status: 200 });
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
      if (userPrompt.includes('8 BRAND-NEW, DIVERSE')) {
        return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify({ trends: [] }) } }), { status: 200 });
      }
      const match = userPrompt.match(/(?:TODAY'S TRENDING TOPIC|ISSUE \/ ANGLE): "([^"]+)"/);
      if (match) seenPromptSeeds.push(match[1]);

      // Attempt 1 intentionally returns an exact duplicate of collidingPostText; Attempt 2 succeeds on a switched seed
      if (seenPromptSeeds.length === 1) {
        return new Response(JSON.stringify({
          success: true,
          result: {
            response: JSON.stringify({
              topic: 'Previously Posted Cooling Water Trap',
              text: collidingPostText
            })
          }
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        success: true,
        result: {
          response: JSON.stringify({
            topic: 'Time-zone pay gaps widen for remote workers worldwide',
            text: 'Remote tech workers doing identical cloud work now see annual pay offers swing 40% based strictly on city zip codes.\n\nEmployers started tightening regional location brackets even when small teams collaborate asynchronously across the exact same codebase every week. Skilled engineers living outside expensive cities earn far less for matching hours.\n\nShould remote salaries reflect real software output delivered or local rent prices?'
          })
        }
      }), { status: 200 });
    }
    throw new Error(`Unexpected fetch URL: ${urlStr}`);
  };

  try {
    const result = await generateEnglishPost('', '');
    assert.equal(seenPromptSeeds.length, 2, 'Expected 2 AI attempts after duplicate rejection on Attempt 1');
    assert.notEqual(seenPromptSeeds[0], seenPromptSeeds[1], 'Attempt 2 must switch to a completely different seed trend after Attempt 1 collision');
    assert.equal(result.topic, 'Time-zone pay gaps widen for remote workers worldwide');
  } finally {
    restoreState(snap);
  }
});

