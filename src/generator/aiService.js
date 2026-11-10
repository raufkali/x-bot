/**
 * Unified AI Service for X_BOT
 * Supports:
 * - Creating rich, substantial English posts for X
 * - Generating Roman Urdu from English post
 * - Generating Plain Urdu (اردو) from English post
 * - Dual Engine: Groq API (Free) / xAI Grok API (Paid) / Built-in Synthesizer
 */

import Groq from 'groq-sdk';
import { calculateXCharacterCount } from '../utils/validation.js';

// Curated pool of rich, substantial topics for X
export const LONG_TOPICS = [
  {
    topic: 'The 5 Pillars of Global Power by 2035',
    english: {
      text: 'By 2035, global power will not belong to any single superpower. Instead, power will be shared across multiple nations and defined by 5 pillars: ubiquitous AI, digitized money, critical battery minerals replacing oil, resilient food supply chains, and sovereign digital payment rails.',
      hashtags: '#AI #Geopolitics #FutureTech #GlobalPower'
    },
    romanUrdu: {
      text: '2035 tak duniya par kisi aik super-power ka raaj nahi hoga. Mukhtalif mumalik taqat share karenge aur asal ikhtiyar 5 bunyadi cheezon ke gird ghoomay ga: har jagah phaili AI, digital currency, tail ki jagah lenay walay battery minerals, khana aur digital payment systems.',
      hashtags: '#AI #Mustaqbil #Technology #Geopolitics'
    },
    plainUrdu: {
      text: '۲۰۳۵ تک دنیا پر کسی ایک سپر پاور کی اجارہ داری نہیں رہے گی بلکہ طاقت پانچ ستونوں میں تقسیم ہوگی: عام فہم مصنوعی ذہانت، مکمل ڈیجیٹل کرنسی، تیل کا نعم البدل بننے والی نایاب معدنیات، پائیدار غذائی نظام اور خود مختار ڈیجیٹل ادائیگی کے نیٹ ورکس۔',
      hashtags: '#مصنوعی_ذہانت #مستقبل #عالمی_سیاست #ٹیکنالوجی'
    }
  },
  {
    topic: 'How Autonomous AI Agents Transform High-Value Knowledge Work in 2026',
    english: {
      text: 'In 2026, AI is no longer a passive prompt-and-reply tool. Autonomous agents now independently write software, verify security flaws, handle customer logic, and run marketing pipelines. The highest-paid operators are no longer coders, but architects who direct fleets of specialized AI agents.',
      hashtags: '#AIAgents #FutureOfWork #SoftwareEngineering'
    },
    romanUrdu: {
      text: '2026 mein AI ab sirf sawal jawab tak mehdood nahi raha. AI agents ab khud code likh rahay hain, security bugs theek kar rahay hain aur business operations chala rahay hain. Sab se kamyab log wo hain jo AI se darrnay ke bajaye un agents ko lead kar rahay hain.',
      hashtags: '#AIAgents #FutureOfWork #Technology #Urdu'
    },
    plainUrdu: {
      text: '۲۰۲۶ میں مصنوعی ذہانت محض جوابات دینے کا ذریعہ نہیں رہی بلکہ خودکار ایجنٹس خود سافٹ ویئر بنا رہے ہیں، سیکیورٹی نقائص دور کر رہے ہیں اور کاروباری نظام چلا رہے ہیں۔ سب سے کامیاب افراد وہ ہیں جو ان جدید ایجنٹس کے نظام کی نگرانی اور رہنمائی کر رہے ہیں۔',
      hashtags: '#اے_آئی #مستقبل #ٹیکنالوجی #سافٹ_ویئر'
    }
  },
  {
    topic: 'Why Programmable Digital Money is Disrupting Legacy Banking',
    english: {
      text: 'Traditional banking is shackled to 3-day clearing windows, opaque wire fees, and bureaucratic friction. Programmable digital currency settles in seconds across borders with mathematical certainty. The future of global commerce belongs to open, automated financial infrastructure.',
      hashtags: '#FinTech #DigitalFinance #DeFi #FutureOfMoney'
    },
    romanUrdu: {
      text: 'Purana banking nizam abhi tak 3 din ke transfers aur mehangay charges mein phansa hua hai. Jabkay programmable digital currency chand lamhon mein border ke paar transfer ho jati hai. Mustaqbil ki maeeshat ab bankon ke dastakhat par nahi, computer code par chalegi.',
      hashtags: '#FinTech #Paisa #DigitalFinance #Tech'
    },
    plainUrdu: {
      text: 'روایتی بینکاری نظام اب بھی دنوں پر محیط تصدیقی مراحل اور بھاری فیسوں میں الجھا ہوا ہے۔ اس کے برعکس جدید پروگرام ایبل کرنسی سیکنڈوں میں بین الاقوامی سطح پر منتقل ہو جاتی ہے۔ عالمی تجارت کا مستقبل اب خودکار اور شفاف مالیاتی ڈھانچے سے وابستہ ہے۔',
      hashtags: '#ڈیجیٹل_کرنسی #مالیات #معیشت #ٹیکنالوجی'
    }
  },
  {
    topic: 'The Clean Energy Paradigm: From Generation to Grid Battery Storage',
    english: {
      text: 'Generating solar and wind power is now cheaper than fossil fuels. The true technological frontier is long-duration energy storage. Solid-state grid batteries and smart thermal grids are turning intermittent green energy into 24/7 reliable baseload power for the planet.',
      hashtags: '#CleanEnergy #Batteries #Innovation #Sustainability'
    },
    romanUrdu: {
      text: 'Sooraj aur hawa se bijli banana ab tail aur koylay se bhi sasta ho chuka hai. Asal challenge is bijli ko lambay arsay tak store karna hai. Nayi solid-state batteries aur smart grid systems ab din raat sasti aur saaf bijli dastyab kar rahay hain.',
      hashtags: '#CleanEnergy #Technology #Mustaqbil #Urdu'
    },
    plainUrdu: {
      text: 'شمسی اور ہوائی توانائی پیدا کرنا اب روایتی ایندھن سے سستا ہو چکا ہے، اصل معرکہ اس توانائی کو محفوظ بنانا ہے۔ جدید سالڈ اسٹیٹ بیٹریاں اور اسمارٹ گرڈز ماحول دوست توانائی کو بلا تعطل اور ہمہ وقت دستیاب بجلی میں تبدیل کر رہے ہیں۔',
      hashtags: '#توانائی #جدت #ماحول #مستقبل'
    }
  }
];

let topicCounter = 0;

function formatEntry(text, hashtags) {
  const full = hashtags ? `${text}\n\n${hashtags}` : text;
  const count = calculateXCharacterCount(full);
  return {
    text,
    hashtags,
    fullPost: full,
    charCount: count.charCount,
    weightedCount: count.weightedCount,
    isOverLimit: count.isOverLimit
  };
}

/**
 * Generates a rich, substantial English post for X
 * @param {string} [customTopic]
 * @returns {Promise<{ topic: string, english: object, provider: string }>}
 */
export async function generateEnglishPost(customTopic = '') {
  const chosenTopic = customTopic || LONG_TOPICS[topicCounter % LONG_TOPICS.length].topic;
  topicCounter++;

  const xaiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const prompt = `You are a top-tier social media content strategist for X (Twitter).
Create a rich, substantial, and highly engaging post on this topic:
"${chosenTopic}"

RULES:
- Informative opening hook.
- Substantial body explaining key takeaways.
- Include 3-4 relevant hashtags.
- Keep the overall length concise and strictly under 270 characters so it fits comfortably on X.
- Avoid generic AI intro phrases like "In today's world...".

Return ONLY valid JSON:
{
  "topic": "${chosenTopic}",
  "text": "English post text here",
  "hashtags": "#Tag1 #Tag2 #Tag3"
}`;

  if (xaiKey) {
    try {
      const res = await callXai(prompt, 'grok-beta');
      if (res) return { topic: res.topic || chosenTopic, english: formatEntry(res.text, res.hashtags), provider: 'xAI Grok API (Paid)' };
    } catch (e) {
      console.warn(`[Grok API] ${e.message}, falling back...`);
    }
  }

  if (groqKey) {
    try {
      const res = await callGroq(prompt, groqKey);
      if (res) return { topic: res.topic || chosenTopic, english: formatEntry(res.text, res.hashtags), provider: 'Groq Cloud API (Free)' };
    } catch (e) {
      console.warn(`[Groq API] ${e.message}, falling back...`);
    }
  }

  // Built-in high-quality synthesizer
  const found = LONG_TOPICS.find(t => t.topic.toLowerCase() === chosenTopic.toLowerCase()) ||
                LONG_TOPICS[(topicCounter - 1) % LONG_TOPICS.length];

  return {
    topic: chosenTopic,
    english: formatEntry(found.english.text, found.english.hashtags),
    provider: 'Free Engine'
  };
}

/**
 * Regenerates / converts English post into natural Pakistani Roman Urdu
 */
export async function generateRomanUrduFromEnglish(englishPost, topic = '') {
  const xaiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const prompt = `Convert the following English X post into natural Pakistani conversational Roman Urdu (Urdu written in English alphabets):
English Post: "${englishPost.text}"

RULES:
- Use natural Pakistani conversational Urdu (familiar everyday expressions).
- Do not translate word-by-word; convey the full meaning, depth, and punchy hook.
- Include 2-3 relevant hashtags (e.g. #Mustaqbil #Technology #Urdu).
- Keep strictly under 270 characters.

Return ONLY valid JSON:
{
  "text": "Roman Urdu text here",
  "hashtags": "#Tag1 #Tag2"
}`;

  if (xaiKey) {
    try {
      const res = await callXai(prompt, 'grok-beta');
      if (res) return formatEntry(res.text, res.hashtags);
    } catch (_) {}
  }

  if (groqKey) {
    try {
      const res = await callGroq(prompt, groqKey);
      if (res) return formatEntry(res.text, res.hashtags);
    } catch (_) {}
  }

  // Built-in fallback
  const found = LONG_TOPICS.find(t => t.english.text === englishPost.text) ||
                LONG_TOPICS[(topicCounter - 1) % LONG_TOPICS.length];
  return formatEntry(found.romanUrdu.text, found.romanUrdu.hashtags);
}

/**
 * Regenerates / converts English post into proper Plain Urdu script (اردو)
 */
export async function generatePlainUrduFromEnglish(englishPost, topic = '') {
  const xaiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const prompt = `Convert the following English X post into proper, grammatically correct Pakistani Urdu script (اردو):
English Post: "${englishPost.text}"

RULES:
- Proper Urdu script (اردو).
- Maintain original depth, intellectual weight, and natural Pakistani vocabulary.
- Include 2-3 relevant Urdu hashtags (e.g. #ٹیکنالوجی #مستقبل).
- Keep strictly under 270 characters.

Return ONLY valid JSON:
{
  "text": "Plain Urdu script text here",
  "hashtags": "#ٹیگ1 #ٹیگ2"
}`;

  if (xaiKey) {
    try {
      const res = await callXai(prompt, 'grok-beta');
      if (res) return formatEntry(res.text, res.hashtags);
    } catch (_) {}
  }

  if (groqKey) {
    try {
      const res = await callGroq(prompt, groqKey);
      if (res) return formatEntry(res.text, res.hashtags);
    } catch (_) {}
  }

  // Built-in fallback
  const found = LONG_TOPICS.find(t => t.english.text === englishPost.text) ||
                LONG_TOPICS[(topicCounter - 1) % LONG_TOPICS.length];
  return formatEntry(found.plainUrdu.text, found.plainUrdu.hashtags);
}

async function callGroq(prompt, apiKey) {
  const groq = new Groq({ apiKey });
  const model = process.env.AI_MODEL || 'llama-3.3-70b-versatile';

  const completion = await groq.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'You are an expert social media strategist for X.' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7
  });

  const rawJson = completion.choices[0]?.message?.content;
  return JSON.parse(rawJson);
}

async function callXai(prompt, model = 'grok-beta') {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || model,
      messages: [
        { role: 'system', content: 'You are an expert social media strategist for X.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7
    })
  });

  if (!response.ok) throw new Error(`xAI error ${response.status}`);
  const json = await response.json();
  const content = json.choices[0]?.message?.content || '';
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in Grok response');
  return JSON.parse(match[0]);
}
