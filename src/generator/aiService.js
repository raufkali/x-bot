/**
 * Unified AI Service for X_BOT
 * Supports:
 * 1. Free Groq API (console.groq.com - fast, high quality, free tier)
 * 2. Paid xAI Grok API (api.x.ai - grok-beta, grok-2)
 * 3. Free Built-in Trending Synthesizer (instant out-of-the-box fallback)
 */

import Groq from 'groq-sdk';
import { calculateXCharacterCount } from '../utils/validation.js';

// Curated rotation of trending topics for instant auto-generation
export const TRENDING_TOPICS = [
  {
    topic: 'Future of global power by 2035 (AI, data, minerals, food, and digital currency)',
    english: {
      text: 'By 2035, global power will not belong to a single nation. AI will be like electricity, currency digital, and minerals the new oil. The 5 pillars of future power: data, energy, minerals, food, and digital payments.',
      hashtags: '#AI #FutureOfTechnology #GlobalPower'
    },
    romanUrdu: {
      text: '2035 tak duniya par kisi aik mulk ka raaj nahi hoga. AI bijli ki tarah aam hogi, paisa digital hoga, aur minerals naye petrol banenge. Mustaqbil ki taqat 5 cheezon par hogi: data, energy, minerals, khana aur digital payments.',
      hashtags: '#AI #Mustaqbil #Technology'
    },
    plainUrdu: {
      text: '۲۰۳۵ تک دنیا پر صرف ایک ملک کا کنٹرول نہیں ہوگا۔ مصنوعی ذہانت بجلی کی مانند ضروری ہوگی، کرنسی مکمل ڈیجیٹل ہوگی اور معدنیات نئے تیل کی جگہ لیں گی۔ مستقبل کی اصل طاقت پانچ چیزوں پر منحصر ہوگی: ڈیٹا، توانائی، معدنیات، خوراک اور ادائیگی کے نظام۔',
      hashtags: '#AI #مستقبل #ٹیکنالوجی'
    }
  },
  {
    topic: 'Autonomous AI Agents replacing routine knowledge work in 2026',
    english: {
      text: 'AI agents are no longer just chatbots; they now execute workflows, write production code, and manage operations autonomously. The professionals who thrive in 2026 are not competing against AI, but orchestrating teams of specialized agents.',
      hashtags: '#AIAgents #FutureOfWork #TechTrends'
    },
    romanUrdu: {
      text: 'AI agents ab sirf baat cheet tak mehdood nahi rahay, balkay coding, tasks aur business workflows khud handle kar rahay hain. 2026 mein kamyab wahi hoga jo AI se larnay ke bajaye AI agents ki team ko lead karna seekh jaye.',
      hashtags: '#AIAgents #Technology #UrduTech'
    },
    plainUrdu: {
      text: 'مصنوعی ذہانت کے ایجنٹس اب صرف چیٹ بوٹس نہیں رہے بلکہ پیچیدہ کام، کوڈنگ اور کاروباری عمل خود سنبھال رہے ہیں۔ ۲۰۲۶ میں وہی لوگ کامیاب ہوں گے جو اے آئی سے مقابلہ کرنے کے بجائے ان جدید ایجنٹس کی رہنمائی کرنا سیکھیں گے۔',
      hashtags: '#اے_آئی #ٹیکنالوجی #مستقبل'
    }
  },
  {
    topic: 'Decentralized Finance (DeFi) vs Traditional Banking rails',
    english: {
      text: 'Traditional finance operates on 3-day settlement cycles and arbitrary gatekeepers. Programmable money moves in seconds, globally, 24/7. The transition to decentralized financial rails is no longer ideological—it is purely technological efficiency.',
      hashtags: '#FinTech #DeFi #CryptoEconomy'
    },
    romanUrdu: {
      text: 'Purana banking nizam abhi tak 3 din ke transfer par atka hai, jabkay digital currency chand seconds mein dunya bhar mein transfer ho sakti hai. Paisay ka mustaqbil ab banks ki marzi par nahi balkay smart code par chalega.',
      hashtags: '#Paisa #DigitalFinance #TechUrdu'
    },
    plainUrdu: {
      text: 'روایتی بینکاری نظام ابھی تک دنوں میں لین دین کرتا ہے جبکہ جدید ڈیجیٹل فنانس چند سیکنڈز میں دنیا بھر میں کام کرتا ہے۔ مالیاتی نظام کا مستقبل اب پرانے طریقوں پر نہیں بلکہ شفاف اور خودکار ٹیکنالوجی پر منحصر ہے۔',
      hashtags: '#ڈیجیٹل_فنانس #ٹیکنالوجی #معیشت'
    }
  },
  {
    topic: 'Next-Generation Renewable Energy and Grid Storage',
    english: {
      text: 'The biggest bottleneck in clean energy is no longer generation—it is energy storage. Next-gen grid batteries and smart distribution networks are turning renewable energy into steady baseload power faster than projected.',
      hashtags: '#CleanEnergy #Renewables #TechInnovation'
    },
    romanUrdu: {
      text: 'Clean energy ka sab se bara masla ab bijli banana nahi balkay usay mehfooz rakhna (storage) hai. Nayi batteries aur smart grid system ke zariye mustaqbil ki bijli sasti aur har waqt dastyab hogi.',
      hashtags: '#Energy #Mustaqbil #Innovation'
    },
    plainUrdu: {
      text: 'صاف توانائی کا سب سے بڑا چیلنج اب بجلی پیدا کرنا نہیں بلکہ اسے محفوظ رکھنا ہے۔ جدید بیٹری ٹیکنالوجی اور سمارٹ گرڈز مستقبل میں مسلسل اور سستی بجلی کی فراہمی کو یقینی بنا رہے ہیں۔',
      hashtags: '#توانائی #جدید_ٹیکنالوجی #مستقبل'
    }
  }
];

let topicIndex = 0;

/**
 * Builds the prompt required for structured 3-language generation
 */
function buildPrompt(topic) {
  return `You are an expert multilingual social media strategist for X (Twitter).
Convert the following topic into an engaging post for X in 3 versions:
TOPIC: ${topic}

CRITICAL INSTRUCTIONS:
1. ENGLISH: Simple, natural, human tone, strong hook, under 250 characters.
2. ROMAN URDU: Natural Pakistani conversational Urdu in English alphabets, easy everyday vocabulary, under 250 characters.
3. PLAIN URDU: Proper Urdu script (اردو), grammatically correct Pakistani Urdu, under 250 characters.
4. Each version must include 2-3 relevant hashtags.
5. All three must communicate the exact same core message.

Return ONLY a valid JSON object with this exact structure:
{
  "topic": "${topic}",
  "english": {
    "text": "English post body text",
    "hashtags": "#Tag1 #Tag2"
  },
  "romanUrdu": {
    "text": "Roman Urdu post body text",
    "hashtags": "#Tag1 #Tag2"
  },
  "plainUrdu": {
    "text": "Plain Urdu script post body text",
    "hashtags": "#ٹیگ1 #ٹیگ2"
  }
}`;
}

/**
 * Generates multilingual post using available provider
 * Priority:
 * 1. Paid xAI Grok API (if GROK_API_KEY or XAI_API_KEY is present)
 * 2. Free Groq API (if GROQ_API_KEY is present)
 * 3. Free Built-in Synthesizer
 *
 * @param {string} [customTopic]
 * @returns {Promise<{ topic: string, provider: string, english: object, romanUrdu: object, plainUrdu: object }>}
 */
export async function generateMultilingualPost(customTopic = '') {
  const chosenTopic = customTopic || TRENDING_TOPICS[topicIndex % TRENDING_TOPICS.length].topic;
  topicIndex++;

  const xaiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  // 1. Try Paid xAI Grok API if key provided
  if (xaiKey) {
    try {
      const result = await callXaiGrokApi(chosenTopic, xaiKey);
      if (result) return { ...result, provider: 'xAI Grok API (Paid)' };
    } catch (err) {
      console.warn(`[Grok API Warning] ${err.message}. Falling back...`);
    }
  }

  // 2. Try Free Groq API if key provided
  if (groqKey) {
    try {
      const result = await callGroqApi(chosenTopic, groqKey);
      if (result) return { ...result, provider: 'Groq Cloud API (Free Tier)' };
    } catch (err) {
      console.warn(`[Groq API Warning] ${err.message}. Falling back...`);
    }
  }

  // 3. Built-in instant generator (guaranteed to work, zero latency, 100% reliable)
  const item = TRENDING_TOPICS.find(t => t.topic.toLowerCase() === chosenTopic.toLowerCase()) ||
               TRENDING_TOPICS[(topicIndex - 1) % TRENDING_TOPICS.length];

  const formatVersion = (data) => {
    const full = `${data.text}\n\n${data.hashtags}`;
    const counts = calculateXCharacterCount(full);
    return {
      text: data.text,
      hashtags: data.hashtags,
      fullPost: full,
      charCount: counts.charCount,
      weightedCount: counts.weightedCount,
      isOverLimit: counts.isOverLimit
    };
  };

  return {
    topic: chosenTopic,
    provider: 'Free Engine (Instant Multilingual)',
    english: formatVersion(item.english),
    romanUrdu: formatVersion(item.romanUrdu),
    plainUrdu: formatVersion(item.plainUrdu)
  };
}

/**
 * Calls Free Groq Cloud API
 */
async function callGroqApi(topic, apiKey) {
  const groq = new Groq({ apiKey });
  const model = process.env.AI_MODEL || 'llama-3.3-70b-versatile';

  const completion = await groq.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'You are a multilingual social media strategist for X.' },
      { role: 'user', content: buildPrompt(topic) }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 800
  });

  const rawJson = completion.choices[0]?.message?.content;
  if (!rawJson) throw new Error('Empty response from Groq');

  const parsed = JSON.parse(rawJson);
  return formatParsedOutput(topic, parsed);
}

/**
 * Calls Paid xAI Grok API
 */
async function callXaiGrokApi(topic, apiKey) {
  const model = process.env.AI_MODEL || 'grok-beta';

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a multilingual social media strategist for X.' },
        { role: 'user', content: buildPrompt(topic) }
      ],
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`xAI Grok API error ${response.status}: ${errorText}`);
  }

  const json = await response.json();
  const content = json.choices[0]?.message?.content || '';

  // Extract JSON block if surrounded by markdown fences
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse JSON from Grok response');

  const parsed = JSON.parse(jsonMatch[0]);
  return formatParsedOutput(topic, parsed);
}

function formatParsedOutput(topic, parsed) {
  const format = (section) => {
    const text = section?.text || '';
    const hashtags = section?.hashtags || '';
    const full = hashtags ? `${text}\n\n${hashtags}` : text;
    const counts = calculateXCharacterCount(full);
    return {
      text,
      hashtags,
      fullPost: full,
      charCount: counts.charCount,
      weightedCount: counts.weightedCount,
      isOverLimit: counts.isOverLimit
    };
  };

  return {
    topic: parsed.topic || topic,
    english: format(parsed.english),
    romanUrdu: format(parsed.romanUrdu),
    plainUrdu: format(parsed.plainUrdu)
  };
}
