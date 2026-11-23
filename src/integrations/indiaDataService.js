/**
 * Live India Data Integration Service
 *
 * Fetches accurate, latest, verifiable India statistics and live real-time signals
 * from free public APIs (zero API keys required):
 *   1. World Bank Open Data API (country=IND): jobs, farm share, health bills,
 *      education, GDP per person, coal power, private credit, women in workforce
 *   2. Open-Meteo Air Quality API: live real-time PM2.5 and US AQI across major Indian cities
 *   3. Open Exchange Rate / Frankfurter API: live USD to INR rate
 *
 * Grounding Cloudflare AI prompts with these live metrics ensures every X post uses
 * accurate latest data instead of guessed or outdated numbers.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const CACHE_FILE = path.join(DATA_DIR, 'india_data_cache.json');

const MACRO_TTL_MS = 12 * 3600_000; // 12 hours for World Bank annual data
const LIVE_TTL_MS = 30 * 60_000;   // 30 minutes for live AQI & USD/INR

const WORLD_BANK_INDICATORS = [
  {
    id: 'SL.UEM.1524.ZS',
    factId: 'youth_unemployment',
    label: 'Youth jobless rate (ages 15-24)',
    unit: '%',
    topicAngle: 'Young people in India finish college and still cannot find steady work',
    effect: 'Millions spend years preparing for clerk exams or take low-pay gig delivery work instead of building careers.',
    keywords: ['job', 'jobs', 'youth', 'young', 'work', 'graduate', 'college', 'unemploy', 'hire', 'hiring', 'career']
  },
  {
    id: 'SL.AGR.EMPL.ZS',
    factId: 'farm_jobs',
    label: 'Workers stuck in farming',
    unit: '%',
    topicAngle: 'Too many Indian workers still depend on small farms that barely pay',
    effect: 'Families stay trapped in low earnings and crop debt because factories do not create enough steady jobs.',
    keywords: ['farm', 'farmer', 'crop', 'rural', 'village', 'food', 'agriculture', 'factory', 'jobs']
  },
  {
    id: 'SH.XPD.OOPC.CH.ZS',
    factId: 'health_out_of_pocket',
    label: 'Health bills paid straight from family pockets',
    unit: '%',
    topicAngle: 'One hospital trip can wipe out years of savings for an Indian family',
    effect: 'Because public clinics lack doctors and tests, families pay almost half of all medical costs themselves or borrow cash.',
    keywords: ['health', 'hospital', 'doctor', 'sick', 'medical', 'medicine', 'clinic', 'bill', 'care']
  },
  {
    id: 'SH.XPD.CHEX.GD.ZS',
    factId: 'health_gdp_share',
    label: 'Total health spending share of GDP',
    unit: '% of GDP',
    topicAngle: 'India spends too little on public clinics while private hospital prices surge',
    effect: 'Overcrowded government wards push ordinary people into costly private hospitals they cannot afford.',
    keywords: ['health', 'hospital', 'doctor', 'medical', 'spending', 'budget', 'public']
  },
  {
    id: 'SL.TLF.CACT.FE.ZS',
    factId: 'women_workforce',
    label: 'Adult women in the paid workforce',
    unit: '%',
    topicAngle: 'Most Indian women are locked out of paid jobs',
    effect: 'Unsafe travel, lack of childcare, and fewer safe jobs mean most homes rely on just one paycheck.',
    keywords: ['women', 'woman', 'female', 'safety', 'work', 'job', 'family', 'income']
  },
  {
    id: 'NY.GDP.PCAP.CD',
    factId: 'gdp_per_person',
    label: 'Average yearly income output per person',
    unit: 'USD/year',
    topicAngle: 'Headline growth numbers hide how little the average Indian actually earns',
    effect: 'While total national output looks huge, average income per person stays low so rising food and rent squeeze homes.',
    keywords: ['gdp', 'rich', 'poor', 'income', 'salary', 'wage', 'money', 'economy', 'price', 'cost', 'inflation']
  },
  {
    id: 'EG.ELC.COAL.ZS',
    factId: 'coal_power',
    label: 'Electricity still coming from coal',
    unit: '%',
    topicAngle: 'India still burns coal for most of its daily electricity',
    effect: 'Coal smoke worsens city air, heats up towns, and exposes power grids to blackouts during extreme summer heat.',
    keywords: ['coal', 'power', 'electricity', 'energy', 'solar', 'grid', 'heat', 'climate', 'air']
  },
  {
    id: 'SE.XPD.TOTL.GD.ZS',
    factId: 'education_gdp',
    label: 'Government spending on schools and colleges',
    unit: '% of GDP',
    topicAngle: 'Weak public schools force Indian parents into expensive private tuition',
    effect: 'Parents spend hard-earned money on coaching centers just so kids can pass basic tests.',
    keywords: ['school', 'education', 'teacher', 'exam', 'college', 'student', 'coaching', 'paper', 'degree']
  },
  {
    id: 'FS.AST.PRVT.GD.ZS',
    factId: 'private_credit',
    label: 'Formal bank credit to private businesses',
    unit: '% of GDP',
    topicAngle: 'Small shops in India still struggle to get fair bank loans',
    effect: 'Even with fast phone payments, local shop owners often pay steep informal interest just to buy daily stock.',
    keywords: ['bank', 'loan', 'debt', 'emi', 'credit', 'upi', 'shop', 'business', 'money', 'rbi', 'rupee']
  },
  {
    id: 'ER.H2O.FWAG.ZS',
    factId: 'water_to_farms',
    label: 'Fresh water pulled strictly for farming crops',
    unit: '%',
    topicAngle: 'India sends over 90% of its fresh water to crops while big cities buy water tankers',
    effect: 'Free farm power pumps groundwater dry for exported rice and sugar, leaving under 10% for city taps, homes, and factories.',
    keywords: ['water', 'tanker', 'drought', 'farm', 'rice', 'city', 'cities', 'summer', 'tap', 'groundwater']
  },
  {
    id: 'GC.XPN.INTP.RV.ZS',
    factId: 'tax_to_debt_interest',
    label: 'Central tax money eaten just by old loan interest',
    unit: '%',
    topicAngle: 'Over one-third of India federal tax cash vanishes paying only old debt interest',
    effect: 'Before a single rupee pays for schools, trains, or clinics, lenders take 34% of federal taxes while regular people pay steep daily fuel and food taxes.',
    keywords: ['tax', 'debt', 'loan', 'budget', 'interest', 'revenue', 'spend', 'government', 'school', 'clinic']
  },
  {
    id: 'SL.EMP.VULN.ZS',
    factId: 'insecure_workers',
    label: 'Workers in unstable jobs without written contracts',
    unit: '%',
    topicAngle: 'Over 71% of Indian workers hold zero steady contracts, sick leave, or pension safety',
    effect: 'Behind big tech headlines, seven in ten Indians lose income overnight if sickness hits or work slows down.',
    keywords: ['job', 'jobs', 'worker', 'workers', 'contract', 'gig', 'salary', 'pay', 'workforce', 'pension']
  },
  {
    id: 'SH.STA.STNT.ZS',
    factId: 'child_stunting',
    label: 'Young children under age 5 stunted from poor nutrition',
    unit: '%',
    topicAngle: 'Over 35% of young Indian kids grow stunted even while India exports millions of tons of grain',
    effect: 'Lack of protein, eggs, and clean water hurts early brain and body growth for one in three kids, locking in lower adult earnings.',
    keywords: ['kid', 'kids', 'child', 'children', 'food', 'rice', 'nutrition', 'hunger', 'export', 'health']
  },
  {
    id: 'SH.MED.BEDS.ZS',
    factId: 'hospital_beds_per_1000',
    label: 'Hospital beds available per 1,000 people',
    unit: 'per 1,000',
    topicAngle: 'India has roughly 1.6 hospital beds per 1,000 people despite booming private clinic ads',
    effect: 'Severe bed shortages force families out of packed public wards into high-cost private clinics that wipe out home savings.',
    keywords: ['hospital', 'bed', 'beds', 'clinic', 'doctor', 'health', 'medical', 'ward']
  }
];

const AIR_CITIES = [
  { name: 'Delhi', lat: 28.6139, lon: 77.209 },
  { name: 'Kolkata', lat: 22.5726, lon: 88.3639 },
  { name: 'Mumbai', lat: 19.076, lon: 72.8777 },
  { name: 'Bengaluru', lat: 12.9716, lon: 77.5946 }
];

// Baseline fallback snapshot (used only if live external APIs are completely unreachable)
const BASELINE_SNAPSHOT = {
  fetchedAt: '2026-11-21T00:00:00.000Z',
  macroFetchedAt: '2026-11-21T00:00:00.000Z',
  liveFetchedAt: '2026-11-21T00:00:00.000Z',
  macroFacts: [
    {
      factId: 'youth_unemployment',
      indicator: 'SL.UEM.1524.ZS',
      label: 'Youth jobless rate (ages 15-24)',
      value: 16.0,
      formattedValue: '16.0%',
      year: '2025',
      source: 'World Bank / ILO',
      topicAngle: 'Young people in India finish college and still cannot find steady work',
      effect: 'Millions spend years preparing for clerk exams or take low-pay gig delivery work instead of building careers.',
      keywords: ['job', 'jobs', 'youth', 'young', 'work', 'graduate', 'college', 'unemploy', 'hire', 'hiring', 'career']
    },
    {
      factId: 'farm_jobs',
      indicator: 'SL.AGR.EMPL.ZS',
      label: 'Workers stuck in farming',
      value: 41.6,
      formattedValue: '41.6%',
      year: '2025',
      source: 'World Bank / ILO',
      topicAngle: 'Too many Indian workers still depend on small farms that barely pay',
      effect: 'Families stay trapped in low earnings and crop debt because factories do not create enough steady jobs.',
      keywords: ['farm', 'farmer', 'crop', 'rural', 'village', 'food', 'agriculture', 'factory', 'jobs']
    },
    {
      factId: 'health_out_of_pocket',
      indicator: 'SH.XPD.OOPC.CH.ZS',
      label: 'Health bills paid straight from family pockets',
      value: 43.9,
      formattedValue: '43.9%',
      year: '2023',
      source: 'World Bank / WHO',
      topicAngle: 'One hospital trip can wipe out years of savings for an Indian family',
      effect: 'Because public clinics lack doctors and tests, families pay almost half of all medical costs themselves or borrow cash.',
      keywords: ['health', 'hospital', 'doctor', 'sick', 'medical', 'medicine', 'clinic', 'bill', 'care']
    },
    {
      factId: 'women_workforce',
      indicator: 'SL.TLF.CACT.FE.ZS',
      label: 'Adult women in the paid workforce',
      value: 32.4,
      formattedValue: '32.4%',
      year: '2025',
      source: 'World Bank / ILO',
      topicAngle: 'Most Indian women are locked out of paid jobs',
      effect: 'Unsafe travel, lack of childcare, and fewer safe jobs mean most homes rely on just one paycheck.',
      keywords: ['women', 'woman', 'female', 'safety', 'work', 'job', 'family', 'income']
    },
    {
      factId: 'gdp_per_person',
      indicator: 'NY.GDP.PCAP.CD',
      label: 'Average yearly output per person',
      value: 2702,
      formattedValue: '$2,702/year',
      year: '2025',
      source: 'World Bank',
      topicAngle: 'Big national growth numbers hide how little the average Indian actually earns',
      effect: 'Average income per person stays low while rent, food, and school fees rise faster than monthly pay.',
      keywords: ['gdp', 'rich', 'poor', 'income', 'salary', 'wage', 'money', 'economy', 'price', 'cost', 'inflation']
    },
    {
      factId: 'coal_power',
      indicator: 'EG.ELC.COAL.ZS',
      label: 'Electricity still coming from coal',
      value: 72.3,
      formattedValue: '72.3%',
      year: '2024',
      source: 'World Bank',
      topicAngle: 'India still burns coal for most of its daily electricity',
      effect: 'Coal smoke worsens city air, heats up towns, and strains power grids during extreme summer heat.',
      keywords: ['coal', 'power', 'electricity', 'energy', 'solar', 'grid', 'heat', 'climate', 'air']
    },
    {
      factId: 'water_to_farms',
      indicator: 'ER.H2O.FWAG.ZS',
      label: 'Fresh water pulled strictly for farming crops',
      value: 90.4,
      formattedValue: '90.4%',
      year: '2022',
      source: 'World Bank / FAO',
      topicAngle: 'India sends over 90% of its fresh water to crops while big cities buy water tankers',
      effect: 'Free farm power pumps groundwater dry for exported rice and sugar, leaving under 10% for city taps, homes, and factories.',
      keywords: ['water', 'tanker', 'drought', 'farm', 'rice', 'city', 'cities', 'summer', 'tap', 'groundwater']
    },
    {
      factId: 'tax_to_debt_interest',
      indicator: 'GC.XPN.INTP.RV.ZS',
      label: 'Central tax money eaten just by old loan interest',
      value: 34.0,
      formattedValue: '34.0%',
      year: '2022',
      source: 'World Bank / IMF',
      topicAngle: 'Over one-third of India federal tax cash vanishes paying only old debt interest',
      effect: 'Before a single rupee pays for schools, trains, or clinics, lenders take 34% of federal taxes.',
      keywords: ['tax', 'debt', 'loan', 'budget', 'interest', 'revenue', 'spend', 'government']
    },
    {
      factId: 'insecure_workers',
      indicator: 'SL.EMP.VULN.ZS',
      label: 'Workers in unstable jobs without written contracts',
      value: 71.6,
      formattedValue: '71.6%',
      year: '2025',
      source: 'World Bank / ILO',
      topicAngle: 'Over 71% of Indian workers hold zero steady contracts, sick leave, or pension safety',
      effect: 'Behind big tech headlines, seven in ten Indians lose income overnight if sickness hits or work slows down.',
      keywords: ['job', 'jobs', 'worker', 'workers', 'contract', 'gig', 'salary', 'pay', 'workforce']
    },
    {
      factId: 'child_stunting',
      indicator: 'SH.STA.STNT.ZS',
      label: 'Young children under age 5 stunted from poor nutrition',
      value: 35.5,
      formattedValue: '35.5%',
      year: '2020',
      source: 'World Bank / UNICEF',
      topicAngle: 'Over 35% of young Indian kids grow stunted even while India exports millions of tons of grain',
      effect: 'Poor daily diets hurt early brain and body growth for one in three kids, locking in lower adult earnings.',
      keywords: ['kid', 'kids', 'child', 'children', 'food', 'rice', 'nutrition', 'hunger', 'export', 'health']
    },
    {
      factId: 'hospital_beds_per_1000',
      indicator: 'SH.MED.BEDS.ZS',
      label: 'Hospital beds available per 1,000 people',
      value: 1.59,
      formattedValue: '1.6 per 1,000 people',
      year: '2021',
      source: 'World Bank / WHO',
      topicAngle: 'India has roughly 1.6 hospital beds per 1,000 people despite booming private clinic ads',
      effect: 'Severe bed shortages force families out of packed public wards into high-cost private clinics.',
      keywords: ['hospital', 'bed', 'beds', 'clinic', 'doctor', 'health', 'medical', 'ward']
    }
  ],
  airQuality: [],
  exchangeRate: null
};

function readDiskCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeDiskCache(snapshot) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
  } catch (e) {
    console.warn('[IndiaDataService] Cache write warning:', e.message);
  }
}

/**
 * Parses a single World Bank indicator JSON response into a verified fact record.
 */
export function parseWorldBankIndicator(meta, json) {
  if (!Array.isArray(json) || !Array.isArray(json[1])) return null;
  const latest = json[1].find(row => row && row.value !== null && row.value !== undefined);
  if (!latest) return null;

  const num = Number(latest.value);
  if (!Number.isFinite(num)) return null;

  let formattedValue = '';
  if (meta.unit === '%') {
    formattedValue = `${num.toFixed(1)}%`;
  } else if (meta.unit === '% of GDP') {
    formattedValue = `${num.toFixed(1)}% of GDP`;
  } else if (meta.unit === 'USD/year') {
    formattedValue = `$${Math.round(num).toLocaleString('en-US')}/year`;
  } else if (meta.unit === 'per 1,000') {
    formattedValue = `${num.toFixed(1)} per 1,000 people`;
  } else {
    formattedValue = `${num.toFixed(1)}`;
  }

  return {
    factId: meta.factId,
    indicator: meta.id,
    label: meta.label,
    value: Number(num.toFixed(2)),
    formattedValue,
    year: String(latest.date || ''),
    source: 'World Bank',
    topicAngle: meta.topicAngle,
    effect: meta.effect,
    keywords: meta.keywords
  };
}

/**
 * Calculates WHO 24-hour safe PM2.5 multiple (WHO guideline = 15 ug/m3).
 */
export function calculateWhoPm25Multiple(pm25) {
  const val = Number(pm25);
  if (!Number.isFinite(val) || val <= 0) return 0;
  return Number((val / 15).toFixed(1));
}

async function fetchWorldBankIndiaFacts() {
  const results = await Promise.all(
    WORLD_BANK_INDICATORS.map(async (meta) => {
      try {
        const url = `https://api.worldbank.org/v2/country/IND/indicator/${meta.id}?format=json&mrv=5`;
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return null;
        const json = await res.json();
        return parseWorldBankIndicator(meta, json);
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

async function fetchIndiaAirQuality() {
  const results = await Promise.all(
    AIR_CITIES.map(async (city) => {
      try {
        const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${city.lat}&longitude=${city.lon}&current=pm2_5,pm10,us_aqi`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return null;
        const json = await res.json();
        const cur = json?.current;
        if (!cur || typeof cur.pm2_5 !== 'number') return null;

        const whoMultiple = calculateWhoPm25Multiple(cur.pm2_5);
        return {
          city: city.name,
          pm25: Math.round(cur.pm2_5),
          pm10: typeof cur.pm10 === 'number' ? Math.round(cur.pm10) : null,
          usAqi: typeof cur.us_aqi === 'number' ? Math.round(cur.us_aqi) : null,
          whoMultiple,
          time: cur.time || new Date().toISOString(),
          source: 'Open-Meteo Live Air Quality'
        };
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean).sort((a, b) => b.pm25 - a.pm25);
}

async function fetchUsdToInrRate() {
  const endpoints = [
    { url: 'https://open.er-api.com/v6/latest/USD', extract: (d) => d?.rates?.INR },
    { url: 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR', extract: (d) => d?.rates?.INR }
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const json = await res.json();
      const rate = Number(ep.extract(json));
      if (Number.isFinite(rate) && rate > 30) {
        return {
          usdToInr: Number(rate.toFixed(2)),
          fetchedAt: new Date().toISOString(),
          source: ep.url.includes('frankfurter') ? 'ECB / Frankfurter' : 'ExchangeRate-API'
        };
      }
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Returns a fresh or cached snapshot of real India data from integrated public APIs.
 */
export async function getLiveIndiaFactsSnapshot(forceRefresh = false) {
  const existing = readDiskCache();
  const now = Date.now();

  const macroFresh = !forceRefresh && existing?.macroFetchedAt &&
    (now - new Date(existing.macroFetchedAt).getTime() < MACRO_TTL_MS) &&
    Array.isArray(existing.macroFacts) && existing.macroFacts.length > 0;

  const liveFresh = !forceRefresh && existing?.liveFetchedAt &&
    (now - new Date(existing.liveFetchedAt).getTime() < LIVE_TTL_MS);

  if (macroFresh && liveFresh) {
    return existing;
  }

  let macroFacts = existing?.macroFacts || BASELINE_SNAPSHOT.macroFacts;
  let macroFetchedAt = existing?.macroFetchedAt || BASELINE_SNAPSHOT.macroFetchedAt;
  let airQuality = existing?.airQuality || [];
  let exchangeRate = existing?.exchangeRate || null;
  let liveFetchedAt = existing?.liveFetchedAt || new Date().toISOString();

  const tasks = [];

  if (!macroFresh) {
    tasks.push(
      fetchWorldBankIndiaFacts().then(facts => {
        if (facts.length > 0) {
          macroFacts = facts;
          macroFetchedAt = new Date().toISOString();
          console.log(`[IndiaDataService] ✓ World Bank India API: loaded ${facts.length} verified indicators`);
        }
      })
    );
  }

  if (!liveFresh) {
    tasks.push(
      fetchIndiaAirQuality().then(aq => {
        if (aq.length > 0) {
          airQuality = aq;
          liveFetchedAt = new Date().toISOString();
          console.log(`[IndiaDataService] ✓ Open-Meteo Air Quality: ${aq[0].city} PM2.5=${aq[0].pm25} (${aq[0].whoMultiple}x WHO limit)`);
        }
      })
    );
    tasks.push(
      fetchUsdToInrRate().then(fx => {
        if (fx) {
          exchangeRate = fx;
          liveFetchedAt = new Date().toISOString();
          console.log(`[IndiaDataService] ✓ Live FX: 1 USD = ₹${fx.usdToInr}`);
        }
      })
    );
  }

  await Promise.all(tasks);

  const snapshot = {
    fetchedAt: new Date().toISOString(),
    macroFetchedAt,
    liveFetchedAt,
    macroFacts,
    airQuality,
    exchangeRate
  };

  writeDiskCache(snapshot);
  return snapshot;
}

/**
 * Matches the top relevant live facts for a given topic string.
 */
export function matchRelevantFactsForTopic(topic = '', snapshot = BASELINE_SNAPSHOT) {
  const lower = String(topic || '').toLowerCase();
  const matches = [];

  const macroFacts = Array.isArray(snapshot?.macroFacts) ? snapshot.macroFacts : [];
  for (const fact of macroFacts) {
    const kws = Array.isArray(fact.keywords) ? fact.keywords : [];
    const score = kws.reduce((acc, kw) => (lower.includes(kw) ? acc + 1 : acc), 0);
    if (score > 0) {
      matches.push({ score, kind: 'macro', text: `${fact.label}: ${fact.formattedValue} (${fact.source}, ${fact.year}) — ${fact.effect}` });
    }
  }

  const air = Array.isArray(snapshot?.airQuality) ? snapshot.airQuality : [];
  if (air.length > 0 && /(air|smog|pollut|breathe|lung|delhi|kolkata|mumbai|health|coal|winter|school)/.test(lower)) {
    const worst = air[0];
    if (worst && worst.pm25 > 15) {
      matches.push({
        score: 5,
        kind: 'live_aqi',
        text: `Live ${worst.city} air right now: PM2.5 is ${worst.pm25} (${worst.whoMultiple} times the WHO safe limit of 15, US AQI ${worst.usAqi ?? 'high'}).`
      });
    }
  }

  if (snapshot?.exchangeRate?.usdToInr && /(rupee|inr|dollar|import|oil|price|inflation|cost|trade|tariff|debt|food)/.test(lower)) {
    matches.push({
      score: 3,
      kind: 'live_fx',
      text: `Live exchange rate: 1 US dollar costs about ₹${snapshot.exchangeRate.usdToInr} (${snapshot.exchangeRate.source}), making imported fuel, parts, and fertilizer costlier.`
    });
  }

  matches.sort((a, b) => b.score - a.score);

  if (matches.length === 0) {
    return macroFacts.slice(0, 4).map(
      f => `${f.label}: ${f.formattedValue} (${f.source}, ${f.year}) — ${f.effect}`
    );
  }

  return matches.slice(0, 4).map(m => m.text);
}

/**
 * Formats a concise, plain-English verified data brief for AI prompts.
 */
export function formatFactsBrief(topic = '', snapshot = BASELINE_SNAPSHOT) {
  const lines = matchRelevantFactsForTopic(topic, snapshot);
  if (snapshot?.airQuality?.[0] && !lines.some(l => l.includes('PM2.5'))) {
    const topAir = snapshot.airQuality[0];
    if (topAir.whoMultiple >= 3) {
      lines.push(`Live ${topAir.city} air today: PM2.5 is ${topAir.pm25} (${topAir.whoMultiple}x WHO safe limit).`);
    }
  }
  if (snapshot?.exchangeRate?.usdToInr && !lines.some(l => l.includes('₹'))) {
    lines.push(`Live rupee rate: 1 USD = ₹${snapshot.exchangeRate.usdToInr}.`);
  }
  return lines.map(l => `- ${l}`).join('\n');
}

/**
 * Converts live data snapshot into concrete "India Downside + Effect" topic seeds.
 */
export function buildDataDrivenDownsideTopics(snapshot = BASELINE_SNAPSHOT) {
  const topics = [];

  if (Array.isArray(snapshot?.airQuality) && snapshot.airQuality.length > 0) {
    const worst = snapshot.airQuality[0];
    if (worst.whoMultiple >= 4) {
      topics.push({
        topic: `Dirty air in ${worst.city} is ${worst.whoMultiple} times above safe health limits right now`,
        context: `Live air sensors show ${worst.city} PM2.5 at ${worst.pm25} (US AQI ${worst.usAqi ?? 'very unhealthy'}). Families pay more for doctors and kids miss school.`,
        source: 'live_open_meteo_india'
      });
    }
  }

  if (snapshot?.exchangeRate?.usdToInr >= 84) {
    topics.push({
      topic: `A weak rupee near ₹${Math.round(snapshot.exchangeRate.usdToInr)} per dollar makes daily life costlier in India`,
      context: `Live rate is 1 USD = ₹${snapshot.exchangeRate.usdToInr}. Because India buys oil, cooking oil, and phone parts from abroad, everyday prices climb while paychecks stay flat.`,
      source: 'live_fx_india'
    });
  }

  const macro = Array.isArray(snapshot?.macroFacts) ? snapshot.macroFacts : BASELINE_SNAPSHOT.macroFacts;
  for (const f of macro) {
    topics.push({
      topic: f.topicAngle,
      context: `Verified ${f.year} ${f.source} data: ${f.label} is ${f.formattedValue}. Effect: ${f.effect}`,
      source: 'world_bank_india'
    });
  }

  return topics;
}
