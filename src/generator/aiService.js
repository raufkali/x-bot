/**
 * X-BOT — Trending Topic Content Engine
 *
 * Core Focus:
 * - Researches real trending topics daily and writes viral, engagement-first posts
 * - Uses the SIMPLEST everyday English (a 12-year-old can read it)
 * - 1 or 2 verified numbers anchored in 2025-2026 realities
 * - Zero bias toward any country or region — global, trend-driven content
 *
 * Standards:
 * - English Level: Simplest Everyday English (Sentences 6–14 words, 400–600 chars)
 * - Zero hashtags, zero emojis, no internal labels or bullet lists
 * - Translations: Roman Urdu and Plain Urdu script (اردو) in-place
 * - Strict 6-Stage Anti-Duplication Engine
 * - Up to 5 generation retry attempts before erroring
 */

import https from 'https';
import Groq from 'groq-sdk';
import { config } from '../config.js';
import { calculateXCharacterCount } from '../utils/validation.js';
import {
  SIMPLE_ENGLISH_RULES,
  checkSimpleEnglish,
  auditDraftForSimplification
} from '../utils/simpleEnglish.js';
import {
  getLiveIndiaFactsSnapshot,
  formatFactsBrief
} from '../integrations/indiaDataService.js';
import {
  isDuplicatePost,
  saveGeneratedPost,
  getAllUsedTopics,
  updatePostTranslation
} from '../db/postModel.js';
import {
  historyStore,
  extractPostMetadata,
  computeNormalizedHash
} from '../db/historyStore.js';
import { pickUnusedTrendingTopic, getTrendingTopics } from './trendFetcher.js';

let categoryRotationIndex = 0;

const MIN_CHARACTERS = 400;
const ABSOLUTE_MAX_CHARACTERS = 650;
const TARGET_MIN_CHARACTERS = 400;
const TARGET_MAX_CHARACTERS = 600;

/* =========================================================
   TEXT FORMATTING AND VALIDATION
========================================================= */

/**
 * Splits text into sentences cleanly without splitting on decimal numbers (e.g. 1.5 or 8.7)
 */
export function splitSentences(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(/(?:[^\.!\?۔؟]|\b\d+\.\d+\b)+[\.!\?۔؟]+(?:\s+|$)|.+$/gu);
  return matches ? matches.map(s => s.trim()).filter(Boolean) : [text.trim()];
}

/**
 * Normalizes post layout to strictly guarantee the 3-part layout:
 * Line 1: Single hook line
 * \n\n
 * Paragraph: Real body paragraph with facts and numbers
 * \n\n
 * Line 3: One-line engaging conclusion or closing question
 */
export function normalizePostLayout(text) {
  if (!text || typeof text !== 'string') return '';

  // 1. Remove hashtags and strip common internal AI labels at the start of lines
  let clean = text
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/^[ \t]*(?:Hook|Line 1|Paragraph 1|Part 1|Opening hook|Intro)\s*:\s*/gim, '')
    .replace(/^[ \t]*(?:Body|Paragraph 2|Part 2|Analytical body|Real body)\s*:\s*/gim, '')
    .replace(/^[ \t]*(?:Conclusion|Line 3|Paragraph 3|Part 3|Closing line|Takeaway|Question)\s*:\s*/gim, '')
    .trim();

  // 2. Split into distinct paragraph blocks
  let blocks = clean
    .split(/\n\s*\n/)
    .map(b => b.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (blocks.length === 1) {
    const lines = clean.split(/\n+/).map(l => l.trim()).filter(Boolean);
    if (lines.length >= 3) {
      blocks = [lines[0], lines.slice(1, -1).join(' '), lines[lines.length - 1]];
    } else {
      const allSentences = splitSentences(clean);
      if (allSentences.length >= 3) {
        blocks = [allSentences[0], allSentences.slice(1, -1).join(' '), allSentences[allSentences.length - 1]];
      }
    }
  } else if (blocks.length === 2) {
    const block1 = blocks[0];
    const block2 = blocks[1];
    const sentences = splitSentences(block2);
    if (sentences.length >= 2) {
      const lastSentence = sentences.pop().trim();
      blocks = [block1, sentences.join(' ').trim(), lastSentence];
    }
  } else if (blocks.length > 3) {
    const first = blocks[0];
    const last = blocks[blocks.length - 1];
    const middle = blocks.slice(1, -1).join(' ');
    blocks = [first, middle, last];
  }

  blocks = blocks.map(b => b.replace(/\s+/g, ' ').trim());

  if (blocks.length === 3) {
    const hookSentences = splitSentences(blocks[0]);
    if (hookSentences.length > 1) {
      const firstLineHook = hookSentences[0].trim();
      const remainingHook = hookSentences.slice(1).join(' ').trim();
      blocks[0] = firstLineHook;
      blocks[1] = `${remainingHook} ${blocks[1]}`.trim();
    }

    const conclusionSentences = splitSentences(blocks[2]);
    if (conclusionSentences.length > 1) {
      const lastLineConclusion = conclusionSentences[conclusionSentences.length - 1].trim();
      const earlierConclusion = conclusionSentences.slice(0, -1).join(' ').trim();
      blocks[1] = `${blocks[1]} ${earlierConclusion}`.trim();
      blocks[2] = lastLineConclusion;
    }

    return `${blocks[0]}\n\n${blocks[1]}\n\n${blocks[2]}`;
  }

  return blocks.join('\n\n');
}

function formatEntry(text) {
  const clean = normalizePostLayout(text);

  const count = calculateXCharacterCount(clean);

  return {
    text: clean,
    hashtags: '',
    fullPost: clean,
    charCount: count.charCount,
    weightedCount: count.weightedCount,
    isOverLimit: count.isOverLimit,
    isValidLength:
      count.charCount >= MIN_CHARACTERS &&
      count.charCount <= ABSOLUTE_MAX_CHARACTERS &&
      !count.isOverLimit
  };
}

/**
 * Validates and derives complete analytical metadata from raw AI output
 */
function validateAIResponse(res, chosenTopic, chosenCategory = 'TRENDING', chosenSubtopic = '', minCharacters = MIN_CHARACTERS) {
  if (!res || typeof res !== 'object') {
    throw new Error('Invalid AI response object');
  }

  const rawText = typeof res.text === 'string' ? res.text.trim() : '';
  if (!rawText || rawText.length < 80) {
    throw new Error('AI returned empty or overly short text');
  }

  let entry = formatEntry(rawText);

  // If text is slightly over limit (> 600 chars), smartly trim excess sentences from the body paragraph
  if (entry.charCount > 600) {
    const blocks = entry.text.split(/\n\s*\n/);
    if (blocks.length === 3) {
      const hook = blocks[0];
      const body = blocks[1];
      const conclusion = blocks[2];
      const bodySentences = splitSentences(body);
      while (bodySentences.length > 2 && `${hook}\n\n${bodySentences.join(' ')}\n\n${conclusion}`.length > 600) {
        bodySentences.pop();
      }
      entry = formatEntry(`${hook}\n\n${bodySentences.join(' ')}\n\n${conclusion}`);
    }
  }

  if (entry.isOverLimit || entry.charCount > ABSOLUTE_MAX_CHARACTERS) {
    throw new Error(`AI post exceeds strict 600-char limit (${entry.charCount} chars, max ${ABSOLUTE_MAX_CHARACTERS})`);
  }
  if (entry.charCount < minCharacters) {
    throw new Error(`AI post is too short (${entry.charCount} chars, minimum ${minCharacters}+ required)`);
  }

  const topic = typeof res.topic === 'string' && res.topic.trim() ? res.topic.trim() : chosenTopic;
  const subtopic = typeof res.subtopic === 'string' && res.subtopic.trim() ? res.subtopic.trim() : (chosenSubtopic || topic);
  const category = typeof res.category === 'string' && res.category.trim() ? res.category.trim() : (chosenCategory || 'TRENDING');

  const meta = extractPostMetadata({
    topic,
    subtopic,
    genreId: category,
    category,
    text: entry.text,
    mainSubject: res.mainSubject,
    specificEventOrIssue: res.specificEventOrIssue,
    centralArgument: res.centralArgument,
    analyticalAngle: res.analyticalAngle,
    importantStatistics: res.importantStatistics,
    keywords: res.keywords
  });

  return {
    topic,
    subtopic: meta.subtopic,
    category: meta.genreId,
    genreId: meta.genreId,
    mainSubject: meta.mainSubject,
    specificEventOrIssue: meta.specificEventOrIssue,
    centralArgument: meta.centralArgument,
    analyticalAngle: meta.analyticalAngle,
    importantStatistics: meta.importantStatistics,
    keywords: meta.keywords,
    normalizedText: meta.normalizedText,
    english: entry
  };
}

/* =========================================================
   PROMPT BUILDERS WITH RICH HISTORICAL AVOIDANCE CONTEXT
   (VIRAL, HIGH-IMPACT GEOPOLITICAL & SOCIAL COMMENTARY)
========================================================= */

/* =========================================================
   TREND-BASED POST PROMPT BUILDER
========================================================= */

/**
 * Creates a high-engagement viral post prompt based on a trending topic, biased toward India.
 * Analytical, data-driven, simple everyday English.
 *
 * @param {string} trendTopic - The trending topic title
 * @param {string} trendContext - Why it's trending / key facts
 * @param {string[]} avoidList - Recent posts/topics to avoid repeating
 * @returns {string} Full prompt string
 */
export function createTrendingPostPrompt(trendTopic, trendContext = '', avoidList = [], liveFactsBrief = '') {
  const avoidStr = avoidList.length > 0 ? avoidList.slice(0, 20).join('\n• ') : 'None';

  return `${SIMPLE_ENGLISH_RULES}

# X_BOT — INDIA DOWNSIDES & REAL EFFECTS ENGINE (2025-2026)

ISSUE / ANGLE: "${trendTopic}"
${trendContext ? `WHY IT MATTERS: ${trendContext}` : ''}

VERIFIED LATEST INDIA DATA (USE ONLY THESE REAL NUMBERS OR WIDELY KNOWN OFFICIAL FIGURES — NEVER GUESS NUMBERS):
${liveFactsBrief || '- Use verified 2024-2026 official India numbers (World Bank, RBI, live air sensors).'}

YOUR MISSION: Write the BEST possible X post **as a Pakistani talking about Indians**, exposing this **India downside and its real-world effect on ordinary Indians**:
1. PAKISTANI VOICE ABOUT INDIANS: Sound naturally like a Pakistani looking across the border at India and talking about how everyday Indians actually live behind India's big claims (vary openings naturally: "From Pakistan, you hear...", "Sitting across the border in Pakistan...", "As a Pakistani watching India...", "Here in Pakistan we hear big talk about India..."). Keep it grounded, analytical, and respectful—never abusive.
2. DO NOT SOUND LIKE NEWS: Never write "A new report says", "Today", "Yesterday", "PM X opened", or headline summaries.
3. EXPOSE THE DOWNSIDE & EFFECT: Explain clearly what is broken or unfair in India AND how it hurts everyday Indian families, students, workers, or small shops (lost cash, debt, poor health, wasted years, higher bills).
4. USE THE SIMPLEST POSSIBLE WORDS: Write like you are explaining it to a 12-year-old friend. Short words, short sentences (5-12 words). No academic or business jargon.
5. USE ACCURATE LATEST DATA: Anchor the middle paragraph in 1 or 2 exact numbers from the Verified Latest India Data above.
6. END WITH A SHARP QUESTION: Make people stop and reply with their own view.

STRICT POST STRUCTURE (3 parts, separated by double line breaks \\n\\n):
Line 1: One punchy sentence from a Pakistani perspective exposing this downside facing ordinary Indians (no news intro)
\\n\\n
Paragraph 2: 2-3 short, very simple sentences with accurate latest numbers AND the real effect on everyday Indians (around 50-70 words)
\\n\\n
Line 3: One short, thought-provoking question about India/Indians

LENGTH: Strictly 400+ characters (420 to 560 characters ideal). NEVER under 400 and NEVER exceed 600.
ZERO hashtags. ZERO emojis. NO labels like "Hook:" or "Body:".

TOPICS TO AVOID (do not repeat these angles):
• ${avoidStr}

Return ONLY valid JSON in this exact format:
{
  "topic": "Short plain-English downside headline (not news)",
  "subtopic": "The specific India downside and everyday effect",
  "category": "TRENDING",
  "text": "Hook line\\n\\nBody paragraph with real data and effect\\n\\nClosing question"
}`;
}

/**
 * Creates a post prompt for a user-specified custom topic (ignores trends).
 * @param {string} userTopic - What the user wants to write about
 * @param {string[]} avoidList
 * @param {string} liveFactsBrief
 * @returns {string}
 */
export function createCustomTopicPrompt(userTopic, avoidList = [], liveFactsBrief = '') {
  const avoidStr = avoidList.length > 0 ? avoidList.slice(0, 15).join('\n• ') : 'None';

  return `${SIMPLE_ENGLISH_RULES}

# X_BOT — INDIA DOWNSIDES CUSTOM TOPIC ENGINE (2025-2026)

USER TOPIC: "${userTopic}"

VERIFIED LATEST INDIA DATA (USE WHEN RELEVANT — NEVER GUESS NUMBERS):
${liveFactsBrief || '- Use verified 2024-2026 official India data.'}

Write a sharp, viral X post **as a Pakistani talking about Indians**, focused on "${userTopic}" and its real-world effects inside India:
- Write naturally from a Pakistani point of view looking across the border at ordinary Indians (civil, grounded, zero hate)
- NOT a news report — speak directly about the problem and how it hurts regular Indian people
- Use accurate latest facts and numbers
- Use the SIMPLEST possible words — short sentences, everyday English, zero jargon
- Show the clear cause and effect on Indian families, workers, or young people

STRICT POST STRUCTURE (3 parts, separated by double line breaks \\n\\n):
Line 1: One short hook sentence as a Pakistani talking about "${userTopic}" in India
\\n\\n
Paragraph 2: 2-3 simple sentences with real latest numbers and everyday impact on Indians (around 50-70 words)
\\n\\n
Line 3: A sharp closing question

LENGTH: Strictly 400+ characters (420 to 560 characters ideal). NEVER under 400 and NEVER exceed 600.
ZERO hashtags. ZERO emojis.

AVOID: ${avoidStr}

Return ONLY valid JSON:
{
  "topic": "Short plain-English headline",
  "subtopic": "The downside and effect explored",
  "category": "CUSTOM_TOPIC",
  "text": "Hook\\n\\nBody\\n\\nConclusion"
}`;
}

/* =========================================================
   INDIA-BIASED ANALYTICAL FALLBACK BANK
   High engagement, data-driven, simple everyday English
========================================================= */

export const FALLBACK_BANK = [
  // F1. Youth jobless crisis & wasted years chasing rare clerk posts
  {
    topic: 'Young Indians finish college and still cannot find steady jobs',
    subtopic: '16% youth jobless rate and years lost chasing rare government posts',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'India youth job shortage and gig work trap',
    specificEventOrIssue: 'World Bank 16.0% youth jobless rate and 12M annual job seekers',
    centralArgument: 'Too few steady jobs force millions of young Indians into exam coaching or low-pay gig work',
    analyticalAngle: 'Pakistani perspective on Indian college degrees vs shortage of steady jobs',
    importantStatistics: ['16.0% youth jobless rate', '12 million new job seekers', '2 million steady jobs'],
    keywords: ['Pakistan', 'India', 'Indians', 'youth', 'jobs'],
    english: {
      text: 'From Pakistan, you hear huge claims about India, yet 16% of young Indians ages 15 to 24 still lack steady work.\n\nEach year, 12 million young Indians finish college and hunt for real jobs. Yet factories add under 2 million steady posts. Millions waste years chasing rare clerk tests or ride delivery bikes for tiny daily pay.\n\nWhy do loud growth headlines hide how hard life stays for ordinary young Indians?'
    },
    romanUrdu: { text: 'Pakistan mein baith kar hum India ki taraqqi ke bare daway suntay hain, magar wahan 15 se 24 saal ke 16% nojawan ab bhi be-rozgar hain.\n\nHar saal 1.2 crore Bharti nojawan degree le kar kaam dhoondte hain. Magar karkhanay 20 lakh pakki nokriyan bhi nahi detay. Lakhon nojawan chhoti sarkari poston ke test detay ya delivery bike chalatay hain.\n\nItni bari numayish ke baad bhi aam Bharti nojawanon ke paas pakkay rozgar kyon nahi?' },
    plainUrdu: { text: 'پاکستان میں بیٹھ کر ہم بھارت کی ترقی کے بڑے دعوے سنتے ہیں، مگر وہاں سولہ فیصد نوجوان اب بھی مستقل کام سے محروم ہیں۔\n\nہر سال ایک کروڑ بیس لاکھ بھارتی نوجوان پڑھائی مکمل کر کے نوکری ڈھونڈتے ہیں۔ مگر کارخانے بیس لاکھ پکی نوکریاں بھی نہیں دیتے۔ لاکھوں نوجوان کلرک کے امتحانوں میں برسوں ضائع کرتے یا معمولی اجرت پر ڈیلیوری کرتے ہیں۔\n\nاتنی چمک دمک کے باوجود عام بھارتی نوجوانوں کے لیے اچھا روزگار اتنا مشکل کیوں ہے؟' }
  },

  // F2. Hospital bills wiping out family savings
  {
    topic: 'One hospital trip can wipe out an Indian family savings account',
    subtopic: '43.9% out-of-pocket medical bills pushing Indian families into debt',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'India medical costs and weak public clinics',
    specificEventOrIssue: 'World Bank data showing 43.9% of health costs paid directly by families',
    centralArgument: 'Weak public hospitals force ordinary Indians to borrow money for basic medical care',
    analyticalAngle: 'Pakistani perspective on overcrowded Indian clinics vs private hospital bills',
    importantStatistics: ['43.9% from family pockets', '3.3% GDP health spending'],
    keywords: ['Pakistan', 'India', 'Indians', 'hospital', 'bills'],
    english: {
      text: 'Sitting in Pakistan, it is shocking to see how one hospital trip wipes out an ordinary Indian family.\n\nWorld Bank data shows Indians pay almost 44% of all medical bills from their own pockets. Overcrowded public clinics lack doctors, beds, and tests. Working parents must borrow cash or sell home gold just to pay private clinics.\n\nWhy does getting sick still push millions of everyday Indians deep into debt?'
    },
    romanUrdu: { text: 'Sarhad ke is paar Pakistan se dekhein toh hairat hoti hai ke India mein aik hospital ka kharch aam khandan ki bachat khatam kar deta hai.\n\nWorld Bank ke mutabiq Bharti log ilaj ke taqreeban 44% kharch apni jaib se detay hain. Sarkari clinic mein aksar doctor aur bistar kam par jatay hain, is liye aam waldain ko qarz lena ya sona bechna parta hai.\n\nAik bimari lakhon aam Bharti gharon ko dobara qarz ke bojh mein kyon dhakel deti hai?' },
    plainUrdu: { text: 'سرحد کے اس پار پاکستان سے دیکھیں تو حیرت ہوتی ہے کہ بھارت میں اسپتال کا ایک خرچ کسی بھی عام خاندان کی برسوں کی بچت ختم کر دیتا ہے۔\n\nورلڈ بینک کے مطابق بھارتی شہری علاج کے تقریباً چوالیس فیصد اخراجات خود اپنی جیب سے ادا کرتے ہیں۔ سرکاری کلینکوں میں ڈاکٹر اور بستر کم ہونے پر محنت کش والدین کو مہنگا قرض لینا یا گھر کا سونا بیچنا پڑتا ہے۔\n\nایک بیماری لاکھوں عام بھارتی گھرانوں کو دوبارہ قرض کے بوجھ تلے کیوں دبا دیتی ہے؟' }
  },

  // F3. Dirty air hurting lungs, schools, and wages
  {
    topic: 'Dirty city air in northern India steals Indian health and paychecks',
    subtopic: 'Toxic smog above safe WHO limits hurting Indian children and daily workers',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'Northern India air pollution and Indian family health costs',
    specificEventOrIssue: 'Live PM2.5 readings reaching 15x WHO safe health limits',
    centralArgument: 'Bad air shuts schools, slows outdoor work, and forces Indian families to spend cash on medicine',
    analyticalAngle: 'Pakistani view on shared winter smog hurting Indian cities and daily wages',
    importantStatistics: ['15 times WHO safe limit', '72% coal power'],
    keywords: ['Pakistan', 'India', 'Indians', 'Delhi', 'air'],
    english: {
      text: 'Here in Pakistan we fight smog too, and looking across at northern India shows how bad air steals Indian paychecks.\n\nAir sensors across Delhi often hit levels 15 times worse than safe world limits. Schools shut for weeks, outdoor work stops, and kids fill clinics with bad coughs. Everyday Indians lose wages while buying costly inhalers.\n\nHow can ordinary Indians live well when city air hurts their kids every day?'
    },
    romanUrdu: { text: 'Pakistan mein bhi smog ka masla hai, aur jab hum sarhad paar shumali India ko dekhtay hain toh wahan ki gandi hawa logon ki kamai cheen leti hai.\n\nDelhi ke sensor aksar mehfooz had se 15 guna zyada gandagi dikhatay hain. School hafton band rehtay hain, mazdoori ruk jati hai aur aam Bharti khandanon ki kamai dawai aur doctor par kharch hoti hai.\n\nAam Bharti behtar zindagi kaisay banayein jab bahar ki hawa roz un ke bachon ko bimaar karay?' },
    plainUrdu: { text: 'پاکستان کی طرح سرحد پار شمالی بھارت کے شہروں میں بھی زہریلی ہوا عام لوگوں کی صحت اور روزگار دونوں چھین لیتی ہے۔\n\nدہلی کے فضائی سینسر اکثر محفوظ عالمی حد سے پندرہ گنا زیادہ آلودگی دکھاتے ہیں۔ اسکول کئی ہفتوں تک بند رہتے ہیں، مزدوری سست پڑتی ہے اور عام بھارتی والدین کی محنت کی کمائی بچوں کی دوائی اور ڈاکٹر پر خرچ ہو جاتی ہے۔\n\nعام بھارتی شہری بہتر زندگی کیسے بنائیں جب باہر کی فضا روز ان کے بچوں کو بیمار کرے؟' }
  },

  // F4. Too many workers stuck in tiny farms
  {
    topic: 'Over 41% of Indian workers stay stuck in low-pay farm work',
    subtopic: 'Too few factory jobs trap rural Indians in small earnings',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'India farm dependency and weak factory job growth',
    specificEventOrIssue: 'World Bank 41.6% agriculture employment share in 2025',
    centralArgument: 'Because factories add too few jobs, nearly half of Indian workers remain in low-income farming',
    analyticalAngle: 'Pakistani perspective on high Indian farm headcount vs low family pay',
    importantStatistics: ['41.6% farm workers', '$2,702 yearly output per person'],
    keywords: ['Pakistan', 'India', 'Indians', 'farm', 'workers'],
    english: {
      text: 'As a Pakistani watching India closely, the real gap is seeing over 41% of Indian workers still stuck on tiny farms.\n\nWorld Bank data shows nearly half of India\'s workers rely on small plots that barely pay bills. Cities add too few factory jobs, so one weak rain season or price drop pushes whole villages into loans.\n\nWhy do so many hardworking Indians stay trapped in farm work that cannot pay a fair living?'
    },
    romanUrdu: { text: 'Aik Pakistani ki nazar se India ko dekhein toh sab se bari kami yeh dikhti hai ke 41% se zyada Bharti mazdoor ab bhi chhoti kheti par guzara kartay hain.\n\nWorld Bank ke mutabiq taqreeban aadhi Bharti abadi chhotay kheton se juri hai kyonke shehron mein factory nokriyan kam hain. Aik kamzor barish pooray gaon ko qarz mein dooba deti hai.\n\nItnay mehnat-kash Bharti aise kaam mein kyon phansay hain jo ghar ka kharch bhi poora na karay?' },
    plainUrdu: { text: 'پاکستان سے بھارت کی معیشت کو دیکھیں تو سب سے بڑا خلا یہ نظر آتا ہے کہ اکتالیس فیصد سے زیادہ بھارتی محنت کش آج بھی چھوٹی کھیتی پر گزارا کرتے ہیں۔\n\nورلڈ بینک کے مطابق تقریباً آدھی بھارتی آبادی چھوٹے کھیتوں سے جڑی ہے کیونکہ شہروں میں کارخانوں کی مستقل ملازمتیں بہت کم ہیں۔ ایک کمزور بارش یا فصل سستی ہونے سے پورا گاؤں قرض میں ڈوب جاتا ہے۔\n\nاتنے محنتی بھارتی ایسے کام میں کیوں پھنسے ہیں جو گھر کا خرچ بھی مشکل سے پورا کرے؟' }
  },

  // F5. Women locked out of paid jobs
  {
    topic: 'Two out of three adult women in India are outside paid jobs',
    subtopic: 'Only 32.4% female workforce participation holds back Indian family incomes',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'Low Indian women workforce share and one-paycheck households',
    specificEventOrIssue: 'World Bank 32.4% female labor force rate in 2025',
    centralArgument: 'Unsafe transit and lack of safe nearby jobs leave most Indian families relying on a single paycheck',
    analyticalAngle: 'Pakistani view on India tech image vs low women employment at home',
    importantStatistics: ['32.4% women in paid work', 'two-thirds left out'],
    keywords: ['Pakistan', 'India', 'Indians', 'women', 'jobs'],
    english: {
      text: 'When we discuss India\'s tech image in Pakistan, few notice two in three Indian women stay outside paid jobs.\n\nWorld Bank numbers show only 32% of Indian women work for pay today. Unsafe streets, weak night buses, and costly childcare keep millions of skilled women at home. That leaves most homes relying on just one monthly paycheck.\n\nHow much stronger would Indian families be if women had safe travel and fair work?'
    },
    romanUrdu: { text: 'Pakistan mein jab India ki tech tasveer par baat hoti hai toh kam log dekhtay hain ke wahan teen mein se do jawan khawateen paid nokri se bahar hain.\n\nWorld Bank ke mutabiq aaj sirf 32% Bharti khawateen kamai karti hain. Ghair-mehfooz raste aur kamzor transport lakhon parhi likhi auraton ko ghar bitha detay hain aur bojh aik tankhwah par aata hai.\n\nBharti ghar kitnay mazboot hotay agar wahan khawateen ko mehfooz safar aur barabar kaam milta?' },
    plainUrdu: { text: 'پاکستان میں جب بھارت کی جدید تصویر پر بات ہوتی ہے تو کم لوگ دیکھتے ہیں کہ وہاں تین میں سے دو بالغ خواتین تنخواہ والی ملازمت سے باہر ہیں۔\n\nورلڈ بینک کے مطابق آج صرف بتیس فیصد بھارتی خواتین روزگار سے جڑی ہیں۔ غیر محفوظ راستوں اور کمزور ٹرانسپورٹ کی وجہ سے لاکھوں تعلیم یافتہ خواتین گھر بیٹھنے پر مجبور ہیں اور پورا بوجھ ایک تنخواہ پر آتا ہے۔\n\nبھارتی گھرانے کتنے مضبوط ہوتے اگر وہاں خواتین کو محفوظ سفر اور مناسب روزگار ملتا؟' }
  },

  // F6. Low average pay and rising family loans
  {
    topic: 'Big growth headlines hide how little the average Indian earns',
    subtopic: '$2,702 yearly output per person and rising monthly Indian family loans',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'Low Indian per-person earnings vs rising living costs and retail loans',
    specificEventOrIssue: 'World Bank $2,702 GDP per person in 2025 alongside rising household debt',
    centralArgument: 'Headline growth masks flat Indian family incomes, pushing city homes into monthly loans for groceries',
    analyticalAngle: 'Pakistani perspective on big India GDP numbers vs average Indian pay',
    importantStatistics: ['$2,702 per person', '₹93 per dollar import pressure'],
    keywords: ['Pakistan', 'India', 'Indians', 'income', 'loans'],
    english: {
      text: 'From Pakistan, India\'s big GDP headlines look huge, yet they hide how little the average Indian still earns.\n\nWorld Bank figures put yearly output at just $2,702 per person across India. Yet city rent, milk, cooking oil, and school fees climb while office pay stalls. More Indian families now use quick phone loans just for groceries.\n\nIs India\'s boom built on real pay, or on ordinary Indians borrowing tomorrow\'s cash?'
    },
    romanUrdu: { text: 'Pakistan se India ki bari maashi surkhiyan bohat baray nazar aati hain, magar yeh chhupa leti hain ke aam Bharti aaj bhi kitna kam kamata hai.\n\nWorld Bank ke mutabiq India mein fi kas salana paidawar sirf 2,702 dollar hai. Magar shehr ka kiraya, doodh aur school fees barh rahi hain, jis se aam log rashan ke liye bhi phone se chhotay qarz le rahay hain.\n\nKya India ki khareedari barhti kamai se chal rahi hai ya aam log kal ka paisa udhar le rahay hain?' },
    plainUrdu: { text: 'پاکستان سے بھارت کے بڑے معاشی اعداد بہت شاندار لگتے ہیں، مگر یہ چھپا لیتے ہیں کہ عام بھارتی آج بھی کتنا کم کماتا ہے۔\n\nورلڈ بینک کے مطابق بھارت میں فی کس سالانہ پیداوار صرف دو ہزار سات سو دو ڈالر ہے۔ دوسری طرف کرایہ، دودھ اور اسکول فیس مسلسل بڑھ رہی ہے، جس سے عام بھارتی گھرانے روزمرہ راشن کے لیے بھی چھوٹے قرضے لے رہے ہیں۔\n\nکیا بھارت کی خریداری بڑھتی آمدنی سے چل رہی ہے یا عام لوگ کل کا پیسہ ادھار لے رہے ہیں؟' }
  }
];

export const CURATED_STORY_TOPICS = FALLBACK_BANK;


/* =========================================================
   DYNAMIC FALLBACK ENGINE — ENGAGEMENT TRENDING VERSION
========================================================= */

function generateDynamicFallback(category = 'TRENDING', subtopic = '', excludedTopic = '', avoidList = []) {
  const cleanExcluded = String(excludedTopic || '').toLowerCase().trim();
  const avoidCombined = avoidList.map(a => String(a).toLowerCase());

  const formatCandidate = (item, assignedCat) => ({
    topic: item.topic,
    subtopic: item.subtopic || subtopic || item.topic,
    category: assignedCat || item.category || 'TRENDING',
    genreId: assignedCat || item.genreId || 'TRENDING',
    mainSubject: item.mainSubject,
    specificEventOrIssue: item.specificEventOrIssue,
    centralArgument: item.centralArgument,
    analyticalAngle: item.analyticalAngle,
    importantStatistics: item.importantStatistics,
    keywords: item.keywords,
    english: formatEntry(item.english.text),
    romanUrdu: item.romanUrdu ? formatEntry(item.romanUrdu.text) : null,
    plainUrdu: item.plainUrdu ? formatEntry(item.plainUrdu.text) : null
  });

  for (const item of FALLBACK_BANK) {
    const isExcluded = cleanExcluded && (
      item.topic.toLowerCase().trim() === cleanExcluded ||
      (item.subtopic && item.subtopic.toLowerCase().trim() === cleanExcluded)
    );
    if (isExcluded) continue;

    if (avoidCombined.some(a => a.includes(item.topic.toLowerCase()) || (item.subtopic && a.includes(item.subtopic.toLowerCase())))) {
      continue;
    }

    if (historyStore.hasSeenTopic(item.topic)) {
      continue;
    }

    const itemHash = computeNormalizedHash(item.english.text).toLowerCase();
    if (historyStore.inFlightLocks && historyStore.inFlightLocks.has(itemHash)) {
      continue;
    }

    const simpleErr = checkSimpleEnglish(item.english.text);
    if (simpleErr) {
      continue;
    }

    const dupCheck = historyStore.isDuplicateOrSimilar(item.english.text, item.topic, item);
    if (dupCheck.isDuplicate) {
      continue;
    }

    return formatCandidate(item, category || 'TRENDING');
  }

  // If all were seen, still avoid returning the explicitly excluded or locked item
  const nonExcluded = FALLBACK_BANK.find(item => {
    const isExcl = cleanExcluded && item.topic.toLowerCase().trim() === cleanExcluded;
    const h = computeNormalizedHash(item.english.text).toLowerCase();
    const isLocked = historyStore.inFlightLocks && historyStore.inFlightLocks.has(h);
    return !isExcl && !isLocked;
  }) || FALLBACK_BANK.find(item => !cleanExcluded || item.topic.toLowerCase().trim() !== cleanExcluded) || FALLBACK_BANK[0];

  return formatCandidate(nonExcluded, category || 'TRENDING');
}

/**
 * Executes an AI provider call cleanly without blocking rejection criteria
 */
async function callWithSimplify(callFn, prompt, ...args) {
  return await callFn(prompt, ...args);
}

/* =========================================================
   GENERATE ENGLISH POST (NEVER REGENERATES OLD POST)
   UP TO 5 ATTEMPTS WITH STRICT CONTENT-LEVEL UNIQUE CHECKS
========================================================= */

export async function generateEnglishPost(customTopic = '', excludedTopic = '', excludedContext = null, isUserForcedTopic = false) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const cfToken = process.env.CLOUDFLARE_API_TOKEN || config.cloudflareApiToken;
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || config.cloudflareAccountId;
  const xaiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const cleanExcluded = String(excludedTopic || '').toLowerCase().trim();

  // Build avoid list from recent history
  const avoidList = historyStore.getRecentAvoidList(40);
  if (cleanExcluded) {
    avoidList.unshift(`DISCARDED_TOPIC_TO_NEVER_REPEAT: "${cleanExcluded}"`);
  }
  if (excludedContext) {
    if (excludedContext.subject) avoidList.unshift(`EXCLUDED_PREVIOUS_SUBJECT: "${excludedContext.subject}"`);
    if (excludedContext.argument) avoidList.unshift(`EXCLUDED_PREVIOUS_ARGUMENT: "${excludedContext.argument.slice(0, 100)}"`);
    if (Array.isArray(excludedContext.statistics) && excludedContext.statistics.length > 0) {
      avoidList.unshift(`EXCLUDED_PREVIOUS_STATS: [${excludedContext.statistics.join(', ')}]`);
    }
  }

  // Sync Mongo topics into historyStore
  let mongoTopics = [];
  try {
    mongoTopics = await getAllUsedTopics();
  } catch (e) {
    // Non-fatal if Mongo is down
  }
  const recordedTopics = typeof historyStore.getAllUsedTopics === 'function' ? historyStore.getAllUsedTopics() : [];
  for (const t of mongoTopics) {
    if (t) {
      if (typeof historyStore.recordSeenTopic === 'function') {
        historyStore.recordSeenTopic(t);
      } else if (historyStore.topics && typeof historyStore.topics.add === 'function') {
        historyStore.topics.add(String(t).toLowerCase().trim());
      }
    }
  }
  const allUsedTopics = Array.from(new Set([...recordedTopics, ...mongoTopics]));

  // ─── PHASE 1: DETERMINE TOPIC ─────────────────────────────────────────────
  // If user forced a custom topic (from WhatsApp "Write about custom topic"), use it directly.
  // Otherwise fetch a trending topic from trendFetcher (Google Trends → AI → evergreen).

  let chosenTopic = '';
  let trendContext = '';
  const chosenCategory = isUserForcedTopic ? 'CUSTOM_TOPIC' : 'TRENDING';

  if (isUserForcedTopic && customTopic.trim()) {
    chosenTopic = customTopic.trim();
    trendContext = '';
    console.log(`[Pipeline] Phase 1 — User-forced custom topic: "${chosenTopic}"`);
  } else {
    try {
      const trend = await pickUnusedTrendingTopic(allUsedTopics);
      chosenTopic = trend.topic;
      trendContext = trend.context || '';
      console.log(`[Pipeline] Phase 1 — Downside topic selected: "${chosenTopic}" (source: ${trend.source})`);
    } catch (e) {
      console.warn(`[Pipeline] Topic fetch failed: ${e.message}. Using fallback.`);
      chosenTopic = customTopic.trim() || 'Young Indians finish college and still cannot find steady jobs';
    }
  }

  // Gather live verified India statistics from integrated public APIs (World Bank + Open-Meteo + FX)
  let liveFactsBrief = '';
  try {
    const liveSnapshot = await getLiveIndiaFactsSnapshot();
    liveFactsBrief = formatFactsBrief(chosenTopic, liveSnapshot);
  } catch (e) {
    console.warn(`[Pipeline] Live India data integration fallback: ${e.message}`);
  }

  // ─── PHASE 2: GENERATE POST (up to 5 attempts) ───────────────────────────
  const MAX_ATTEMPTS = 5;
  let lastRejectionReason = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // On retries, slightly vary the topic framing to get a fresh angle
    const attemptTopic = attempt === 1 ? chosenTopic : `${chosenTopic} — angle ${attempt}`;

    // Build the right prompt grounded in live verified India data
    const prompt = isUserForcedTopic
      ? createCustomTopicPrompt(chosenTopic, avoidList, liveFactsBrief)
      : createTrendingPostPrompt(attemptTopic, trendContext, avoidList, liveFactsBrief);

    let candidate = null;
    let providerName = '';

    /* ---------------- TIER 1. CLOUDFLARE WORKERS AI (PRIMARY + 2-PASS POLISH/EXPAND) ---------------- */
    if (cfToken && cfAccountId && !candidate) {
      try {
        console.log(`[Cloudflare AI] Generating post for India downside topic: "${chosenTopic}"...`);
        const res = await callWithSimplify(callCloudflareAI, prompt);
        // Allow shorter Pass 1 drafts (120+ chars) so Pass 2 can expand them cleanly to 400+ chars
        let validated = validateAIResponse(res, chosenTopic, chosenCategory, '', 120);

        // Pass 2: Polish, simplify words, remove news tone, and enforce 400+ character minimum
        const audit = auditDraftForSimplification(validated.english.text);
        if (audit.needsPolish || validated.english.charCount < MIN_CHARACTERS) {
          console.log(`[Cloudflare AI] Pass 2 polish triggered (${audit.reasons.join(', ')})...`);
          try {
            const polished = await polishWithCloudflareAI(validated, liveFactsBrief);
            if (polished) {
              validated = polished;
            }
          } catch (polishErr) {
            console.warn(`[Cloudflare AI] Pass 2 polish warning: ${polishErr.message}`);
          }
        }

        if (validated.english.charCount < MIN_CHARACTERS) {
          throw new Error(`Cloudflare AI post still under ${MIN_CHARACTERS} chars (${validated.english.charCount} chars)`);
        }

        candidate = validated;
        providerName = 'Cloudflare Workers AI (Verified India Data + Polish)';
        console.log(`[Cloudflare AI] ✓ Success! (${candidate.english.charCount} chars)`);
      } catch (err) {
        console.warn(`[Cloudflare AI] ${err.message}. Trying next tier...`);
      }
    }

    /* ---------------- TIER 2. GOOGLE GEMINI (BACKUP 1) ---------------- */
    if (geminiKey && !candidate) {
      try {
        const res = await callWithSimplify(callGemini, prompt, geminiKey);
        const validated = validateAIResponse(res, chosenTopic, chosenCategory, '');
        candidate = validated;
        providerName = 'Google Gemini Free API';
        console.log(`[Gemini API] ✓ Success!`);
      } catch (err) {
        console.warn(`[Gemini API] ${err.message}. Trying next tier...`);
      }
    }

    /* ---------------- TIER 3. xAI GROK API ---------------- */
    if (xaiKey && !candidate) {
      try {
        const res = await callWithSimplify(callXai, prompt, 'grok-2-latest');
        const validated = validateAIResponse(res, chosenTopic, chosenCategory, '');
        candidate = validated;
        providerName = 'xAI Grok API';
        console.log(`[Grok API] ✓ Success!`);
      } catch (err) {
        console.warn(`[Grok API] ${err.message}. Trying next tier...`);
      }
    }

    /* ---------------- TIER 4. GROQ CLOUD API ---------------- */
    if (groqKey && !candidate) {
      try {
        const res = await callWithSimplify(callGroq, prompt, groqKey);
        const validated = validateAIResponse(res, chosenTopic, chosenCategory, '');
        candidate = validated;
        providerName = 'Groq Cloud API (Free)';
        console.log(`[Groq API] ✓ Success!`);
      } catch (err) {
        console.warn(`[Groq API] ${err.message}. Trying fallback bank...`);
      }
    }

    /* ---------------- TIER 5. ENGAGEMENT FALLBACK BANK ---------------- */
    if (!candidate) {
      const fallback = generateDynamicFallback(chosenCategory, '', cleanExcluded, avoidList);
      if (fallback) {
        candidate = fallback;
        providerName = 'Engagement Fallback Bank';
        console.log(`[Fallback Bank] Serving pre-written post: "${candidate.topic}"`);
      }
    }

    if (!candidate) {
      continue;
    }

    // Extract full metadata
    const candidateMeta = extractPostMetadata({
      topic: candidate.topic,
      subtopic: candidate.subtopic,
      genreId: candidate.category,
      category: candidate.category,
      text: candidate.english.text,
      mainSubject: candidate.mainSubject,
      specificEventOrIssue: candidate.specificEventOrIssue,
      centralArgument: candidate.centralArgument,
      analyticalAngle: candidate.analyticalAngle,
      importantStatistics: candidate.importantStatistics,
      keywords: candidate.keywords
    });

    // Acquire concurrency lock on candidate hash
    const lockAcquired = historyStore.acquireLock(candidateMeta.hash);
    if (!lockAcquired) {
      console.warn(`[Pipeline] Concurrency lock conflict for "${candidate.topic}". Retrying...`);
      avoidList.unshift(`AVOID_LOCKED: "${candidate.topic}"`);
      continue;
    }

    try {
      // Run 6-stage duplicate & uniqueness checks
      const dupCheck = historyStore.isDuplicateOrSimilar(candidate.english.text, candidate.topic, candidateMeta);
      const isMongoDup = await isDuplicatePost(candidate.topic, candidate.english.text, candidateMeta);

      if (dupCheck.isDuplicate || isMongoDup) {
        lastRejectionReason = dupCheck.reason || 'MongoDB collision';
        console.warn(`[Pipeline Attempt ${attempt}/${MAX_ATTEMPTS}] Rejected: "${candidate.topic}": ${lastRejectionReason}`);
        avoidList.unshift(`AVOID_REJECTED: "${candidate.topic}" (${lastRejectionReason})`);
        continue;
      }

      // Unique! Persist to HistoryStore and MongoDB
      historyStore.recordPost({
        topic: candidate.topic,
        subtopic: candidateMeta.subtopic,
        genreId: candidateMeta.genreId,
        category: candidateMeta.genreId,
        englishText: candidate.english.text,
        romanUrduText: candidate.romanUrdu?.text || '',
        plainUrduText: candidate.plainUrdu?.text || '',
        mainSubject: candidateMeta.mainSubject,
        specificEventOrIssue: candidateMeta.specificEventOrIssue,
        centralArgument: candidateMeta.centralArgument,
        analyticalAngle: candidateMeta.analyticalAngle,
        importantStatistics: candidateMeta.importantStatistics,
        keywords: candidateMeta.keywords,
        provider: providerName,
        status: 'PENDING'
      });

      await saveGeneratedPost({
        topic: candidate.topic,
        genreId: candidateMeta.genreId,
        category: candidateMeta.genreId,
        subtopic: candidateMeta.subtopic,
        mainSubject: candidateMeta.mainSubject,
        specificEventOrIssue: candidateMeta.specificEventOrIssue,
        centralArgument: candidateMeta.centralArgument,
        analyticalAngle: candidateMeta.analyticalAngle,
        importantStatistics: candidateMeta.importantStatistics,
        keywords: candidateMeta.keywords,
        english: candidate.english,
        romanUrdu: candidate.romanUrdu,
        plainUrdu: candidate.plainUrdu,
        provider: providerName
      }).catch(err => {
        console.warn('[Pipeline] MongoDB save notice:', err.message);
      });

      return {
        ...candidate,
        ...candidateMeta,
        provider: providerName
      };
    } finally {
      historyStore.releaseLock(candidateMeta.hash);
    }
  }

  // If all retry attempts collided with history, guarantee a fresh post via fallback bank
  const guaranteedFallback = generateDynamicFallback(chosenCategory, '', cleanExcluded, avoidList);
  if (guaranteedFallback) {
    console.log(`[Pipeline] Retries exhausted. Serving guaranteed fresh fallback: "${guaranteedFallback.topic}"`);
    return {
      ...guaranteedFallback,
      provider: 'Engagement Fallback Bank'
    };
  }

  throw new Error(`Unable to generate a unique post after ${MAX_ATTEMPTS} attempts for topic "${chosenTopic}". Reason: ${lastRejectionReason || 'All providers and fallbacks exhausted'}`);
}


/* =========================================================
   PAKISTANI ROMAN URDU TRANSLATION (UPDATES IN-PLACE)
========================================================= */

export async function generateRomanUrduFromEnglish(englishPost, topic = '') {
  const geminiKey = process.env.GEMINI_API_KEY;
  const cfToken = process.env.CLOUDFLARE_API_TOKEN || config.cloudflareApiToken;
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || config.cloudflareAccountId;
  const xaiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const prompt = `Translate this post into natural, everyday Pakistani Roman Urdu, keeping the voice of a Pakistani talking about Indians and everyday life in India.

ENGLISH POST:
"${englishPost.text}"

RULES:
- Preserve the exact 3-part layout separated by double line breaks (\\n\\n):
  Line 1: A single punchy hook line in Pakistani Roman Urdu talking about India/Indians.
  \\n\\n
  Paragraph 2: The real body in Pakistani Roman Urdu explaining the downside and effect on ordinary Indians with the exact same numbers and facts.
  \\n\\n
  Line 3: A short concluding takeaway or closing question in Roman Urdu.
- Use simple everyday conversational Pakistani words that anyone understands easily.
- Keep the exact same numbers, facts, and the final question intact.
- Every sentence must be short and easy to understand.
- STRICT MINIMUM LENGTH: Must be 400+ characters (420 to 580 characters total, NEVER under 400 and NEVER over 600).
- ZERO hashtags, ZERO emojis. NEVER use labels like "Hook:" or "Body:".
- Return ONLY valid JSON:
{
  "text": "Line 1 hook\\n\\nBody paragraph\\n\\nConclusion line"
}`;

  let romanEntry = null;

  if (cfToken && cfAccountId && !romanEntry) {
    try {
      let res = await callCloudflareAI(prompt);
      if (res && res.text) {
        let entry = formatEntry(res.text);
        if (!entry.isOverLimit && entry.charCount >= 120 && entry.charCount < MIN_CHARACTERS) {
          res = await callCloudflareAI(`${prompt}\n\nLENGTH FIX: Your last Roman Urdu draft was only ${entry.charCount} characters. Expand Paragraph 2 slightly with simple everyday words so the total length is strictly 420 to 580 characters (400+ required).`);
          if (res && res.text) entry = formatEntry(res.text);
        }
        if (!entry.isOverLimit && entry.charCount >= MIN_CHARACTERS) romanEntry = entry;
      }
    } catch (error) {
      console.warn('[Roman Urdu Cloudflare AI]', error.message);
    }
  }

  if (geminiKey && !romanEntry) {
    try {
      const res = await callGemini(prompt, geminiKey);
      if (res && res.text) {
        const entry = formatEntry(res.text);
        if (!entry.isOverLimit && entry.charCount >= MIN_CHARACTERS) romanEntry = entry;
      }
    } catch (error) {
      console.warn('[Roman Urdu Gemini]', error.message);
    }
  }

  if (xaiKey && !romanEntry) {
    try {
      const res = await callXai(prompt, 'grok-2-latest');
      if (res && res.text) {
        const entry = formatEntry(res.text);
        if (!entry.isOverLimit && entry.charCount >= MIN_CHARACTERS) romanEntry = entry;
      }
    } catch (error) {
      console.warn('[Roman Urdu Grok]', error.message);
    }
  }

  if (groqKey && !romanEntry) {
    try {
      const res = await callGroq(prompt, groqKey);
      if (res && res.text) {
        const entry = formatEntry(res.text);
        if (!entry.isOverLimit && entry.charCount >= MIN_CHARACTERS) romanEntry = entry;
      }
    } catch (error) {
      console.warn('[Roman Urdu Groq]', error.message);
    }
  }

  if (!romanEntry) {
    const found = FALLBACK_BANK.find(
      item => item.topic === topic || (item.english && item.english.text === englishPost.text)
    );
    if (found && found.romanUrdu && found.romanUrdu.text) {
      romanEntry = formatEntry(found.romanUrdu.text);
    } else {
      throw new Error(`Failed to generate Roman Urdu translation for "${topic || 'post'}": all AI providers failed and no matching bank entry found.`);
    }
  }

  // Update existing record in-place so translations never count as new duplicates
  if (topic) {
    updatePostTranslation(topic, 'Roman Urdu', romanEntry.text).catch(() => {});
  }

  return romanEntry;
}

/* =========================================================
   PLAIN URDU SCRIPT TRANSLATION (UPDATES IN-PLACE)
========================================================= */

export async function generatePlainUrduFromEnglish(englishPost, topic = '') {
  const geminiKey = process.env.GEMINI_API_KEY;
  const cfToken = process.env.CLOUDFLARE_API_TOKEN || config.cloudflareApiToken;
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || config.cloudflareAccountId;
  const xaiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const prompt = `Translate this post into very simple everyday Pakistani Urdu script (اردو), keeping the voice of a Pakistani talking about Indians and India's real issues.

ENGLISH POST:
"${englishPost.text}"

RULES:
- Preserve the exact 3-part layout separated by double line breaks (\\n\\n):
  Line 1: A single punchy hook line in Urdu (اردو) from a Pakistani observer's view about India/Indians.
  \\n\\n
  Paragraph 2: The real body in Urdu explaining the downside and everyday effect on ordinary Indians with the exact same numbers and facts.
  \\n\\n
  Line 3: A short concluding takeaway or closing question in Urdu.
- Use simple everyday Pakistani Urdu that an ordinary reader or shopkeeper understands easily.
- Avoid heavy bookish words or complicated literary terms.
- Keep the exact same numbers, facts, and the final question intact.
- Every sentence must be short and easy to understand.
- STRICT MINIMUM LENGTH: Must be 400+ characters (420 to 580 characters total, NEVER under 400 and NEVER over 600).
- ZERO hashtags, ZERO emojis. NEVER use labels.
- Return ONLY valid JSON:
{
  "text": "اردو ہک لائن\\n\\nاردو باڈی پیراگراف\\n\\nاردو اختتامی لائن"
}`;

  let urduEntry = null;

  if (cfToken && cfAccountId && !urduEntry) {
    try {
      let res = await callCloudflareAI(prompt);
      if (res && res.text) {
        let entry = formatEntry(res.text);
        if (!entry.isOverLimit && entry.charCount >= 120 && entry.charCount < MIN_CHARACTERS) {
          res = await callCloudflareAI(`${prompt}\n\nLENGTH FIX: Your last Urdu draft was only ${entry.charCount} characters. Expand Paragraph 2 slightly in simple everyday Urdu so the total length is strictly 420 to 580 characters (400+ required).`);
          if (res && res.text) entry = formatEntry(res.text);
        }
        if (!entry.isOverLimit && entry.charCount >= MIN_CHARACTERS) urduEntry = entry;
      }
    } catch (error) {
      console.warn('[Plain Urdu Cloudflare AI]', error.message);
    }
  }

  if (geminiKey && !urduEntry) {
    try {
      const res = await callGemini(prompt, geminiKey);
      if (res && res.text) {
        const entry = formatEntry(res.text);
        if (!entry.isOverLimit && entry.charCount >= MIN_CHARACTERS) urduEntry = entry;
      }
    } catch (error) {
      console.warn('[Plain Urdu Gemini]', error.message);
    }
  }

  if (xaiKey && !urduEntry) {
    try {
      const res = await callXai(prompt, 'grok-2-latest');
      if (res && res.text) {
        const entry = formatEntry(res.text);
        if (!entry.isOverLimit && entry.charCount >= MIN_CHARACTERS) urduEntry = entry;
      }
    } catch (error) {
      console.warn('[Plain Urdu Grok]', error.message);
    }
  }

  if (groqKey && !urduEntry) {
    try {
      const res = await callGroq(prompt, groqKey);
      if (res && res.text) {
        const entry = formatEntry(res.text);
        if (!entry.isOverLimit && entry.charCount >= MIN_CHARACTERS) urduEntry = entry;
      }
    } catch (error) {
      console.warn('[Plain Urdu Groq]', error.message);
    }
  }

  if (!urduEntry) {
    const found = FALLBACK_BANK.find(
      item => item.topic === topic || (item.english && item.english.text === englishPost.text)
    );
    if (found && found.plainUrdu && found.plainUrdu.text) {
      urduEntry = formatEntry(found.plainUrdu.text);
    } else {
      throw new Error(`Failed to generate Plain Urdu translation for "${topic || 'post'}": all AI providers failed and no matching bank entry found.`);
    }
  }

  // Update existing record in-place so translations never count as new duplicates
  if (topic) {
    updatePostTranslation(topic, 'Plain Urdu', urduEntry.text).catch(() => {});
  }

  return urduEntry;
}

/* =========================================================
   MULTILINGUAL POST GENERATION
========================================================= */

export async function generateMultilingualPost(customTopic = '') {
  const eng = await generateEnglishPost(customTopic);
  const roman = await generateRomanUrduFromEnglish(eng.english, eng.topic);
  const plain = await generatePlainUrduFromEnglish(eng.english, eng.topic);

  return {
    topic: eng.topic,
    subtopic: eng.subtopic,
    category: eng.category,
    provider: eng.provider,
    english: eng.english,
    romanUrdu: roman,
    plainUrdu: plain
  };
}

/* =========================================================
   API CALL WRAPPERS (CLOUDFLARE AI, GROQ, XAI, GEMINI)
========================================================= */

function safeJsonParse(rawText) {
  if (!rawText) throw new Error('Empty response string');
  if (typeof rawText === 'object' && rawText !== null) return rawText;

  const match = typeof rawText === 'string' ? rawText.match(/\{[\s\S]*\}/) : null;
  if (!match) {
    // If the model returned plain text directly instead of wrapping in JSON
    if (typeof rawText === 'string' && rawText.trim().length > 10) {
      return { text: rawText.trim() };
    }
    throw new Error('No valid JSON object found in response');
  }
  const jsonString = match[0];
  try {
    return JSON.parse(jsonString);
  } catch (err) {
    try {
      // 1. Sanitize unescaped newlines/tabs inside string literals
      const sanitized = jsonString.replace(/"(?:[^"\\]|\\.)*"/gs, (m) => {
        return m.replace(/\n/g, '\\n').replace(/\r/g, '').replace(/\t/g, '\\t');
      });
      return JSON.parse(sanitized);
    } catch (e2) {
      // 2. Resilient regex extraction fallback if JSON has unquoted numbers/percentages or syntax errors
      const topicMatch = jsonString.match(/"topic"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
      const textMatch = jsonString.match(/"text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
      if (textMatch && textMatch[1]) {
        return {
          topic: topicMatch ? topicMatch[1].replace(/\\n/g, ' ') : 'Analytical Insight',
          text: textMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
        };
      }
      if (typeof rawText === 'string' && rawText.trim().length > 10) {
        return { text: rawText.trim() };
      }
      throw err;
    }
  }
}

async function polishWithCloudflareAI(candidate, liveFactsBrief = '') {
  const currentLen = candidate.english.charCount || candidate.english.text.length;
  const lengthInstruction = currentLen < MIN_CHARACTERS
    ? `CRITICAL LENGTH FIX: The current draft is only ${currentLen} characters, which is TOO SHORT (under the strict ${MIN_CHARACTERS}-character minimum). Expand Paragraph 2 by adding one clear everyday effect sentence in simple words so the final post is strictly between 420 and 560 characters.`
    : `LENGTH: Strictly 400+ characters (420 to 560 characters ideal, NEVER under 400 and NEVER over 600). ZERO hashtags, ZERO emojis, NO labels.`;

  const polishPrompt = `Rewrite this X post so it sounds naturally like **a Pakistani talking about Indians** and India's downsides/real effects, using the simplest words.

CURRENT DRAFT (${currentLen} chars):
"${candidate.english.text}"

VERIFIED FACTS TO KEEP ACCURATE:
${liveFactsBrief || '- Keep the verified numbers accurate.'}

STRICT REWRITE RULES:
1. PAKISTANI PERSPECTIVE ON INDIANS: Write as a Pakistani looking across the border at India and talking directly about how this hurts everyday Indians (e.g., "From Pakistan, ...", "Sitting in Pakistan...", "Across the border, ordinary Indians..."). Keep it grounded, analytical, and civil—zero hate speech.
2. NOT NEWS: Remove any newspaper phrases ("A report says", "Today", "Yesterday", "Latest news").
3. INDIA DOWNSIDE + EFFECT: Keep the clear focus on what is broken in India and how it hurts ordinary Indian families, students, or workers.
4. SIMPLEST POSSIBLE WORDS: Replace every long or fancy word (like infrastructure, disparity, demographic, inflation, macroeconomic, expenditure, deteriorating) with tiny everyday words a 12-year-old uses.
5. SHORT SENTENCES: 5 to 12 words per sentence.
6. EXACT 3-PART LAYOUT separated by \\n\\n:
   Line 1: Punchy hook sentence from a Pakistani angle about India/Indians.
   \\n\\n
   Paragraph 2: 2-3 simple sentences with the accurate latest number + everyday human effect on Indians.
   \\n\\n
   Line 3: Short, sharp closing question.
7. ${lengthInstruction}

Return ONLY valid JSON:
{
  "topic": "${(candidate.topic || '').replace(/"/g, "'")}",
  "subtopic": "${(candidate.subtopic || '').replace(/"/g, "'")}",
  "category": "${candidate.category || 'TRENDING'}",
  "text": "Rewritten hook\\n\\nRewritten body\\n\\nRewritten question"
}`;

  const polishedRes = await callCloudflareAI(polishPrompt);
  return validateAIResponse(polishedRes, candidate.topic, candidate.category, candidate.subtopic, MIN_CHARACTERS);
}

export async function callCloudflareAI(prompt, model = null) {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || config.cloudflareAccountId || '').trim();
  const apiToken = (process.env.CLOUDFLARE_API_TOKEN || config.cloudflareApiToken || '').trim();
  if (!accountId || !apiToken) {
    throw new Error('Cloudflare AI credentials not configured (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN)');
  }

  const candidateModels = Array.from(new Set([
    model,
    process.env.CLOUDFLARE_AI_MODEL,
    config.cloudflareAiModel,
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    '@cf/qwen/qwen3-30b-a3b-fp8',
    '@cf/meta/llama-3.1-8b-instruct'
  ].filter(Boolean)));

  let lastError = null;
  for (const targetModel of candidateModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${targetModel}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              max_tokens: 1024,
              temperature: 0.65,
              messages: [
                {
                  role: 'system',
                  content: 'You write high-impact X posts as a Pakistani talking naturally about Indians and India\'s real downsides and how they hurt ordinary people across the border, using the SIMPLEST everyday English (Grade 4-5 words). Keep commentary grounded, analytical, and civil (zero hate). NEVER sound like a news report. Use ONLY verified latest numbers provided in the prompt. Every post MUST strictly follow this exact 3-part layout separated by double line breaks (\\n\\n):\nLine 1: One short punchy hook from a Pakistani point of view exposing an India downside affecting Indians (1 sentence).\n\\n\\nParagraph 2: 2 to 3 short simple sentences with real latest data AND the everyday effect on Indian families, students, or workers (around 50-70 words).\n\\n\\nClosing Line: One short, sharp question that makes people want to reply.\nTotal length MUST be strictly between 400 and 560 characters (never exceed 600). Zero hashtags, zero emojis, no labels. Return ONLY valid JSON.'
                },
                { role: 'user', content: prompt }
              ]
            })
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Cloudflare AI (${targetModel}) HTTP ${response.status}: ${errorText.slice(0, 150)}`);
        }

        const json = await response.json();
        if (!json.success && json.errors && json.errors.length > 0) {
          throw new Error(`Cloudflare AI error: ${json.errors[0].message}`);
        }

        let rawText = json.result?.choices?.[0]?.message?.content;
        if (!rawText && typeof json.result?.response === 'string') {
          rawText = json.result.response;
        } else if (!rawText && typeof json.result?.response === 'object' && json.result.response !== null) {
          return json.result.response;
        }

        if (!rawText) {
          throw new Error('Empty Cloudflare AI response');
        }

        return safeJsonParse(rawText);
      } catch (err) {
        lastError = err;
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 400));
        }
      }
    }
  }

  throw lastError;
}

async function callGroq(prompt, apiKey) {
  const groq = new Groq({ apiKey });
  const models = [
    process.env.AI_MODEL,
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768'
  ].filter(Boolean);

  let lastErr = null;
  for (const model of Array.from(new Set(models))) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: 'You write high-impact X posts as a Pakistani talking naturally about Indians and India\'s real downsides and how they hurt ordinary people across the border, using the SIMPLEST everyday English (Grade 4-5 words). Keep commentary grounded, analytical, and civil (zero hate). NEVER sound like a news report. Use ONLY verified latest numbers provided in the prompt. Every post MUST strictly follow this exact 3-part layout separated by double line breaks (\\n\\n):\nLine 1: One short punchy hook from a Pakistani point of view exposing an India downside affecting Indians (1 sentence).\n\\n\\nParagraph 2: 2 to 3 short simple sentences with real latest data AND the everyday effect on Indian families, students, or workers (around 50-70 words).\n\\n\\nClosing Line: One short, sharp question that makes people want to reply.\nTotal length MUST be strictly between 400 and 560 characters (never exceed 600). Zero hashtags, zero emojis, no labels. Return ONLY valid JSON.'
          },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7
      });

      const rawJson = completion.choices[0]?.message?.content;
      return JSON.parse(rawJson);
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('All Groq models failed');
}

async function callXai(prompt, model = 'grok-2-latest') {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error('GROK_API_KEY or XAI_API_KEY is not set');
  }

  const models = [
    process.env.AI_MODEL,
    model,
    'grok-2-latest',
    'grok-beta',
    'grok-2'
  ].filter(Boolean);

  let lastErr = null;
  for (const m of Array.from(new Set(models))) {
    try {
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: m,
          messages: [
            {
              role: 'system',
              content: 'You write high-impact X posts as a Pakistani talking naturally about Indians and India\'s real downsides and how they hurt ordinary people across the border, using the SIMPLEST everyday English (Grade 4-5 words). Keep commentary grounded, analytical, and civil (zero hate). NEVER sound like a news report. Use ONLY verified latest numbers provided in the prompt. Every post MUST strictly follow this exact 3-part layout separated by double line breaks (\\n\\n):\nLine 1: One short punchy hook from a Pakistani point of view exposing an India downside affecting Indians (1 sentence).\n\\n\\nParagraph 2: 2 to 3 short simple sentences with real latest data AND the everyday effect on Indian families, students, or workers (around 50-70 words).\n\\n\\nClosing Line: One short, sharp question that makes people want to reply.\nTotal length MUST be strictly between 400 and 560 characters (never exceed 600). Zero hashtags, zero emojis, no labels. Return ONLY valid JSON.'
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.4
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`xAI ${m} HTTP ${response.status}: ${errText.slice(0, 150)}`);
      }

      const json = await response.json();
      const content = json.choices[0]?.message?.content || '';
      return safeJsonParse(content);
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('All Grok models failed');
}

async function callGemini(prompt, apiKey) {
  const models = [
    process.env.GEMINI_MODEL,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-flash-latest'
  ].filter(Boolean);

  let lastError = null;
  for (const model of Array.from(new Set(models))) {
    try {
      const parsed = await new Promise((resolve, reject) => {
        const postData = JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            responseMimeType: 'application/json'
          }
        });

        const req = https.request(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            family: 4,
            timeout: 15000,
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            }
          },
          (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`Gemini ${model} HTTP ${res.statusCode}: ${data.slice(0, 150)}`));
              }
              try {
                const json = JSON.parse(data);
                const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!rawText) return reject(new Error('Empty Gemini output'));

                const match = rawText.match(/\{[\s\S]*\}/);
                if (!match) return reject(new Error('No JSON object found in Gemini response'));
                resolve(JSON.parse(match[0]));
              } catch (err) {
                reject(err);
              }
            });
          }
        );

        req.on('timeout', () => {
          req.destroy();
          reject(new Error(`Gemini ${model} request timed out (15.0s)`));
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
      });

      return parsed;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini models failed');
}
