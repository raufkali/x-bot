import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWorldBankIndicator,
  calculateWhoPm25Multiple,
  matchRelevantFactsForTopic,
  formatFactsBrief,
  buildDataDrivenDownsideTopics
} from '../src/integrations/indiaDataService.js';
import { auditDraftForSimplification } from '../src/utils/simpleEnglish.js';
import {
  FALLBACK_BANK,
  createTrendingPostPrompt,
  createCustomTopicPrompt,
  generateEnglishPost,
  generateRomanUrduFromEnglish,
  generatePlainUrduFromEnglish
} from '../src/generator/aiService.js';
import {
  fetchCustomTopicTrends,
  formatCustomTrendsBrief
} from '../src/generator/trendFetcher.js';
import { historyStore } from '../src/db/historyStore.js';
import { whatsappWorkflow } from '../src/whatsapp/workflow.js';
import { config } from '../src/config.js';

const MOCK_SNAPSHOT = {
  fetchedAt: '2026-11-21T18:00:00.000Z',
  macroFacts: [
    {
      factId: 'health_out_of_pocket',
      indicator: 'SH.XPD.OOPC.CH.ZS',
      label: 'Health bills paid straight from family pockets',
      value: 43.89,
      formattedValue: '43.9%',
      year: '2023',
      source: 'World Bank',
      topicAngle: 'One hospital trip can wipe out years of savings for an Indian family',
      effect: 'Families pay nearly half of all medical bills from their own pockets.',
      keywords: ['health', 'hospital', 'doctor', 'medical', 'bill']
    },
    {
      factId: 'youth_unemployment',
      indicator: 'SL.UEM.1524.ZS',
      label: 'Youth jobless rate (ages 15-24)',
      value: 16.02,
      formattedValue: '16.0%',
      year: '2025',
      source: 'World Bank',
      topicAngle: 'Young Indians finish college and still cannot find steady work',
      effect: 'Millions chase rare clerk tests or low-pay gig jobs.',
      keywords: ['job', 'jobs', 'youth', 'college']
    }
  ],
  airQuality: [
    {
      city: 'Delhi',
      pm25: 224,
      pm10: 229,
      usAqi: 211,
      whoMultiple: 14.9,
      time: '2026-11-21T18:00',
      source: 'Open-Meteo Live Air Quality'
    }
  ],
  exchangeRate: {
    usdToInr: 93.37,
    fetchedAt: '2026-11-21T18:00:00.000Z',
    source: 'ExchangeRate-API'
  }
};

test('parseWorldBankIndicator extracts latest non-null India data point', () => {
  const meta = {
    id: 'SH.XPD.OOPC.CH.ZS',
    factId: 'health_out_of_pocket',
    label: 'Health bills paid straight from family pockets',
    unit: '%',
    topicAngle: 'Hospital debt',
    effect: 'Wipes out savings',
    keywords: ['health']
  };
  const payload = [
    { page: 1 },
    [
      { date: '2024', value: null },
      { date: '2023', value: 43.8851 }
    ]
  ];
  const parsed = parseWorldBankIndicator(meta, payload);
  assert.equal(parsed.formattedValue, '43.9%');
  assert.equal(parsed.year, '2023');
  assert.equal(parsed.source, 'World Bank');
});

test('calculateWhoPm25Multiple computes WHO safe-limit multiple accurately', () => {
  assert.equal(calculateWhoPm25Multiple(224), 14.9);
  assert.equal(calculateWhoPm25Multiple(15), 1.0);
  assert.equal(calculateWhoPm25Multiple(0), 0);
});

test('matchRelevantFactsForTopic & formatFactsBrief surface topic-matched live India data', () => {
  const airFacts = matchRelevantFactsForTopic('Delhi toxic air hurting kids', MOCK_SNAPSHOT);
  assert.ok(airFacts.some(f => f.includes('224') && f.includes('14.9 times')));

  const healthBrief = formatFactsBrief('Hospital bills hurting families', MOCK_SNAPSHOT);
  assert.ok(healthBrief.includes('43.9%'));
  assert.ok(healthBrief.includes('93.37'));
});

test('buildDataDrivenDownsideTopics generates non-news downside + effect seeds', () => {
  const topics = buildDataDrivenDownsideTopics(MOCK_SNAPSHOT);
  assert.ok(topics.length >= 4);
  assert.ok(topics.some(t => t.topic.includes('Delhi') && t.topic.includes('14.9 times')));
  assert.ok(topics.some(t => t.topic.includes('₹93')));
});

test('auditDraftForSimplification detects news tone, jargon words, and sub-400 char lengths', () => {
  const newsyJargonDraft = 'According to a new report, deteriorating infrastructure and macroeconomic disparity are adversely impacting India.\n\nFamilies face higher expenditure across urban areas.\n\nWill policy fix this?';
  const res = auditDraftForSimplification(newsyJargonDraft);
  assert.equal(res.needsPolish, true);
  assert.ok(res.reasons.includes('sounds_like_news_report'));
  assert.ok(res.reasons.some(r => r.startsWith('complex_words:')));

  // Simple 3-part draft that is 395 chars (< 400 minimum) must be flagged
  const hook = 'City train fares in India keep eating into worker wages.';
  const question = 'Why do daily commuters pay more for crowded rides?';
  const bodyPad = 'Daily riders spend big money on crowded trains and long waits each week. Poor routes force people to lose hours on broken buses and auto rides every day. Families watch tiny savings shrink every single month while ticket costs climb fast across busy cities and hurt home budgets badly.';
  const exactBodyLen = 395 - hook.length - question.length - 4;
  const draft395 = `${hook}\n\n${bodyPad.slice(0, exactBodyLen)}\n\n${question}`;
  assert.equal(draft395.length, 395);
  const lenRes = auditDraftForSimplification(draft395);
  assert.equal(lenRes.needsPolish, true);
  assert.ok(lenRes.reasons.includes('length_out_of_range:395'));
});

test('Every FALLBACK_BANK entry (English, Roman Urdu, Plain Urdu) is strictly 400-600 chars, simple, and in Pakistani voice about Indians', () => {
  assert.ok(FALLBACK_BANK.length >= 6);
  for (const item of FALLBACK_BANK) {
    const text = item.english.text;
    const audit = auditDraftForSimplification(text);
    assert.equal(audit.needsPolish, false, `Fallback "${item.topic}" failed audit: ${audit.reasons.join(', ')}`);
    assert.ok(text.length >= 400 && text.length <= 600, `English length ${text.length} out of 400-600 for "${item.topic}"`);
    assert.equal(text.includes('#'), false);
    assert.ok(/pakistan/i.test(text), `English fallback "${item.topic}" should reflect Pakistani speaker`);
    assert.ok(/india/i.test(text), `English fallback "${item.topic}" should talk about India/Indians`);

    const ruText = item.romanUrdu?.text || '';
    const puText = item.plainUrdu?.text || '';
    assert.ok(ruText.length >= 400 && ruText.length <= 600, `Roman Urdu length ${ruText.length} out of 400-600 for "${item.topic}"`);
    assert.ok(/pakistan/i.test(ruText), `Roman Urdu fallback "${item.topic}" should reflect Pakistani speaker`);
    assert.ok(/india|bharti/i.test(ruText), `Roman Urdu fallback "${item.topic}" should talk about India/Indians`);

    assert.ok(puText.length >= 400 && puText.length <= 600, `Plain Urdu length ${puText.length} out of 400-600 for "${item.topic}"`);
    assert.ok(puText.includes('پاکستان'), `Plain Urdu fallback "${item.topic}" should reflect Pakistani speaker`);
    assert.ok(puText.includes('بھارت') || puText.includes('بھارتی'), `Plain Urdu fallback "${item.topic}" should talk about India/Indians`);
  }
});

test('Prompt builders embed Pakistani-talking-about-Indians persona, non-news guidance, 400+ minimum, and live data', () => {
  const brief = formatFactsBrief('Delhi air and hospital bills', MOCK_SNAPSHOT);
  const trendingPrompt = createTrendingPostPrompt('Dirty air in Delhi', 'Hurts kids', [], brief);
  assert.ok(trendingPrompt.includes('as a Pakistani talking about Indians'));
  assert.ok(trendingPrompt.includes('DO NOT SOUND LIKE NEWS'));
  assert.ok(trendingPrompt.includes('SIMPLEST POSSIBLE WORDS'));
  assert.ok(trendingPrompt.includes('400+'));
  assert.ok(trendingPrompt.includes('224'));

  const customPrompt = createCustomTopicPrompt('AI writing trending related topic', []);
  assert.ok(customPrompt.includes('Do NOT mention India, Indians, or Pakistan'));
  assert.ok(customPrompt.includes('AI writing trending related topic'));
  assert.ok(customPrompt.includes('400+'));
  assert.equal(customPrompt.includes('as a Pakistani talking about Indians'), false);
});

test('Cloudflare AI 2-pass pipeline polishes jargon/news drafts into 400+ simplest India downside posts', async () => {
  const origToken = process.env.CLOUDFLARE_API_TOKEN;
  const origAcct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const origFetch = globalThis.fetch;
  const savedPosts = [...historyStore.posts];
  historyStore.reset();

  process.env.CLOUDFLARE_API_TOKEN = 'test-cf-token';
  process.env.CLOUDFLARE_ACCOUNT_ID = 'test-cf-account';

  let cfCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes('api.cloudflare.com')) {
      cfCalls++;
      if (cfCalls === 1) {
        return new Response(JSON.stringify({
          success: true,
          result: {
            response: JSON.stringify({
              topic: 'Medical costs hurt Indian families',
              subtopic: 'Out-of-pocket hospital costs',
              category: 'TRENDING',
              text: 'According to a new report, deteriorating public hospital infrastructure hurts Indian families.\n\nWorld Bank expenditure data shows people pay 43.9% of medical bills themselves. Families borrow cash at high rates just to get basic care when someone falls sick at home.\n\nHow long will medical bills keep pushing families into debt?'
            })
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        success: true,
        result: {
          response: JSON.stringify({
            topic: 'Medical bills wipe out Indian family savings',
            subtopic: 'High family health costs in India',
            category: 'TRENDING',
            text: 'One bad hospital visit in India can wipe out years of a family\'s hard-earned cash.\n\nWorld Bank figures show Indians pay almost 44% of all medical bills straight from their own pockets. Weak public clinics lack doctors, beds, and basic tests, forcing parents to borrow money or sell gold just to pay private clinics.\n\nWhy does getting sick still push millions of hardworking Indian homes deep into debt?'
          })
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return origFetch(url);
  };

  try {
    const result = await generateEnglishPost('Hospital bills in India', '', null, true);
    assert.equal(cfCalls, 2, 'Should trigger Pass 2 polish when Pass 1 has news lead or jargon');
    assert.ok(result.provider.includes('Cloudflare Workers AI'));
    assert.ok(result.english.charCount >= 400, `Expected >= 400 chars, got ${result.english.charCount}`);
    const auditAfter = auditDraftForSimplification(result.english.text);
    assert.equal(auditAfter.needsPolish, false, `Polished post should pass audit, got: ${auditAfter.reasons.join(',')}`);
    assert.ok(result.english.text.includes('44%'));
  } finally {
    globalThis.fetch = origFetch;
    if (origToken !== undefined) process.env.CLOUDFLARE_API_TOKEN = origToken; else delete process.env.CLOUDFLARE_API_TOKEN;
    if (origAcct !== undefined) process.env.CLOUDFLARE_ACCOUNT_ID = origAcct; else delete process.env.CLOUDFLARE_ACCOUNT_ID;
    historyStore.posts = savedPosts;
    historyStore.rebuildIndexes();
    historyStore.save();
  }
});

test('Cloudflare AI Pass 2 auto-expands short <400 Pass 1 draft to 400+ chars with CRITICAL LENGTH FIX', async () => {
  const origToken = process.env.CLOUDFLARE_API_TOKEN;
  const origAcct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const origFetch = globalThis.fetch;
  const savedPosts = [...historyStore.posts];
  historyStore.reset();

  process.env.CLOUDFLARE_API_TOKEN = 'test-cf-token';
  process.env.CLOUDFLARE_ACCOUNT_ID = 'test-cf-account';

  let cfCalls = 0;
  let secondPrompt = '';
  const shortDraft = 'Weak local power lines hurt small Indian shops every week.\n\nShops lose hours of cooling and machine time when power cuts hit. Small owners burn costly diesel just to stay open.\n\nWho pays for these daily cuts?';
  assert.ok(shortDraft.length >= 120 && shortDraft.length < 400);

  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('api.cloudflare.com')) {
      cfCalls++;
      const payload = JSON.parse(opts.body);
      const userMsg = payload.messages?.find(m => m.role === 'user')?.content || '';
      if (cfCalls === 1) {
        return new Response(JSON.stringify({
          success: true,
          result: {
            response: JSON.stringify({
              topic: 'Frequent power cuts hurt small Indian shops',
              subtopic: 'Shop losses from power outages',
              category: 'TRENDING',
              text: shortDraft
            })
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      secondPrompt = userMsg;
      const expandedText = 'Weak local power lines hurt small Indian shops and workers every single week.\n\nSmall tailors, milk booths, and cold shops lose hours of work when sudden power cuts hit in hot summer months. Owners must spend hard-earned profits on noisy diesel fuel just to keep lights on and food fresh, while workers still sit idle without fans or steady pay.\n\nHow can small shops grow when basic city power still fails them each day?';
      assert.ok(expandedText.length >= 400);
      return new Response(JSON.stringify({
        success: true,
        result: {
          response: JSON.stringify({
            topic: 'Frequent power cuts hurt small Indian shops',
            subtopic: 'Shop losses from power outages',
            category: 'TRENDING',
            text: expandedText
          })
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return origFetch(url);
  };

  try {
    const result = await generateEnglishPost('Power cuts hurting small Indian shops', '', null, true);
    assert.equal(cfCalls, 2);
    assert.ok(secondPrompt.includes('CRITICAL LENGTH FIX'));
    assert.ok(secondPrompt.includes('PAKISTANI PERSPECTIVE ON INDIANS'));
    assert.ok(result.provider.includes('Cloudflare Workers AI'));
    assert.ok(result.english.charCount >= 400, `Expected >= 400 chars, got ${result.english.charCount}`);
  } finally {
    globalThis.fetch = origFetch;
    if (origToken !== undefined) process.env.CLOUDFLARE_API_TOKEN = origToken; else delete process.env.CLOUDFLARE_API_TOKEN;
    if (origAcct !== undefined) process.env.CLOUDFLARE_ACCOUNT_ID = origAcct; else delete process.env.CLOUDFLARE_ACCOUNT_ID;
    historyStore.posts = savedPosts;
    historyStore.rebuildIndexes();
    historyStore.save();
  }
});

test('Sub-400 AI outputs are strictly rejected instead of posted short (English fallback + Urdu translations)', async () => {
  const origToken = process.env.CLOUDFLARE_API_TOKEN;
  const origAcct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const origGemini = process.env.GEMINI_API_KEY;
  const origXai = process.env.XAI_API_KEY;
  const origGrok = process.env.GROK_API_KEY;
  const origGroq = process.env.GROQ_API_KEY;
  const origFetch = globalThis.fetch;
  const savedPosts = [...historyStore.posts];
  historyStore.reset();

  process.env.CLOUDFLARE_API_TOKEN = 'test-cf-token';
  process.env.CLOUDFLARE_ACCOUNT_ID = 'test-cf-account';
  delete process.env.GEMINI_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.GROK_API_KEY;
  delete process.env.GROQ_API_KEY;

  const alwaysTooShort = 'Bad roads slow Indian goods trucks down.\n\nDrivers waste hours in jams and pay high fuel costs on broken highways every day across busy towns.\n\nWhy do roads still break each monsoon?';
  assert.ok(alwaysTooShort.length >= 120 && alwaysTooShort.length < 400);

  globalThis.fetch = async (url) => {
    if (String(url).includes('api.cloudflare.com')) {
      return new Response(JSON.stringify({
        success: true,
        result: {
          response: JSON.stringify({
            topic: 'Broken highways delay Indian trucks',
            subtopic: 'Road delays raise costs',
            category: 'TRENDING',
            text: alwaysTooShort
          })
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return origFetch(url);
  };

  try {
    // 1. generateEnglishPost must reject Cloudflare <400 output and serve a 400+ FALLBACK_BANK entry
    const engRes = await generateEnglishPost('Broken highways in India', '', null, true);
    assert.equal(engRes.provider, 'Engagement Fallback Bank');
    assert.ok(engRes.english.charCount >= 400);

    // 2. Roman Urdu & Plain Urdu must reject persistently short (<400) drafts when no matching bank entry exists
    await assert.rejects(
      () => generateRomanUrduFromEnglish({ text: 'Custom post not in bank' }, 'Unmatched Topic'),
      /Failed to generate Roman Urdu translation/
    );
    await assert.rejects(
      () => generatePlainUrduFromEnglish({ text: 'Custom post not in bank' }, 'Unmatched Topic'),
      /Failed to generate Plain Urdu translation/
    );

    // 3. Roman Urdu & Plain Urdu auto-expand a short (<400) Pass 1 draft into 400+ when Pass 2 expands
    let ruCall = 0;
    globalThis.fetch = async (url, opts) => {
      if (String(url).includes('api.cloudflare.com')) {
        ruCall++;
        const userMsg = JSON.parse(opts.body).messages?.find(m => m.role === 'user')?.content || '';
        if (ruCall === 1) {
          return new Response(JSON.stringify({
            success: true,
            result: {
              response: JSON.stringify({
                text: 'India mein kharab sarakon se roz kaam rukta hai.\n\nTruck walay ghanton traffic mein phansay rehtay hain aur mehnga tail jalatay hain.\n\nHar barish mein sarak kyon toot jati hai?'
              })
            }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        assert.ok(userMsg.includes('LENGTH FIX'));
        return new Response(JSON.stringify({
          success: true,
          result: {
            response: JSON.stringify({
              text: 'India mein tooti hui sarakain rozana aam logon aur chhotay karobaron ka waqt aur paisa barbaad karti hain.\n\nTruck aur auto driver har roz kharab sarakon par ghanton traffic mein phansay rehtay hain aur zyada tail jalatay hain. Is ka seedha asar sabzi, doodh aur rozmarra cheezon ki qeemat par parta hai jo aam ghar walon ko mehngi milti hain.\n\nHar barish ke baad shehron ki nayi banayi gayi sarakain itni jaldi kyon toot jati hain?'
            })
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return origFetch(url);
    };

    const expandedRu = await generateRomanUrduFromEnglish({ text: 'Custom post not in bank' }, 'Bad Roads');
    assert.equal(ruCall, 2);
    assert.ok(expandedRu.charCount >= 400, `Expected expanded Roman Urdu >= 400 chars, got ${expandedRu.charCount}`);
  } finally {
    globalThis.fetch = origFetch;
    if (origToken !== undefined) process.env.CLOUDFLARE_API_TOKEN = origToken; else delete process.env.CLOUDFLARE_API_TOKEN;
    if (origAcct !== undefined) process.env.CLOUDFLARE_ACCOUNT_ID = origAcct; else delete process.env.CLOUDFLARE_ACCOUNT_ID;
    if (origGemini !== undefined) process.env.GEMINI_API_KEY = origGemini;
    if (origXai !== undefined) process.env.XAI_API_KEY = origXai;
    if (origGrok !== undefined) process.env.GROK_API_KEY = origGrok;
    if (origGroq !== undefined) process.env.GROQ_API_KEY = origGroq;
    historyStore.posts = savedPosts;
    historyStore.rebuildIndexes();
    historyStore.save();
  }
});

test('Direct custom topic ignores India/Pakistan across Cloudflare AI Pass 1/2 and offline fallback', async () => {
  const origToken = process.env.CLOUDFLARE_API_TOKEN;
  const origAcct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const origCfConfigToken = config.cloudflareApiToken;
  const origCfConfigAcct = config.cloudflareAccountId;
  const origFetch = globalThis.fetch;
  const savedPosts = [...historyStore.posts];
  historyStore.reset();

  process.env.CLOUDFLARE_API_TOKEN = 'test-cf-token';
  process.env.CLOUDFLARE_ACCOUNT_ID = 'test-cf-account';

  let cfCalls = 0;
  let capturedSystem = '';
  let capturedPass2Prompt = '';

  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('api.cloudflare.com')) {
      cfCalls++;
      const payload = JSON.parse(opts.body);
      const sysMsg = payload.messages?.find(m => m.role === 'system')?.content || '';
      const userMsg = payload.messages?.find(m => m.role === 'user')?.content || '';
      if (cfCalls === 1) {
        capturedSystem = sysMsg;
        // Pass 1 drifts off-topic by mentioning India even though user asked about AI writing
        return new Response(JSON.stringify({
          success: true,
          result: {
            response: JSON.stringify({
              topic: 'AI writing trending related topic',
              subtopic: 'AI writing trends',
              category: 'CUSTOM_TOPIC',
              text: 'From Pakistan, look at how India uses AI writing tools today.\n\nWriters across India use smart text tools to draft posts fast, yet generic lines sound flat and copy everyone else online without real human thought.\n\nWill AI writing replace real human voices or help them stand out?'
            })
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      capturedPass2Prompt = userMsg;
      return new Response(JSON.stringify({
        success: true,
        result: {
          response: JSON.stringify({
            topic: 'AI writing trends are changing online content fast',
            subtopic: 'Human voice vs generic AI writing trends',
            category: 'CUSTOM_TOPIC',
            text: 'AI writing tools are everywhere online right now, yet readers scroll straight past copycat posts.\n\nMillions of writers and small teams use AI to outline ideas, clean up grammar, and publish faster every week. The real winners pair quick AI drafts with lived stories and plain everyday words instead of flat robotic filler.\n\nDo you read posts that sound machine-made, or do you still look for a real human voice?'
          })
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected external call during custom neutral topic: ${url}`);
  };

  try {
    const res = await generateEnglishPost('Ai writing trending related topic', '', null, true);
    assert.equal(cfCalls, 2, 'Should trigger Pass 2 polish when Pass 1 drifts into India/Pakistan or is short');
    assert.ok(capturedSystem.includes('NEVER mention India, Indians, or Pakistan'));
    assert.ok(capturedPass2Prompt.includes('IGNORE INDIA / PAKISTAN'));
    assert.equal(/\b(india|indian|indians|pakistan|pakistani)\b/i.test(res.english.text), false);
    assert.ok(res.english.charCount >= 400);
    assert.equal(res.category, 'CUSTOM_TOPIC');

    // Now simulate all AI providers offline and confirm Custom Topic Fallback stays strictly on-topic without India/Indians
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    config.cloudflareApiToken = '';
    config.cloudflareAccountId = '';
    const offlineCustom = await generateEnglishPost('Ai writing trending related topic', '', null, true);
    assert.equal(offlineCustom.provider, 'Custom Topic Fallback');
    assert.equal(offlineCustom.category, 'CUSTOM_TOPIC');
    assert.ok(offlineCustom.english.charCount >= 400);
    assert.ok(offlineCustom.english.text.toLowerCase().includes('ai writing'));
    assert.equal(/\b(india|indian|indians|pakistan|pakistani)\b/i.test(offlineCustom.english.text), false);
  } finally {
    globalThis.fetch = origFetch;
    if (origToken !== undefined) process.env.CLOUDFLARE_API_TOKEN = origToken; else delete process.env.CLOUDFLARE_API_TOKEN;
    if (origAcct !== undefined) process.env.CLOUDFLARE_ACCOUNT_ID = origAcct; else delete process.env.CLOUDFLARE_ACCOUNT_ID;
    config.cloudflareApiToken = origCfConfigToken;
    config.cloudflareAccountId = origCfConfigAcct;
    historyStore.posts = savedPosts;
    historyStore.rebuildIndexes();
    historyStore.save();
  }
});

test('WhatsApp directly generates a topic-focused post when owner types custom topic without pressing 3 first', async () => {
  const origToken = process.env.CLOUDFLARE_API_TOKEN;
  const origAcct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const origCfConfigToken = config.cloudflareApiToken;
  const origCfConfigAcct = config.cloudflareAccountId;
  const origOwner = config.ownerPhoneNumber;
  const savedPosts = [...historyStore.posts];
  historyStore.reset();

  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  config.cloudflareApiToken = '';
  config.cloudflareAccountId = '';
  config.ownerPhoneNumber = '923001234567';

  whatsappWorkflow.currentPendingPost = null;
  whatsappWorkflow.status = 'IDLE';
  whatsappWorkflow.menuState = 'DEFAULT';

  try {
    // Greeting still returns welcome menu
    const greetRes = await whatsappWorkflow.handleOwnerReply('Hello there!', config.ownerPhoneNumber);
    assert.equal(greetRes.action, 'GREETING_SENT');

    // Direct custom topic message in WhatsApp immediately generates post for that topic ignoring India/Indians
    const topicRes = await whatsappWorkflow.handleOwnerReply('Ai writing trending related topic', config.ownerPhoneNumber);
    assert.equal(topicRes.success, true);
    assert.equal(topicRes.post.category, 'CUSTOM_TOPIC');
    assert.equal(topicRes.post.topic, 'Ai writing trending related topic');
    assert.ok(topicRes.post.english.charCount >= 400);
    assert.equal(/\b(india|indian|indians|pakistan|pakistani)\b/i.test(topicRes.post.english.text), false);
  } finally {
    whatsappWorkflow.currentPendingPost = null;
    whatsappWorkflow.status = 'IDLE';
    whatsappWorkflow.menuState = 'DEFAULT';
    config.ownerPhoneNumber = origOwner;
    if (origToken !== undefined) process.env.CLOUDFLARE_API_TOKEN = origToken; else delete process.env.CLOUDFLARE_API_TOKEN;
    if (origAcct !== undefined) process.env.CLOUDFLARE_ACCOUNT_ID = origAcct; else delete process.env.CLOUDFLARE_ACCOUNT_ID;
    config.cloudflareApiToken = origCfConfigToken;
    config.cloudflareAccountId = origCfConfigAcct;
    historyStore.posts = savedPosts;
    historyStore.rebuildIndexes();
    historyStore.save();
  }
});

test('Short topic "ai" in WhatsApp triggers direct AI trends post (never generic boilerplate or menu fallback)', async () => {
  const origToken = process.env.CLOUDFLARE_API_TOKEN;
  const origAcct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const origCfConfigToken = config.cloudflareApiToken;
  const origCfConfigAcct = config.cloudflareAccountId;
  const origOwner = config.ownerPhoneNumber;
  const origFetch = globalThis.fetch;
  const savedPosts = [...historyStore.posts];
  historyStore.reset();

  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  config.cloudflareApiToken = '';
  config.cloudflareAccountId = '';
  config.ownerPhoneNumber = '923001234567';

  // Keep network blocked/offline to verify offline AI trends fallback cleanly
  globalThis.fetch = async () => {
    throw new Error('Offline mode');
  };

  whatsappWorkflow.currentPendingPost = null;
  whatsappWorkflow.status = 'IDLE';
  whatsappWorkflow.menuState = 'DEFAULT';

  try {
    // Single 2-letter topic "ai" straight from IDLE must NOT show welcome menu; must write about live AI trends
    const aiRes = await whatsappWorkflow.handleOwnerReply('ai', config.ownerPhoneNumber);
    assert.equal(aiRes.success, true);
    assert.equal(aiRes.post.category, 'CUSTOM_TOPIC');
    assert.equal(aiRes.post.topic, 'ai');
    assert.ok(aiRes.post.english.charCount >= 400 && aiRes.post.english.charCount <= 600);
    assert.equal(auditDraftForSimplification(aiRes.post.english.text).needsPolish, false);
    assert.equal(/people everywhere are talking about/i.test(aiRes.post.english.text), false);
    assert.ok(/\b(agent|agents|coding|model|models|writing)\b/i.test(aiRes.post.english.text));
    assert.equal(/\b(india|indian|indians|pakistan|pakistani)\b/i.test(aiRes.post.english.text), false);

    // Distinct custom topic "The Future of Quantum Computing" must NOT share generic template text with AI
    whatsappWorkflow.currentPendingPost = null;
    whatsappWorkflow.status = 'AWAITING_GENERATE';
    const qRes = await whatsappWorkflow.handleOwnerReply('The Future of Quantum Computing', config.ownerPhoneNumber);
    assert.equal(qRes.success, true);
    assert.ok(qRes.post.english.charCount >= 400 && qRes.post.english.charCount <= 600);
    assert.ok(/quantum/i.test(qRes.post.english.text));
    assert.equal(auditDraftForSimplification(qRes.post.english.text).needsPolish, false);
  } finally {
    globalThis.fetch = origFetch;
    whatsappWorkflow.currentPendingPost = null;
    whatsappWorkflow.status = 'IDLE';
    whatsappWorkflow.menuState = 'DEFAULT';
    config.ownerPhoneNumber = origOwner;
    if (origToken !== undefined) process.env.CLOUDFLARE_API_TOKEN = origToken; else delete process.env.CLOUDFLARE_API_TOKEN;
    if (origAcct !== undefined) process.env.CLOUDFLARE_ACCOUNT_ID = origAcct; else delete process.env.CLOUDFLARE_ACCOUNT_ID;
    config.cloudflareApiToken = origCfConfigToken;
    config.cloudflareAccountId = origCfConfigAcct;
    historyStore.posts = savedPosts;
    historyStore.rebuildIndexes();
    historyStore.save();
  }
});

test('fetchCustomTopicTrends feeds live topic trends into Cloudflare prompt and fallback synthesis', async () => {
  const origToken = process.env.CLOUDFLARE_API_TOKEN;
  const origAcct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const origCfConfigToken = config.cloudflareApiToken;
  const origCfConfigAcct = config.cloudflareAccountId;
  const origFetch = globalThis.fetch;
  const savedPosts = [...historyStore.posts];
  historyStore.reset();

  const mockRssXml = `<?xml version="1.0" encoding="UTF-8"?>
  <rss><channel>
    <item><title>AI coding agents take over multi-step developer workflows - TechCrunch</title></item>
    <item><title>Small fast reasoning models cut enterprise AI bills in half - The Verge</title></item>
    <item><title>India announces local AI festival dates - Example News</title></item>
  </channel></rss>`;

  process.env.CLOUDFLARE_API_TOKEN = 'test-cf-token';
  process.env.CLOUDFLARE_ACCOUNT_ID = 'test-cf-account';

  let capturedPrompt = '';
  globalThis.fetch = async (url, opts) => {
    const urlStr = String(url);
    if (urlStr.includes('news.google.com/rss/search')) {
      return new Response(mockRssXml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
    }
    if (urlStr.includes('api.cloudflare.com')) {
      const payload = JSON.parse(opts.body);
      capturedPrompt = payload.messages?.find(m => m.role === 'user')?.content || '';
      return new Response(JSON.stringify({
        success: true,
        result: {
          response: JSON.stringify({
            topic: 'AI coding agents are shifting daily developer work',
            subtopic: 'Tool-using AI coding agents',
            category: 'CUSTOM_TOPIC',
            text: 'AI coding agents are taking over multi-step software tasks while devs focus on hard design calls.\n\nInstead of only answering chat questions, modern coding tools edit files, run test suites, and fix small bugs cleanly on their own. Teams using these tools ship features faster, yet senior review still catches sneaky logic slips before code goes live.\n\nDo you trust AI agents to touch real project files yet, or keep them in chat?'
          })
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected URL: ${urlStr}`);
  };

  try {
    const items = await fetchCustomTopicTrends('ai');
    assert.equal(items.length, 2, 'Should keep 2 global AI trend items and filter out India mention');
    assert.ok(items[0].title.includes('AI coding agents'));
    const brief = formatCustomTrendsBrief('ai', items);
    assert.ok(brief.includes('LIVE TRENDS RIGHT NOW AROUND "ai"'));

    const aiPost = await generateEnglishPost('ai', '', null, true);
    assert.ok(capturedPrompt.includes('LIVE TRENDS RIGHT NOW AROUND "ai"'));
    assert.ok(capturedPrompt.includes('AI coding agents take over multi-step developer workflows'));
    assert.equal(aiPost.category, 'CUSTOM_TOPIC');
    assert.ok(aiPost.english.charCount >= 400);
    assert.equal(/\b(india|indian|indians|pakistan|pakistani)\b/i.test(aiPost.english.text), false);

    // Arbitrary topic with live RSS headlines while offline should synthesize headline-grounded trend post
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    config.cloudflareApiToken = '';
    config.cloudflareAccountId = '';
    const arbPost = await generateEnglishPost('solid state batteries', '', null, true);
    assert.equal(arbPost.provider, 'Custom Topic Fallback');
    assert.ok(arbPost.english.charCount >= 400 && arbPost.english.charCount <= 600);
    assert.ok(arbPost.english.text.includes('AI coding agents take over multi-step developer workflows'));
  } finally {
    globalThis.fetch = origFetch;
    if (origToken !== undefined) process.env.CLOUDFLARE_API_TOKEN = origToken; else delete process.env.CLOUDFLARE_API_TOKEN;
    if (origAcct !== undefined) process.env.CLOUDFLARE_ACCOUNT_ID = origAcct; else delete process.env.CLOUDFLARE_ACCOUNT_ID;
    config.cloudflareApiToken = origCfConfigToken;
    config.cloudflareAccountId = origCfConfigAcct;
    historyStore.posts = savedPosts;
    historyStore.rebuildIndexes();
    historyStore.save();
  }
});

