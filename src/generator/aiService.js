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
import { SIMPLE_ENGLISH_RULES, checkSimpleEnglish } from '../utils/simpleEnglish.js';
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

const MIN_CHARACTERS = 200;
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
function validateAIResponse(res, chosenTopic, chosenCategory = 'TRENDING', chosenSubtopic = '') {
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
  if (entry.charCount < MIN_CHARACTERS) {
    throw new Error(`AI post is too short (${entry.charCount} chars, must be ${MIN_CHARACTERS}-600)`);
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
function createTrendingPostPrompt(trendTopic, trendContext = '', avoidList = []) {
  const avoidStr = avoidList.length > 0 ? avoidList.slice(0, 20).join('\n• ') : 'None';

  return `${SIMPLE_ENGLISH_RULES}

# X_BOT — INDIA TRENDS ANALYTICAL POST ENGINE (2025-2026)

TRENDING TOPIC: "${trendTopic}"
${trendContext ? `TRENDING CONTEXT: ${trendContext}` : ''}

CURRENT TIME HORIZON: 2025-2026. Write about this topic with a strong analytical focus on INDIA using the most current, verifiable data and developments available.

YOUR GOAL: Write an analytical X post about this trending topic through an India lens that:
1. STOPS THE SCROLL with a surprising, counterintuitive, or bold hook connected to India
2. GROUNDS the analysis in real, verifiable facts, specific numbers (e.g., RBI, NITI Aayog, UPI, GDP, trade, jobs, or Indian state data), and clear cause-and-effect
3. CLOSES with a sharp insight or thought-provoking question about what this means for India and regular people
4. Uses the SIMPLEST everyday English — short sentences, everyday words, nothing complicated

ENGAGEMENT & ANALYTICAL RULES:
- Bias the framing toward India: highlight how this trend affects Indian citizens, India's economy, policy, tech sector, or India's global standing
- Even if the topic is global, connect it analytically to India's reality (trade, rupees, jobs, energy, or supply chains)
- Pick the most surprising or underreported angle — avoid generic news summaries
- Use real facts and numbers that most people don't know — that's what gets shared
- Keep language simple enough for a 12-year-old to follow
- Bold, analytical, and direct — no hedging, no "perhaps", no "it could be argued"

STRICT POST STRUCTURE (3 parts, separated by double line breaks \\n\\n):
Line 1: One fierce, punchy hook sentence that directly exposes the most surprising India-relevant angle
\\n\\n
Paragraph 2: 2-3 hard-hitting sentences of real facts, specific numbers, and sharp analysis (around 60-80 words)
\\n\\n
Line 3: A devastating one-line takeaway or thought-provoking question that makes readers want to comment

LENGTH: Strictly 400 to 580 characters total. Never exceed 600.
ZERO hashtags. ZERO emojis. NO labels like "Hook:" or "Body:".

TOPICS TO AVOID (do not repeat these angles):
• ${avoidStr}

Return ONLY valid JSON in this exact format:
{
  "topic": "Specific India-focused headline for this post",
  "subtopic": "The specific angle or sub-issue being explored",
  "category": "TRENDING",
  "text": "Hook line\\n\\nBody paragraph with facts\\n\\nClosing takeaway or question"
}`;
}

/**
 * Creates a post prompt for a user-specified custom topic (ignores trends).
 * @param {string} userTopic - What the user wants to write about
 * @param {string[]} avoidList
 * @returns {string}
 */
function createCustomTopicPrompt(userTopic, avoidList = []) {
  const avoidStr = avoidList.length > 0 ? avoidList.slice(0, 15).join('\n• ') : 'None';

  return `${SIMPLE_ENGLISH_RULES}

# X_BOT — INDIA ANALYTICAL CUSTOM TOPIC ENGINE (2025-2026)

USER REQUESTED TOPIC: "${userTopic}"

CURRENT TIME HORIZON: 2025-2026. Use the most current facts and developments about this topic.

Write a viral, analytical X post about "${userTopic}" (connecting to India's perspective, economy, or real-world impact wherever relevant):
- Pick the most surprising, counterintuitive, or underreported analytical angle
- Use real facts, specific numbers, and verified data
- Use the SIMPLEST everyday English — short sentences, clear words
- Bold and direct — expose the trade-off or hidden reality

STRICT POST STRUCTURE (3 parts, separated by double line breaks \\n\\n):
Line 1: One fierce hook sentence about "${userTopic}"
\\n\\n
Paragraph 2: 2-3 sentences of real facts with specific numbers (around 60-80 words)
\\n\\n
Line 3: A sharp closing insight or question

LENGTH: Strictly 400 to 580 characters. Never exceed 600.
ZERO hashtags. ZERO emojis.

AVOID: ${avoidStr}

Return ONLY valid JSON:
{
  "topic": "Specific headline for this post",
  "subtopic": "The angle being explored",
  "category": "CUSTOM_TOPIC",
  "text": "Hook\\n\\nBody\\n\\nConclusion"
}`;
}

/* =========================================================
   INDIA-BIASED ANALYTICAL FALLBACK BANK
   High engagement, data-driven, simple everyday English
========================================================= */

export const FALLBACK_BANK = [
  // F1. India UPI scale vs small business credit gap
  {
    topic: 'India UPI processes 16B+ monthly payments while small shops lack bank loans',
    subtopic: 'UPI digital payments boom vs formal credit access in India',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'India UPI payments and informal lending gap',
    specificEventOrIssue: 'NPCI 16B+ monthly UPI transactions vs high-interest informal loans for small vendors',
    centralArgument: 'India built world-leading instant payments via UPI, yet small vendors still rely on expensive informal lenders for credit',
    analyticalAngle: 'Instant digital payments vs lack of affordable bank credit',
    importantStatistics: ['16 billion UPI payments', '36% informal loan interest'],
    keywords: ['India', 'UPI', 'payments', 'banks', 'vendors'],
    english: {
      text: 'India now processes over 16 billion UPI digital payments every single month.\n\nThat is nearly half of all real-time digital payments on the planet. Yet Reserve Bank data shows millions of small shops and farmers still cannot get formal bank loans. Instant phone payments make buying easy, but street vendors still pay local lenders 36% interest to keep shops running.\n\nWhy can India move billions in seconds online, yet struggle to lend fairly to small sellers?'
    },
    romanUrdu: { text: 'India ab har mahine 16 arab se zyada UPI digital payments process karta hai.\n\nYe dunya ki taqreeban aadhi real-time digital adayegiyan hain. Magar Reserve Bank ke mutabiq lakhon chhoti dukanein aur kisan ab bhi bank se qarz nahi le saktay. Phone se foran payment aasan hai magar rehrri walay ab bhi 36% sood par qarz letay hain.\n\nIndia secondon mein arbon bhej sakta hai toh chhotay dukandaron ko sasta qarz kyon nahi milta?' },
    plainUrdu: { text: 'بھارت اب ہر ماہ سولہ ارب سے زیادہ یو پی آئی ڈیجیٹل ادائیگیاں کرتا ہے۔\n\nیہ دنیا کی تقریباً آدھی فوری ڈیجیٹل ادائیگیاں ہیں۔ مگر ریزرو بینک کے مطابق لاکھوں چھوٹی دکانوں اور کسانوں کو اب بھی بینک سے قرض نہیں ملتا۔ فون سے ادائیگی آسان ہے لیکن چھوٹے دکاندار اب بھی مقامی ساہوکاروں کو 36 فیصد سود دیتے ہیں۔\n\nبھارت سیکنڈوں میں اربوں منتقل کر سکتا ہے تو چھوٹے تاجروں کو آسان قرض کیوں نہیں ملتا؟' }
  },

  // F2. India youth demographic & formal jobs challenge
  {
    topic: 'India adds 12 million young job seekers every year while formal hiring lags',
    subtopic: 'India youth workforce vs formal manufacturing and office job creation',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'India demographic dividend and formal employment gap',
    specificEventOrIssue: '65% population under 35 vs under 2M new formal private jobs yearly',
    centralArgument: 'India has the largest youth workforce in the world, but formal job creation lags behind college graduations',
    analyticalAngle: 'Youth workforce growth vs formal job supply',
    importantStatistics: ['12 million job seekers', '65% under age 35', '2 million formal jobs'],
    keywords: ['India', 'youth', 'jobs', 'graduates', 'economy'],
    english: {
      text: 'Over 12 million young Indians enter the job market every single year.\n\nMore than 65% of India\'s people are under age 35, creating the world\'s biggest youth workforce. Yet formal factories and big tech firms add less than 2 million steady jobs a year. Millions of college graduates now spend years studying for a tiny number of government clerk posts.\n\nWhat happens to a fast-growing economy when millions of educated young people lack real jobs?'
    },
    romanUrdu: { text: 'Har saal 1.2 crore se zyada nojawan Bharti job market mein dakhil hotay hain.\n\nIndia ki 65% se zyada abadi 35 saal se kam hai jo dunya ki sab se barri jawan taqat hai. Magar baray karkhanay aur tech companiyan saalana 20 lakh pakki nokriyan bhi nahi dein. Lakhon degree walay chhoti sarkari poston ke liye saalon tayyari kartay hain.\n\nTaiz barhti maeeshat ka kya hoga jab parhay likhay nojawanon ke paas asli rozgar na ho?' },
    plainUrdu: { text: 'ہر سال ایک کروڑ بیس لاکھ سے زیادہ نوجوان بھارتی روزگار کی منڈی میں داخل ہوتے ہیں۔\n\nبھارت کی پینسٹھ فیصد آبادی پینتیس سال سے کم عمر ہے جو دنیا کی سب سے بڑی نوجوان افرادی قوت ہے۔ مگر کارخانے اور بڑی ٹیک کمپنیاں سالانہ بیس لاکھ مستقل ملازمتیں بھی نہیں بناتیں۔ لاکھوں گریجویٹ چند سرکاری اسامیوں کے لیے برسوں امتحان دیتے ہیں۔\n\nتیز معیشت کا کیا ہوگا جب تعلیم یافتہ نوجوانوں کے پاس معیاری روزگار نہ ہو؟' }
  },

  // F3. India household savings vs EMI consumption
  {
    topic: 'India household financial savings fall while urban EMI debt keeps surging',
    subtopic: 'RBI household savings drop vs personal loan and EMI boom in India',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'Indian middle-class household savings and retail debt',
    specificEventOrIssue: 'RBI data showing multi-decade low net financial savings alongside rising unsecured debt',
    centralArgument: 'Urban Indian consumption is increasingly funded by personal loans and EMIs as inflation eats into family savings',
    analyticalAngle: 'Borrowing-driven spending vs real household income growth',
    importantStatistics: ['multi-decade low savings', 'surging EMI debt'],
    keywords: ['India', 'RBI', 'savings', 'debt', 'inflation'],
    english: {
      text: 'Indian household net financial savings dropped to their lowest share in decades.\n\nReserve Bank numbers show families are saving less cash while personal loans and credit card bills keep rising fast. Across big cities, middle-class families buy phones, bikes, and groceries on monthly EMIs. Meanwhile, food and school costs grow faster than regular office paychecks.\n\nIs India\'s consumer boom powered by rising incomes, or by families borrowing tomorrow\'s money?'
    },
    romanUrdu: { text: 'Bharti khandanon ki khalis maali bachat dahaiyon ki kam-tareen satah par aa gayi hai.\n\nReserve Bank ke adaad batatay hain ke log kam paise bacha rahay hain jabke personal loans aur credit card bills barh rahay hain. Baray shehron mein log phone, bike aur rashan bhi mahana qiston par le rahay hain. Khane aur school ka kharch tankhwah se taiz barh raha hai.\n\nKya India ki khareedari barhti aamdani se chal rahi hai ya kal ke qarz par?' },
    plainUrdu: { text: 'بھارتی خاندانوں کی خالص مالی بچت کئی دہائیوں کی کم ترین سطح پر آ گئی ہے۔\n\nریزرو بینک کے اعداد و شمار بتاتے ہیں کہ خاندان کم رقم بچا رہے ہیں جبکہ ذاتی قرضے اور کریڈٹ کارڈ بل تیزی سے بڑھ رہے ہیں۔ بڑے شہروں میں لوگ فون، موٹرسائیکل اور راشن بھی ماہانہ اقساط پر خریدتے ہیں۔ خوراک اور تعلیم کے اخراجات تنخواہوں سے تیز بڑھ رہے ہیں۔\n\nکیا بھارت کی خریداری بڑھتی آمدنی سے چل رہی ہے یا مستقبل کے قرض پر؟' }
  },

  // F4. India IT services vs AI automation
  {
    topic: 'India $250B IT services sector faces sharp AI shift for 5.4M tech workers',
    subtopic: 'Generative AI impact on Indian IT outsourcing and fresher hiring',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'Indian IT outsourcing industry and AI automation',
    specificEventOrIssue: '$250B IT exports and 5.4M workforce adapting as AI automates routine coding',
    centralArgument: 'India became an IT superpower through low-cost coding services, but AI now threatens entry-level outsourcing jobs',
    analyticalAngle: 'Service outsourcing vs building original AI products',
    importantStatistics: ['$250 billion IT sector', '5.4 million tech workers'],
    keywords: ['India', 'IT', 'AI', 'software', 'engineers'],
    english: {
      text: 'India\'s $250 billion IT sector employs 5.4 million tech workers across major cities.\n\nFor thirty years, Indian engineers built and fixed software for banks and firms across America and Europe. Today, new AI tools write basic code and run customer support desks in seconds at a fraction of the cost. Hiring at top Indian tech firms has slowed sharply for fresh college graduates.\n\nCan India\'s tech giants move from cheap coding services to building their own global AI products?'
    },
    romanUrdu: { text: 'India ka 250 arab dollar ka IT sector baray shehron mein 54 lakh tech workers ko rozgar deta hai.\n\nTees saal tak Bharti engineers ne America aur Europe ke bankon ka software banaya. Aaj naye AI tools sasta aur foran code likh detay hain aur customer support chala letay hain. Baray Indian tech idaron mein naye graduates ki bharti bohot kam ho gayi hai.\n\nKya India ki tech companiyan sasti coding chhor kar apnay aalmi AI products bana sakti hain?' },
    plainUrdu: { text: 'بھارت کا ڈھائی سو ارب ڈالر کا آئی ٹی شعبہ بڑے شہروں میں چون لاکھ ٹیک کارکنوں کو روزگار دیتا ہے۔\n\nتیس سال تک بھارتی انجینئروں نے امریکہ اور یورپ کے بینکوں کے لیے سافٹ ویئر بنائے۔ آج نئے اے آئی ٹولز سیکنڈوں میں بنیادی کوڈ لکھتے اور کسٹمر سپورٹ چلاتے ہیں۔ بڑی بھارتی ٹیک کمپنیوں میں نئے گریجویٹس کی بھرتی کم ہو گئی ہے۔\n\nکیا بھارت کی ٹیک کمپنیاں سستی سروسز سے نکل کر اپنی عالمی اے آئی مصنوعات بنا سکیں گی؟' }
  },

  // F5. India urban groundwater crisis
  {
    topic: '21 major Indian cities face severe groundwater shortages as tankers take over',
    subtopic: 'Urban water table depletion in Bengaluru, Delhi, and Chennai',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'India urban groundwater depletion and water tanker economy',
    specificEventOrIssue: 'NITI Aayog warning on urban aquifers and summer water shortages',
    centralArgument: 'Rapid concrete growth without rainwater storage is draining underground aquifers beneath India\'s fastest-growing cities',
    analyticalAngle: 'Urban real estate boom vs disappearing groundwater',
    importantStatistics: ['21 major Indian cities', 'private water tankers'],
    keywords: ['India', 'water', 'Bengaluru', 'Delhi', 'cities'],
    english: {
      text: 'Over 21 major Indian cities risk running short of groundwater in the coming years.\n\nGovernment reports warn that cities like Bengaluru, Chennai, and Delhi pump out underground water far faster than monsoon rain can refill it. Millions of urban apartments already pay private water tankers every summer just to cook and bathe. Farms in Punjab face the same dropping water table.\n\nHow can India build world-class cities when its people have to buy drinking water from tankers?'
    },
    romanUrdu: { text: 'India ke 21 se zyada baray shehron mein aanay walay saalon mein zameeni paani khatam honay ka khatra hai.\n\nSarkari report batati hai ke Bengaluru, Chennai aur Delhi mein barsaat se zyada tezi se zameen se paani nikala ja raha hai. Lakhon shehri khandan garmiyon mein khana pakane ke liye private water tankers khareedte hain. Punjab ke kheton mein bhi paani neechay gir raha hai.\n\nIndia aalmi mayar ke shehr kaisay banaye ga jab logon ko peenay ka paani tankers se lena paray?' },
    plainUrdu: { text: 'بھارت کے اکیس سے زائد بڑے شہروں کو آنے والے برسوں میں زیرزمین پانی کی شدید قلت کا خطرہ ہے۔\n\nسرکاری رپورٹس خبردار کرتی ہیں کہ بنگلورو، چنئی اور دہلی میں بارش سے زیادہ تیزی سے زمین سے پانی نکالا جا رہا ہے۔ لاکھوں شہری خاندان گرمیوں میں نجی واٹر ٹینکروں سے پانی خریدتے ہیں۔ پنجاب کی زراعت بھی گرتے ہوئے پانی سے متاثر ہے۔\n\nبھارت عالمی معیار کے شہر کیسے بنائے گا جب لوگوں کو پینے کا پانی ٹینکروں سے خریدنا پڑے؟' }
  },

  // F6. India winter air pollution economic toll
  {
    topic: 'Toxic winter air in northern India costs billions and shuts schools every year',
    subtopic: 'Delhi NCR air pollution crisis and public health cost',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'Northern India air pollution and productivity loss',
    specificEventOrIssue: 'AQI exceeding 15x WHO limits across Delhi NCR and Gangetic plains',
    centralArgument: 'Treating toxic air as an annual winter headline instead of a year-round policy crisis drains billions from Indian families',
    analyticalAngle: 'Short-term emergency curbs vs structural clean-air reform',
    importantStatistics: ['15 times WHO safe limit', 'billions in lost productivity'],
    keywords: ['India', 'Delhi', 'pollution', 'air', 'health'],
    english: {
      text: 'Dirty winter air in northern India cuts billions of dollars from the economy every year.\n\nEvery November, air pollution in Delhi and nearby cities jumps more than 15 times above safe health limits. Factories slow down, schools shut for weeks, and millions of workers fall sick with lung trouble. Families spend hard-earned savings on air filters and hospital bills.\n\nWhy does India treat toxic air like a short seasonal problem instead of a national health emergency?'
    },
    romanUrdu: { text: 'Shumali India ki zehreeli sardi ki hawa har saal maeeshat ko arbon dollar ka nuqsan deti hai.\n\nHar November mein Delhi aur qareebi shehron mein aloodgi mehfooz had se 15 guna barh jati hai. Karkhanay sust ho jatay hain, school hafton band rehte hain aur lakhon log saans ki bimariyon ka shikar hotay hain. Khandan apni bachat hospital ke billon par lagatay hain.\n\nIndia zehreeli hawa ko aik mausami masla kyon samajhta hai jabke ye qaumi sehat ki emergency hai?' },
    plainUrdu: { text: 'شمالی بھارت کی زہریلی سردیوں کی ہوا ہر سال معیشت کو اربوں ڈالر کا نقصان پہنچاتی ہے۔\n\nہر نومبر میں دہلی اور قریبی شہروں میں فضائی آلودگی محفوظ حد سے پندرہ گنا بڑھ جاتی ہے۔ کارخانے سست پڑ جاتے ہیں، اسکول ہفتوں بند رہتے ہیں اور لاکھوں مزدور بیماریوں کا شکار ہوتے ہیں۔ خاندان اپنی جمع پونجی اسپتالوں پر خرچ کرتے ہیں۔\n\nبھارت زہریلی ہوا کو محض موسمی مسئلہ کیوں سمجھتا ہے جب کہ یہ قومی صحت کی ایمرجنسی ہے؟' }
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

  // If all were seen or avoided, return first item formatted
  return formatCandidate(FALLBACK_BANK[0], category || 'TRENDING');
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
      console.log(`[Pipeline] Phase 1 — Trending topic selected: "${chosenTopic}" (source: ${trend.source})`);
    } catch (e) {
      console.warn(`[Pipeline] Trend fetch failed: ${e.message}. Using fallback.`);
      chosenTopic = customTopic.trim() || 'global economic inequality';
    }
  }

  // ─── PHASE 2: GENERATE POST (up to 5 attempts) ───────────────────────────
  const MAX_ATTEMPTS = 5;
  let lastRejectionReason = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // On retries, slightly vary the topic framing to get a fresh angle
    const attemptTopic = attempt === 1 ? chosenTopic : `${chosenTopic} — angle ${attempt}`;

    // Build the right prompt
    const prompt = isUserForcedTopic
      ? createCustomTopicPrompt(chosenTopic, avoidList)
      : createTrendingPostPrompt(attemptTopic, trendContext, avoidList);

    let candidate = null;
    let providerName = '';

    /* ---------------- TIER 1. CLOUDFLARE WORKERS AI (PRIMARY) ---------------- */
    if (cfToken && cfAccountId && !candidate) {
      try {
        console.log(`[Cloudflare AI] Generating post for topic: "${chosenTopic}"...`);
        const res = await callWithSimplify(callCloudflareAI, prompt);
        const validated = validateAIResponse(res, chosenTopic, chosenCategory, '');
        candidate = validated;
        providerName = 'Cloudflare Workers AI (Llama 3.1)';
        console.log(`[Cloudflare AI] ✓ Success!`);
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

  const prompt = `Translate this post into very simple conversational Roman Urdu.

ENGLISH POST:
"${englishPost.text}"

RULES:
- Preserve the exact 3-part layout separated by double line breaks (\\n\\n):
  Line 1: A single punchy hook line in Roman Urdu discussing the main point.
  \\n\\n
  Paragraph 2: The real body in Roman Urdu elaborating on the main point with the exact same numbers and facts.
  \\n\\n
  Line 3: A short concluding takeaway or closing question in Roman Urdu.
- Use simple everyday conversational words that anyone understands easily.
- Keep the exact same numbers, facts, and the final question intact.
- Every sentence must be short and easy to understand.
- Target length: 400 to 600 characters total.
- ZERO hashtags, ZERO emojis. NEVER use labels like "Hook:" or "Body:".
- Return ONLY valid JSON:
{
  "text": "Line 1 hook\\n\\nBody paragraph\\n\\nConclusion line"
}`;

  let romanEntry = null;

  if (cfToken && cfAccountId && !romanEntry) {
    try {
      const res = await callCloudflareAI(prompt);
      if (res && res.text) {
        const entry = formatEntry(res.text);
        if (!entry.isOverLimit && entry.charCount > 20) romanEntry = entry;
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
        if (!entry.isOverLimit && entry.charCount > 20) romanEntry = entry;
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
        if (!entry.isOverLimit && entry.charCount > 20) romanEntry = entry;
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
        if (!entry.isOverLimit && entry.charCount > 20) romanEntry = entry;
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

  const prompt = `Translate this post into very simple Urdu script (اردو).

ENGLISH POST:
"${englishPost.text}"

RULES:
- Preserve the exact 3-part layout separated by double line breaks (\\n\\n):
  Line 1: A single punchy hook line in Urdu (اردو) discussing the main point.
  \\n\\n
  Paragraph 2: The real body in Urdu elaborating on the main point with the exact same numbers and facts.
  \\n\\n
  Line 3: A short concluding takeaway or closing question in Urdu.
- Use simple everyday Urdu that an ordinary reader or shopkeeper understands easily.
- Avoid heavy bookish words or complicated literary terms.
- Keep the exact same numbers, facts, and the final question intact.
- Every sentence must be short and easy to understand.
- Target length: 400 to 600 characters total.
- ZERO hashtags, ZERO emojis. NEVER use labels.
- Return ONLY valid JSON:
{
  "text": "اردو ہک لائن\\n\\nاردو باڈی پیراگراف\\n\\nاردو اختتامی لائن"
}`;

  let urduEntry = null;

  if (cfToken && cfAccountId && !urduEntry) {
    try {
      const res = await callCloudflareAI(prompt);
      if (res && res.text) {
        const entry = formatEntry(res.text);
        if (!entry.isOverLimit && entry.charCount > 20) urduEntry = entry;
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
        if (!entry.isOverLimit && entry.charCount > 20) urduEntry = entry;
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
        if (!entry.isOverLimit && entry.charCount > 20) urduEntry = entry;
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
        if (!entry.isOverLimit && entry.charCount > 20) urduEntry = entry;
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

export async function callCloudflareAI(prompt, model = null) {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || config.cloudflareAccountId || '').trim();
  const apiToken = (process.env.CLOUDFLARE_API_TOKEN || config.cloudflareApiToken || '').trim();
  if (!accountId || !apiToken) {
    throw new Error('Cloudflare AI credentials not configured (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN)');
  }
  const targetModel = model || process.env.CLOUDFLARE_AI_MODEL || config.cloudflareAiModel || '@cf/meta/llama-3.1-8b-instruct';

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
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
            temperature: 0.7,
            messages: [
              {
                role: 'system',
                content: 'You are an expert social media trend analyst and storyteller on X focused on India. You write captivating, analytical, eye-opening posts about India\'s latest trends, economy, policy, tech, jobs, infrastructure, and real-world statistics using the SIMPLEST everyday English. CURRENT TIME HORIZON: 2025 / 2026. Every post MUST strictly follow this exact 3-part layout separated by double line breaks (\\n\\n):\nLine 1: A bold, scroll-stopping hook line about the Indian trend (1 sentence).\n\\n\\nParagraph 2: The analytical core that unpacks the reality with real facts, verified numbers, and clear comparisons using simple everyday words (2 to 3 sentences, around 50-70 words).\n\\n\\nClosing Line: An engaging takeaway or thought-provoking question that compels readers to comment.\nTotal post length MUST be strictly between 400 and 580 characters (never exceed 600). Never use hashtags, emojis, or labels like "Hook:" or "Body:". Return ONLY a valid JSON object matching the requested schema.'
              },
              { role: 'user', content: prompt }
            ]
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloudflare AI HTTP ${response.status}: ${errorText.slice(0, 150)}`);
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
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 600));
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
            content: 'You are an expert social media trend analyst and storyteller on X focused on India. You write captivating, analytical, eye-opening posts about India\'s latest trends, economy, policy, tech, jobs, infrastructure, and real-world statistics using the SIMPLEST everyday English. CURRENT TIME HORIZON: 2025 / 2026. Every post MUST strictly follow this exact 3-part layout separated by double line breaks (\\n\\n):\nLine 1: A bold, scroll-stopping hook line about the Indian trend (1 sentence).\n\\n\\nParagraph 2: The analytical core that unpacks the reality with real facts, verified numbers, and clear comparisons using simple everyday words (2 to 3 sentences, around 50-70 words).\n\\n\\nClosing Line: An engaging takeaway or thought-provoking question that compels readers to comment.\nTotal post length MUST be strictly between 400 and 580 characters (never exceed 600). Never use hashtags, emojis, or labels like "Hook:" or "Body:". Return ONLY a valid JSON object matching the requested schema.'
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
              content: 'You are an expert social media trend analyst and storyteller on X focused on India. You write captivating, analytical, eye-opening posts about India\'s latest trends, economy, policy, tech, jobs, infrastructure, and real-world statistics using the SIMPLEST everyday English. CURRENT TIME HORIZON: 2025 / 2026. Every post MUST strictly follow this exact 3-part layout separated by double line breaks (\\n\\n):\nLine 1: A bold, scroll-stopping hook line about the Indian trend (1 sentence).\n\\n\\nParagraph 2: The analytical core that unpacks the reality with real facts, verified numbers, and clear comparisons using simple everyday words (2 to 3 sentences, around 50-70 words).\n\\n\\nClosing Line: An engaging takeaway or thought-provoking question that compels readers to comment.\nTotal post length MUST be strictly between 400 and 580 characters (never exceed 600). Never use hashtags, emojis, or labels like "Hook:" or "Body:". Return ONLY a valid JSON object matching the requested schema.'
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
