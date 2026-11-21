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
  generateEnglishPost
} from '../src/generator/aiService.js';
import { historyStore } from '../src/db/historyStore.js';
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

test('auditDraftForSimplification detects news tone and jargon words', () => {
  const newsyJargonDraft = 'According to a new report, deteriorating infrastructure and macroeconomic disparity are adversely impacting India.\n\nFamilies face higher expenditure across urban areas.\n\nWill policy fix this?';
  const res = auditDraftForSimplification(newsyJargonDraft);
  assert.equal(res.needsPolish, true);
  assert.ok(res.reasons.includes('sounds_like_news_report'));
  assert.ok(res.reasons.some(r => r.startsWith('complex_words:')));
});

test('Every FALLBACK_BANK entry passes simplest-words audit, 3-part layout, and 400-580 chars', () => {
  assert.ok(FALLBACK_BANK.length >= 6);
  for (const item of FALLBACK_BANK) {
    const text = item.english.text;
    const audit = auditDraftForSimplification(text);
    assert.equal(audit.needsPolish, false, `Fallback "${item.topic}" failed audit: ${audit.reasons.join(', ')}`);
    assert.ok(text.length >= 400 && text.length <= 580, `Length ${text.length} out of 400-580 for "${item.topic}"`);
    assert.equal(text.includes('#'), false);
    assert.ok(item.romanUrdu?.text?.length > 100);
    assert.ok(item.plainUrdu?.text?.length > 100);
  }
});

test('Prompt builders embed non-news downside+effect guidance and live verified data', () => {
  const brief = formatFactsBrief('Delhi air and hospital bills', MOCK_SNAPSHOT);
  const trendingPrompt = createTrendingPostPrompt('Dirty air in Delhi', 'Hurts kids', [], brief);
  assert.ok(trendingPrompt.includes('DO NOT SOUND LIKE NEWS'));
  assert.ok(trendingPrompt.includes('SIMPLEST POSSIBLE WORDS'));
  assert.ok(trendingPrompt.includes('224'));

  const customPrompt = createCustomTopicPrompt('Hospital bills', [], brief);
  assert.ok(customPrompt.includes('NOT a news report'));
  assert.ok(customPrompt.includes('43.9%'));
});

test('Cloudflare AI 2-pass pipeline polishes jargon/news drafts into simplest India downside posts', async () => {
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
        // Pass 1 intentionally returns newsy + jargon draft to trigger Pass 2 polish
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
      // Pass 2 returns clean, simplest-words non-news polished version
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
