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
 * Creates a high-engagement viral post prompt based on a trending topic.
 * No country bias — focused purely on engagement, clarity, and facts.
 *
 * @param {string} trendTopic - The trending topic title
 * @param {string} trendContext - Why it's trending / key facts
 * @param {string[]} avoidList - Recent posts/topics to avoid repeating
 * @returns {string} Full prompt string
 */
function createTrendingPostPrompt(trendTopic, trendContext = '', avoidList = []) {
  const avoidStr = avoidList.length > 0 ? avoidList.slice(0, 20).join('\n• ') : 'None';

  return `${SIMPLE_ENGLISH_RULES}

# X_BOT — VIRAL TRENDING TOPIC POST ENGINE (2025-2026)

TRENDING TOPIC: "${trendTopic}"
${trendContext ? `TRENDING CONTEXT: ${trendContext}` : ''}

CURRENT TIME HORIZON: 2025-2026. Write about this topic using the most current, verifiable data and developments available.

YOUR GOAL: Write a post about this trending topic that:
1. STOPS THE SCROLL with a surprising, counterintuitive, or bold hook about this topic
2. GROUNDS the analysis in real, verifiable facts, specific numbers, institution names, or verified data points
3. CLOSES with a sharp insight or thought-provoking question that makes people reply and share
4. Uses the SIMPLEST everyday English — short sentences, everyday words, nothing complicated

ENGAGEMENT RULES:
- Write for curiosity and engagement, not for any particular country, ideology, or agenda
- Pick the most surprising or underreported angle about this topic
- Use real facts that most people don't know — that's what gets shared
- Keep language simple enough for a 12-year-old to follow
- Bold and direct — no hedging, no "perhaps", no "it could be argued"

STRICT POST STRUCTURE (3 parts, separated by double line breaks \\n\\n):
Line 1: One fierce, punchy hook sentence that directly exposes the most surprising angle
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
  "topic": "Specific headline for this post",
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

# X_BOT — CUSTOM TOPIC POST ENGINE (2025-2026)

USER REQUESTED TOPIC: "${userTopic}"

CURRENT TIME HORIZON: 2025-2026. Use the most current facts and developments about this topic.

Write a viral, high-engagement X post about "${userTopic}":
- Pick the most surprising, counterintuitive, or underreported angle
- Use real facts, specific numbers, and verified data
- Use the SIMPLEST everyday English — short sentences, clear words
- Write for global engagement, not for any country, ideology, or agenda

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
   ENGAGEMENT-FIRST FALLBACK BANK
   Global topics — no country bias, high engagement, easy English
========================================================= */

export const FALLBACK_BANK = [
  // F1. AI replacing jobs faster than new ones appear
  {
    topic: 'AI is replacing jobs faster than it creates new ones',
    subtopic: 'Job displacement vs job creation in the AI era',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'AI automation and labor market disruption',
    specificEventOrIssue: 'WEF estimates 85 million jobs displaced vs 97 million created by 2025',
    centralArgument: 'AI creates jobs but those new jobs need skills most workers do not have yet',
    analyticalAngle: 'Old jobs vanishing faster than workers can learn new skills',
    importantStatistics: ['85 million jobs lost', '97 million new jobs need new skills'],
    keywords: ['AI', 'jobs', 'automation', 'workers', 'skills'],
    english: {
      text: 'AI will cut 85 million jobs before 2026 but create 97 million new ones.\n\nThe catch: those 97 million new jobs need skills most workers do not have. Factory workers, call center agents, and basic coders are already being replaced. The new jobs are for AI trainers, data analysts, and machine supervisors — roles that need years of retraining most people cannot afford.\n\nAI is not stealing jobs. It is demanding a price most workers cannot pay.'
    },
    romanUrdu: { text: 'AI 2026 se pehle 85 lakh jobs khatam karega magar 97 lakh nai jobs banana chahiye.\n\nMagar ye nai jobs un logo ke liye hain jo skills seekh sakein. Factory workers, call center agents aur aam programmers ki jagah machine le rahi hai. Nai jobs ke liye AI trainer, data analyst banana parega — jo aksar afforded nahi ho sakta.\n\nAI jobs nahi churata. Wo ek aisi qeemat maang raha hai jo zyada log ada nahi kar saktay.' },
    plainUrdu: { text: 'اے آئی 2026 سے پہلے 85 لاکھ ملازمتیں ختم کرے گا لیکن 97 لاکھ نئی ملازمتیں بنائے گا۔\n\nمگر یہ نئی ملازمتیں ان لوگوں کے لیے ہیں جو نئی مہارتیں سیکھ سکیں۔ فیکٹری مزدور، کال سینٹر ایجنٹ اور ماہر کوڈر کی جگہ مشینیں لے رہی ہیں۔ نئی ملازمتوں کے لیے اے آئی ٹرینر اور ڈیٹا تجزیہ کار بننا ہوگا — جو اکثر لوگوں کے لیے ممکن نہیں۔\n\nاے آئی ملازمتیں نہیں چرا رہا۔ یہ ایک ایسی قیمت مانگ رہا ہے جو بیشتر لوگ ادا نہیں کر سکتے۔' }
  },

  // F2. Global debt crisis
  {
    topic: 'Global debt just crossed $100 trillion for the first time',
    subtopic: 'Government debt burden vs public services',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'Global sovereign debt and interest payment burden',
    specificEventOrIssue: 'IMF warns 60+ countries spending more on debt interest than on healthcare or education',
    centralArgument: 'Countries now pay more interest on old debt than they spend on hospitals or schools',
    analyticalAngle: 'Debt interest payments vs public services spending',
    importantStatistics: ['$100 trillion global debt', '60+ countries pay more interest than healthcare spending'],
    keywords: ['debt', 'government', 'interest', 'schools', 'hospitals'],
    english: {
      text: 'Global government debt crossed $100 trillion in 2024 for the first time in history.\n\nIn over 60 countries, the annual interest payment on that debt now exceeds what governments spend on healthcare or schools. Every dollar spent paying old debt is a dollar not spent on a hospital bed or a teacher. Borrowing to pay old borrowing is the economic trap most countries cannot escape.\n\nWhat happens when a country is too broke to pay for its own people?'
    },
    romanUrdu: { text: '2024 mein dunya ka qarz pehli baar 100 trillion dollar se guzar gaya.\n\n60 se zyada mulkon mein sood ki adaigi hospitals ya schoolon par kharche se zyada ho chuki hai. Puranay qarz ka paisa naya qarz ada karne mein chala jata hai. Ye aik aisi economic jaal hai jo zyada mulk nahi tod saktay.\n\nJab koi mulk apne logon ke liye afford karne ke kabil na rahay toh kya hota hai?' },
    plainUrdu: { text: '2024 میں دنیا کا قرضہ پہلی بار سو ٹریلین ڈالر سے تجاوز کر گیا۔\n\n60 سے زیادہ ممالک میں سالانہ سود کی ادائیگی اسپتالوں یا اسکولوں پر خرچ سے زیادہ ہو چکی ہے۔ پرانے قرضے کا پیسہ نئے قرضے ادا کرنے میں جاتا ہے۔ یہ ایک ایسا معاشی جال ہے جس سے بیشتر ممالک نہیں نکل سکتے۔\n\nجب کوئی ملک اپنے لوگوں کے لیے خرچ کرنے کے قابل نہ رہے تو کیا ہوتا ہے؟' }
  },

  // F3. Social media outrage algorithm
  {
    topic: 'Social media platforms are designed to make you angry on purpose',
    subtopic: 'Outrage algorithms and engagement maximization',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'Platform algorithms amplifying outrage content for ad revenue',
    specificEventOrIssue: 'Internal research shows angry posts get 3x more engagement and are prioritized by algorithms',
    centralArgument: 'Platforms profit from outrage so they deliberately show users more content that makes them angry',
    analyticalAngle: 'Ad-revenue optimization vs user mental health',
    importantStatistics: ['3x more engagement for angry posts', 'billions in ad revenue from outrage'],
    keywords: ['algorithm', 'social media', 'outrage', 'anger', 'ads'],
    english: {
      text: 'Social media platforms know angry posts get 3 times more clicks than calm ones.\n\nSo their algorithms push outrage to the top of your feed on purpose. Every time you feel angry or shocked, you scroll longer. Longer scrolling means more ads seen and more money earned. This is not a bug. This is the product. Your anger is their profit margin.\n\nYou are not using the app. The app is using you.'
    },
    romanUrdu: { text: 'Social media platforms jaantay hain ke ghusse wali posts se 3 guna zyada clicks aate hain.\n\nIs liye unke algorithms mazeed ghussa dikhate hain. Jab tum pareshan hote ho to scroll zyada kartay ho. Zyada scroll matlab zyada ads matlab zyada paisa. Ye glitch nahi hai. Ye design hai. Tumhara ghussa unki kamai hai.\n\nTum app use nahi kar rahe. App tumhein use kar rahi hai.' },
    plainUrdu: { text: 'سوشل میڈیا پلیٹ فارم جانتے ہیں کہ غصے والی پوسٹس سے تین گنا زیادہ کلکس آتے ہیں۔\n\nاس لیے ان کے الگورتھم جان بوجھ کر مزید غصے والا مواد دکھاتے ہیں۔ جب آپ پریشان ہوتے ہیں تو زیادہ دیر سکرول کرتے ہیں۔ زیادہ سکرول مطلب زیادہ اشتہارات مطلب زیادہ کمائی۔ یہ خرابی نہیں ہے۔ یہ ڈیزائن ہے۔ آپ کا غصہ ان کا منافع ہے۔\n\nآپ ایپ استعمال نہیں کر رہے۔ ایپ آپ کو استعمال کر رہی ہے۔' }
  },

  // F4. Billionaire wealth gap
  {
    topic: 'Billionaires got 54% richer since COVID while wages fell',
    subtopic: 'Wealth inequality and pandemic profiteering',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'Billionaire wealth growth vs stagnant wages since 2020',
    specificEventOrIssue: 'Oxfam 2024: richest 1% captured two-thirds of all new global wealth since 2020',
    centralArgument: 'While inflation crushed ordinary families, billionaire wealth grew faster than ever',
    analyticalAngle: 'Billionaire gains vs working family losses during the same period',
    importantStatistics: ['54% wealthier since 2020', '2/3 of new wealth went to top 1%'],
    keywords: ['billionaires', 'wealth', 'inequality', 'wages', 'poverty'],
    english: {
      text: "Since COVID, the world's billionaires got 54% richer in just four years.\n\nAccording to Oxfam, the richest 1% captured two-thirds of all new global wealth created since 2020. During the same period, 60% of the world's people saw their real wages fall when adjusted for inflation. Food banks in rich countries ran out of supplies. Billionaires bought superyachts.\n\nThis is not capitalism working. This is capitalism breaking."
    },
    romanUrdu: { text: 'COVID ke baad sirf char saalon mein duniya ke arabpati 54% zyada ameer ho gaye.\n\nOxfam ke mutabiq 2020 se pehle aayi tamam nai daulat ka do-tihai hissa 1% logon ne le liya. Isi waqt 60% aam logon ki asli tankhwah mehengai ke lihaz se gir gayi. Ameer mulkon mein food banks khatam ho gaye. Arabpatiyon ne nai yacht kharidin.\n\nYe capitalism ka kaam karna nahi hai. Ye capitalism ka tootna hai.' },
    plainUrdu: { text: 'کووڈ کے بعد صرف چار سالوں میں دنیا کے ارب پتی 54 فیصد زیادہ امیر ہو گئے۔\n\nآکسفیم کے مطابق 2020 سے اب تک پیدا ہونے والی نئی دولت کا دو تہائی حصہ صرف 1 فیصد لوگوں نے لے لیا۔ اسی دوران 60 فیصد عام لوگوں کی اصل تنخواہ مہنگائی کی نسبت سے گر گئی۔ امیر ممالک میں فوڈ بینک خالی ہو گئے۔ ارب پتیوں نے نئی یاٹ خریدیں۔\n\nیہ سرمایہ داری کا کام کرنا نہیں ہے۔ یہ سرمایہ داری کا ٹوٹنا ہے۔' }
  },

  // F5. Water scarcity crisis
  {
    topic: 'Half the world will face water shortages by 2030',
    subtopic: 'Global water scarcity and aquifer depletion',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'Global freshwater depletion and food system risk',
    specificEventOrIssue: 'Major aquifers in US, India, and China depleting faster than rainfall replenishes them',
    centralArgument: 'Underground water that feeds farms is being drained faster than rain can refill it',
    analyticalAngle: 'Groundwater depletion vs global food security',
    importantStatistics: ['4 billion people face water scarcity', '37 of 37 major aquifers shrinking'],
    keywords: ['water', 'drought', 'farms', 'food', 'crisis'],
    english: {
      text: 'Over 4 billion people already face water shortages at least one month per year.\n\nNASA satellites confirmed that all 37 of the world\'s largest underground water reserves are shrinking. These aquifers feed farms that grow food for billions. India\'s Punjab, America\'s Great Plains, and China\'s North Plain are all draining fast. When underground water runs out, there is no backup plan.\n\nWe are spending water we cannot replace. What happens next?'
    },
    romanUrdu: { text: 'Pehle se hi 4 arab log har saal kuch mahine pani ki kami ka samna karte hain.\n\nNASA ne sabit kiya ke dunya ke 37 baray underground water reserves sab ghat rahe hain. Ye pani wo khetiyaan chalata hai jo arabon logon ko khilati hain. America, India aur China ke zarkhiz khet is pani par nirbhar hain. Jab ye khatam hoga toh koi backup nahi.\n\nHum wo pani kharch kar rahe hain jo wapas nahi aa sakta. Phir kya hoga?' },
    plainUrdu: { text: 'پہلے سے ہی 4 ارب لوگ سال میں کچھ ماہ پانی کی قلت کا سامنا کرتے ہیں۔\n\nناسا نے ثابت کیا کہ دنیا کے 37 بڑے زیرزمین پانی کے ذخائر سب کم ہو رہے ہیں۔ یہ پانی وہ کھیتیاں چلاتا ہے جو اربوں لوگوں کو کھلاتی ہیں۔ امریکہ، بھارت اور چین کے زرخیز علاقے اس پانی پر منحصر ہیں۔ جب یہ ختم ہوگا تو کوئی متبادل نہیں۔\n\nہم وہ پانی خرچ کر رہے ہیں جو واپس نہیں آ سکتا۔ پھر کیا ہوگا؟' }
  },

  // F6. Semiconductor / chip geopolitics
  {
    topic: "90% of the world's most advanced chips come from one tiny island",
    subtopic: 'Taiwan semiconductor concentration and global supply risk',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'TSMC chip manufacturing monopoly and global supply fragility',
    specificEventOrIssue: 'Taiwan makes 90%+ of advanced chips powering every phone, car, and AI system',
    centralArgument: 'All modern tech — phones, cars, AI — depends on chips from one island that two superpowers are fighting over',
    analyticalAngle: 'Single geographic bottleneck for entire global technology infrastructure',
    importantStatistics: ['90%+ of advanced chips', '$2.6T annual trade at risk'],
    keywords: ['chips', 'Taiwan', 'technology', 'AI', 'supply'],
    english: {
      text: "One island makes over 90% of the world's most advanced computer chips.\n\nEvery iPhone, every Tesla, every AI server, every military drone runs on chips made in Taiwan. The US and China are both threatening conflict over this island. If those factories stop for one week, global smartphone production halts. Car factories freeze. Hospital machines fail. No country has built a backup.\n\nThe world's most powerful technology runs on the world's most dangerous single address."
    },
    romanUrdu: { text: 'Ek jazeera dunya ke 90% se zyada jadeed computer chips banata hai.\n\nHar iPhone, har Tesla, har AI server, har military drone Taiwan ke chips par chalta hai. America aur China dono is jazeere par larai ki dhamki de rahe hain. Ek hafte ke liye factories band hoti hain toh duniya bhar ki gariyan aur hospitals mutasir hoti hain.\n\nDuniya ki sab se taqatwar technology sab se khataraak jagah par nirbhar hai.' },
    plainUrdu: { text: 'ایک چھوٹا جزیرہ دنیا کے 90 فیصد سے زیادہ جدید کمپیوٹر چپس بناتا ہے۔\n\nہر آئی فون، ہر ٹیسلا، ہر اے آئی سرور اور ہر ملٹری ڈرون تائیوان کی چپس پر چلتا ہے۔ امریکہ اور چین دونوں اس جزیرے پر تنازع کی دھمکی دے رہے ہیں۔ اگر ایک ہفتے کے لیے فیکٹریاں بند ہوں تو دنیا بھر کی گاڑیاں اور اسپتال متاثر ہوتے ہیں۔\n\nدنیا کی سب سے طاقتور ٹیکنالوجی سب سے خطرناک ایک مقام پر منحصر ہے۔' }
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
                content: 'You are an expert social media trend analyst and viral storyteller on X. You write captivating, eye-opening posts about breaking global trends, tech breakthroughs, economic data, and real-world statistics using the SIMPLEST everyday English. CURRENT TIME HORIZON: 2025 / 2026. Every post MUST strictly follow this exact 3-part layout separated by double line breaks (\\n\\n):\nLine 1: A bold, scroll-stopping hook line about the trend (1 sentence).\n\\n\\nParagraph 2: The analytical core that unpacks the reality with real facts, verified numbers, and clear comparisons using simple everyday words (2 to 3 sentences, around 50-70 words).\n\\n\\nClosing Line: An engaging takeaway or thought-provoking question that compels readers to comment.\nTotal post length MUST be strictly between 400 and 580 characters (never exceed 600). Never use hashtags, emojis, or labels like "Hook:" or "Body:". Return ONLY a valid JSON object matching the requested schema.'
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
            content: 'You are an expert social media trend analyst and viral storyteller on X. You write captivating, eye-opening posts about breaking global trends, tech breakthroughs, economic data, and real-world statistics using the SIMPLEST everyday English. CURRENT TIME HORIZON: 2025 / 2026. Every post MUST strictly follow this exact 3-part layout separated by double line breaks (\\n\\n):\nLine 1: A bold, scroll-stopping hook line about the trend (1 sentence).\n\\n\\nParagraph 2: The analytical core that unpacks the reality with real facts, verified numbers, and clear comparisons using simple everyday words (2 to 3 sentences, around 50-70 words).\n\\n\\nClosing Line: An engaging takeaway or thought-provoking question that compels readers to comment.\nTotal post length MUST be strictly between 400 and 580 characters (never exceed 600). Never use hashtags, emojis, or labels like "Hook:" or "Body:". Return ONLY a valid JSON object matching the requested schema.'
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
              content: 'You are an expert social media trend analyst and viral storyteller on X. You write captivating, eye-opening posts about breaking global trends, tech breakthroughs, economic data, and real-world statistics using the SIMPLEST everyday English. CURRENT TIME HORIZON: 2025 / 2026. Every post MUST strictly follow this exact 3-part layout separated by double line breaks (\\n\\n):\nLine 1: A bold, scroll-stopping hook line about the trend (1 sentence).\n\\n\\nParagraph 2: The analytical core that unpacks the reality with real facts, verified numbers, and clear comparisons using simple everyday words (2 to 3 sentences, around 50-70 words).\n\\n\\nClosing Line: An engaging takeaway or thought-provoking question that compels readers to comment.\nTotal post length MUST be strictly between 400 and 580 characters (never exceed 600). Never use hashtags, emojis, or labels like "Hook:" or "Body:". Return ONLY a valid JSON object matching the requested schema.'
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
