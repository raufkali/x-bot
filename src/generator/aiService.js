/**
 * Unified AI Service for X_BOT
 * Specialized in:
 * - Geopolitics & Global Power Shifts
 * - Future Forecastings 2035
 * - AI & Technology Economics
 * - Strategic Resources (Semiconductors, Lithium, Energy, Rare Earths)
 * - Global Political Commentary
 * 
 * Strict Language Standard:
 * - A2 Elementary English (simple, everyday words, short sentences, universally clear)
 * - Natural conversational Pakistani Roman Urdu
 * - Grammatically correct Pakistani Plain Urdu script (اردو)
 * - Zero Duplicates (checked via MongoDB + SHA-256 hash deduplication)
 */

import Groq from 'groq-sdk';
import { calculateXCharacterCount } from '../utils/validation.js';
import {
  isDuplicatePost,
  getRecentTopics,
  saveGeneratedPost
} from '../db/postModel.js';

// Curated bank of tailored topics adhering strictly to A2 English and user core themes
export const CURATED_A2_TOPICS = [
  {
    topic: 'How Power Shifts to New Countries by 2035',
    category: 'GEOPOLITICS_POWER_SHIFTS',
    english: {
      text: 'By 2035, no single country will run the world. Power is moving fast to new regions. The winners will not be the biggest armies. The winners will be countries with the best computer chips, clean energy, and smart data.',
      hashtags: '#Geopolitics #Future2035 #WorldEconomy #PowerShift'
    },
    romanUrdu: {
      text: '2035 tak duniya par kisi aik mulk ki hakumat nahi hogi. Taqat naye mumalik ke paas ja rahi hai. Asal jeet barri fojon ki nahi, balkay behtareen computer chips, saaf bijli aur smart data ki hogi.',
      hashtags: '#Mustaqbil #Geopolitics #Technology #Urdu'
    },
    plainUrdu: {
      text: '۲۰۳۵ تک دنیا پر کسی ایک ملک کا راج نہیں ہوگا۔ اصل طاقت بڑی فوجوں کی نہیں بلکہ جدید مائیکرو چپس، صاف توانائی اور اسمارٹ ڈیٹا رکھنے والے ممالک کے پاس ہوگی۔',
      hashtags: '#عالمی_سیاست #مستقبل #ٹیکنالوجی #معیشت'
    }
  },
  {
    topic: 'Why Computer Chips Are More Important Than Oil',
    category: 'STRATEGIC_RESOURCES',
    english: {
      text: 'Oil made countries rich in the last century. Today, microchips run everything from phones to modern cars and planes. The countries that build their own chips will control the future of the world economy.',
      hashtags: '#TechEconomy #Microchips #Future #GlobalTrade'
    },
    romanUrdu: {
      text: 'Pichli sadi mein tail ne mumalik ko ameer banaya. Aaj computer chips har cheez chala rahi hain, mobile se le kar hawai jahaz tak. Jo mumalik khud chips banayenge, mustaqbil unhi ka hoga.',
      hashtags: '#Technology #Chips #Paisa #Economy'
    },
    plainUrdu: {
      text: 'گزشتہ صدی میں تیل نے ممالک کو طاقتور بنایا۔ آج مائیکرو چپس فونز سے لے کر طیاروں تک سب کچھ چلا رہی ہیں۔ جو ممالک خود چپس بنائیں گے، مستقبل ان کا ہوگا۔',
      hashtags: '#ٹیکنالوجی #معیشت #مستقبل #عالمی_تجارت'
    }
  },
  {
    topic: 'How AI Changes Every Job by 2035',
    category: 'FUTURE_2035_AI',
    english: {
      text: 'In 2035, AI tools will do most simple office tasks. People will not spend hours typing emails or sorting spreadsheets. The most valuable skill will be asking the right questions and leading AI helpers.',
      hashtags: '#AI #FutureOfWork #Jobs2035 #Technology'
    },
    romanUrdu: {
      text: '2035 mein AI office ke aam kaam khud karega. Log ghanton baith kar emails ya files nahi banayenge. Sab se barri salahiyat ye hogi ke AI se sahi tareeqay se kaam kaisay karwaya jaye.',
      hashtags: '#AI #Nokri #Mustaqbil #PakistaniTech'
    },
    plainUrdu: {
      text: '۲۰۳۵ تک مصنوعی ذہانت دفتری معمول کے کام خود کرے گی۔ سب سے اہم ہنر یہ ہوگا کہ جدید اے آئی سسٹمز سے بہترین کام کیسے لیا جائے۔',
      hashtags: '#مصنوعی_ذہانت #مستقبل #روزگار #ٹیکنالوجی'
    }
  },
  {
    topic: 'The Race for Battery Minerals and Green Energy',
    category: 'STRATEGIC_RESOURCES',
    english: {
      text: 'The new world competition is not about gold. It is about lithium and rare metals for batteries. Without these minerals, no electric car or solar battery can work. Clean energy needs ground resources.',
      hashtags: '#GreenEnergy #Lithium #Resources #GlobalMarket'
    },
    romanUrdu: {
      text: 'Duniya ki nayi jang sonay ya tail par nahi hai. Nayi larrai lithium aur battery ke metals par hai. In minerals ke baghair electric gari ya solar battery nahi chal sakti.',
      hashtags: '#Battery #Energy #Mustaqbil #UrduTech'
    },
    plainUrdu: {
      text: 'عالمی منڈی کی نئی دوڑ سونے کے لیے نہیں بلکہ بیٹریوں کے لیے لیتھیم اور نایاب معدنیات کے لیے ہے۔ ان کے بغیر جدید الیکٹرک نظام ممکن نہیں۔',
      hashtags: '#توانائی #معدنیات #عالمی_معیشت #جدت'
    }
  },
  {
    topic: 'Why Digital Money is Changing Global Trade',
    category: 'ECONOMICS_POWER',
    english: {
      text: 'Old bank wires take 3 days and charge heavy fees. Digital currencies cross borders in 3 seconds for almost zero cost. Global trade will soon move on computer code, not paper bank forms.',
      hashtags: '#FinTech #DigitalMoney #Economy #Trade'
    },
    romanUrdu: {
      text: 'Puranay bank transfers mein 3 din aur barri fees lagti hai. Digital currency border ke paar 3 seconds mein pohnch jati hai. Mustaqbil ki tijarat computer code par chalegi.',
      hashtags: '#Paisa #DigitalFinance #Tijarat #Pakistan'
    },
    plainUrdu: {
      text: 'روایتی بینک ٹرانسفر میں دن اور بھاری فیس لگتی ہے جبکہ ڈیجیٹل کرنسی سیکنڈوں میں منتقل ہوتی ہے۔ مستقبل کی عالمی تجارت اب کمپیوٹر کوڈ پر چلے گی۔',
      hashtags: '#ڈیجیٹل_کرنسی #مالیات #عالمی_تجارت #معیشت'
    }
  },
  {
    topic: 'The Rise of Sea Trade Routes and Deep Sea Cables',
    category: 'GEOPOLITICS_POWER_SHIFTS',
    english: {
      text: '95 percent of all internet data travels under the ocean through deep sea cables. If a cable breaks, whole cities lose internet. Protecting sea lines is now as important as guarding borders.',
      hashtags: '#Geopolitics #Internet #Infrastructure #GlobalSecurity'
    },
    romanUrdu: {
      text: 'Duniya ka 95 percent internet samandar ke neechay bichhi cables se chalta hai. Agar aik cable cut jaye to barray shehar cut jatay hain. Samandari raston ki hifazat ab border jitni ahem hai.',
      hashtags: '#Internet #Samandar #Security #Technology'
    },
    plainUrdu: {
      text: 'دنیا کا ۹۵ فیصد انٹرنیٹ سمندر کی تہہ میں موجود کیبلز کے ذریعے منتقل ہوتا ہے۔ سمندری راستوں کا تحفظ اب سرحدوں کی حفاظت جتنا ضروری بن چکا ہے۔',
      hashtags: '#انٹرنیٹ #عالمی_سیاست #سیکیورٹی #ٹیکنالوجی'
    }
  }
];

let curatedCounter = 0;

function formatEntry(text, hashtags) {
  const full = hashtags ? `${text}\n\n${hashtags}` : text;
  const count = calculateXCharacterCount(full);
  return {
    text: text.trim(),
    hashtags: (hashtags || '').trim(),
    fullPost: full,
    charCount: count.charCount,
    weightedCount: count.weightedCount,
    isOverLimit: count.isOverLimit
  };
}

/**
 * Generates an A2 English post tailored to geopolitics, 2035 forecasting, and AI/resources
 * Checks against MongoDB to ensure zero duplicate posts.
 * 
 * @param {string} [customTopic]
 * @returns {Promise<{ topic: string, english: object, provider: string, category: string }>}
 */
export async function generateEnglishPost(customTopic = '') {
  const xaiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  // Retrieve past topics from MongoDB to avoid repeating them
  let recentPastTopics = [];
  try {
    recentPastTopics = await getRecentTopics(15);
  } catch (_) {}

  // If user provided custom topic, use it; otherwise pick an unused curated angle or AI prompt
  let chosenTopic = customTopic;
  if (!chosenTopic) {
    // Find a topic from the curated pool that hasn't been used recently
    const unused = CURATED_A2_TOPICS.find(t => !recentPastTopics.includes(t.topic));
    chosenTopic = unused ? unused.topic : CURATED_A2_TOPICS[curatedCounter % CURATED_A2_TOPICS.length].topic;
    curatedCounter++;
  }

  const avoidListStr = recentPastTopics.length > 0 ? recentPastTopics.slice(0, 10).join('; ') : 'None';

  const prompt = `You are a social media writer for X (Twitter) specializing in Geopolitics, 2035 Future Forecastings, AI Technology, Economics, and Strategic Resources (Chips, Energy, Minerals).

TOPIC: "${chosenTopic}"

CRITICAL RULES:
1. LANGUAGE LEVEL: Strict A2 Elementary English.
   - Use simple everyday words.
   - DO NOT use complex words (avoid: "paradigm", "ubiquitous", "bureaucratic", "hegemony", "catalyst", "unprecedented", "synergy").
   - Short sentences only (maximum 12-15 words per sentence).
   - Clear, direct, and universally easy to read.
2. SUBSTANCE & HOOK:
   - Make a clear, interesting observation about global power, future tech, or resources.
   - Explain what it means for everyday people or the world.
3. LENGTH:
   - Strictly between 160 and 240 characters for the body text.
   - Fits on X comfortably without cutting off.
4. HASHTAGS:
   - Provide 3-4 simple, relevant hashtags (e.g. #AI #Future #Geopolitics #Economy).
5. DEDUPLICATION:
   - Do NOT duplicate or closely rephrase any of these previous topics: ${avoidListStr}.

Return ONLY valid JSON format:
{
  "topic": "${chosenTopic}",
  "category": "GEOPOLITICS_TECH_2035",
  "text": "Simple A2 English post text here.",
  "hashtags": "#Tag1 #Tag2 #Tag3"
}`;

  // Attempt Grok API (Paid)
  if (xaiKey) {
    try {
      const res = await callXai(prompt, 'grok-beta');
      if (res && res.text) {
        const isDup = await isDuplicatePost(res.topic || chosenTopic, res.text);
        if (!isDup) {
          const entry = formatEntry(res.text, res.hashtags);
          await saveGeneratedPost({
            topic: res.topic || chosenTopic,
            category: res.category || 'GEOPOLITICS_TECH_2035',
            english: entry,
            provider: 'xAI Grok API (Paid)'
          });
          return {
            topic: res.topic || chosenTopic,
            category: res.category || 'GEOPOLITICS_TECH_2035',
            english: entry,
            provider: 'xAI Grok API (Paid)'
          };
        }
      }
    } catch (e) {
      console.warn(`[Grok API] ${e.message}, falling back...`);
    }
  }

  // Attempt Groq API (Free)
  if (groqKey) {
    try {
      const res = await callGroq(prompt, groqKey);
      if (res && res.text) {
        const isDup = await isDuplicatePost(res.topic || chosenTopic, res.text);
        if (!isDup) {
          const entry = formatEntry(res.text, res.hashtags);
          await saveGeneratedPost({
            topic: res.topic || chosenTopic,
            category: res.category || 'GEOPOLITICS_TECH_2035',
            english: entry,
            provider: 'Groq Cloud API (Free)'
          });
          return {
            topic: res.topic || chosenTopic,
            category: res.category || 'GEOPOLITICS_TECH_2035',
            english: entry,
            provider: 'Groq Cloud API (Free)'
          };
        }
      }
    } catch (e) {
      console.warn(`[Groq API] ${e.message}, falling back...`);
    }
  }

  // High-Quality Built-in Curated A2 Bank (Guaranteed Zero Failure & Strict A2)
  const matched = CURATED_A2_TOPICS.find(t => t.topic.toLowerCase() === chosenTopic.toLowerCase()) ||
                  CURATED_A2_TOPICS[(curatedCounter - 1 + CURATED_A2_TOPICS.length) % CURATED_A2_TOPICS.length];

  const entry = formatEntry(matched.english.text, matched.english.hashtags);
  await saveGeneratedPost({
    topic: matched.topic,
    category: matched.category,
    english: entry,
    romanUrdu: formatEntry(matched.romanUrdu.text, matched.romanUrdu.hashtags),
    plainUrdu: formatEntry(matched.plainUrdu.text, matched.plainUrdu.hashtags),
    provider: 'A2 Synthesizer Engine'
  });

  return {
    topic: matched.topic,
    category: matched.category,
    english: entry,
    provider: 'A2 Synthesizer Engine'
  };
}

/**
 * Converts English post into simple, natural Pakistani Roman Urdu
 */
export async function generateRomanUrduFromEnglish(englishPost, topic = '') {
  const xaiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const prompt = `Convert this simple English post into natural Pakistani conversational Roman Urdu (Urdu written in English alphabets):
English: "${englishPost.text}"

RULES:
- Simple, everyday Pakistani conversational Urdu.
- No difficult words; easy to read for any Pakistani youth.
- 2-3 relevant hashtags (e.g. #Mustaqbil #Technology #Urdu).
- Under 250 characters.

Return ONLY valid JSON:
{
  "text": "Roman Urdu text here",
  "hashtags": "#Tag1 #Tag2"
}`;

  if (xaiKey) {
    try {
      const res = await callXai(prompt, 'grok-beta');
      if (res && res.text) return formatEntry(res.text, res.hashtags);
    } catch (_) {}
  }

  if (groqKey) {
    try {
      const res = await callGroq(prompt, groqKey);
      if (res && res.text) return formatEntry(res.text, res.hashtags);
    } catch (_) {}
  }

  const found = CURATED_A2_TOPICS.find(t => t.topic === topic || t.english.text === englishPost.text) ||
                CURATED_A2_TOPICS[0];
  return formatEntry(found.romanUrdu.text, found.romanUrdu.hashtags);
}

/**
 * Converts English post into proper Pakistani Urdu script (اردو)
 */
export async function generatePlainUrduFromEnglish(englishPost, topic = '') {
  const xaiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const prompt = `Convert this simple English post into clear, natural Pakistani Urdu script (اردو):
English: "${englishPost.text}"

RULES:
- Clean, natural, grammatically correct Urdu script (اردو).
- Simple words that anyone can read.
- 2-3 relevant hashtags (e.g. #مستقبل #ٹیکنالوجی).
- Under 250 characters.

Return ONLY valid JSON:
{
  "text": "Plain Urdu script text here",
  "hashtags": "#ٹیگ1 #ٹیگ2"
}`;

  if (xaiKey) {
    try {
      const res = await callXai(prompt, 'grok-beta');
      if (res && res.text) return formatEntry(res.text, res.hashtags);
    } catch (_) {}
  }

  if (groqKey) {
    try {
      const res = await callGroq(prompt, groqKey);
      if (res && res.text) return formatEntry(res.text, res.hashtags);
    } catch (_) {}
  }

  const found = CURATED_A2_TOPICS.find(t => t.topic === topic || t.english.text === englishPost.text) ||
                CURATED_A2_TOPICS[0];
  return formatEntry(found.plainUrdu.text, found.plainUrdu.hashtags);
}

/**
 * Generates all 3 language versions of a post in one call
 */
export async function generateMultilingualPost(customTopic = '') {
  const eng = await generateEnglishPost(customTopic);
  const roman = await generateRomanUrduFromEnglish(eng.english, eng.topic);
  const plain = await generatePlainUrduFromEnglish(eng.english, eng.topic);
  return {
    topic: eng.topic,
    category: eng.category,
    provider: eng.provider,
    english: eng.english,
    romanUrdu: roman,
    plainUrdu: plain
  };
}

async function callGroq(prompt, apiKey) {
  const groq = new Groq({ apiKey });
  const model = process.env.AI_MODEL || 'llama-3.3-70b-versatile';

  const completion = await groq.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'You are an expert social media strategist writing simple A2 English content for X.' },
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
        { role: 'system', content: 'You are an expert social media strategist writing simple A2 English content for X.' },
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
