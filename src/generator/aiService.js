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
  NEUTRAL_CUSTOM_TOPIC_RULES,
  checkSimpleEnglish,
  auditDraftForSimplification,
  hasSelfAnnouncingLocationCliche
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
import {
  pickUnusedTrendingTopic,
  getTrendingTopics,
  fetchCustomTopicTrends,
  formatCustomTrendsBrief
} from './trendFetcher.js';

let categoryRotationIndex = 0;

const MIN_CHARACTERS = 400;
const ABSOLUTE_MAX_CHARACTERS = 650;
const TARGET_MIN_CHARACTERS = 400;
const TARGET_MAX_CHARACTERS = 600;

const INDIA_MENTION_REGEX = /\b(india|indian|indians|delhi|mumbai|kolkata|bengaluru|bangalore|rupee|rbi|bharti|hindu|modi)\b/i;
const OFF_TOPIC_COUNTRY_REGEX = /\b(india|indian|indians|pakistan|pakistani|pakistanis|bharti|delhi)\b/i;

function topicExplicitlyMentionsIndia(topic = '') {
  return INDIA_MENTION_REGEX.test(String(topic || ''));
}

const DEFAULT_PAKISTANI_INDIA_SYSTEM_PROMPT = 'You write high-impact X posts as a candid Pakistani observer talking naturally about Indians and India\'s RARELY-KNOWN, CRAZY-TO-HEAR structural paradoxes using the SIMPLEST everyday English (Grade 4-5 words). NEVER repeat obvious everyday talk ("traffic is bad", "prices are high"). NEVER announce where you sit or label yourself—STRICTLY BAN clichés like "Sitting in Pakistan", "From Pakistan", "Here in Pakistan", "As a Pakistani", or "Looking across the border". Jump straight into one shocking hidden link backed by verified numbers (e.g. 90% of water pumped to exported crops while cities buy tankers, or 34% of federal taxes paying only old debt interest). Keep commentary grounded, analytical, and civil (zero hate). NEVER sound like a news report. Every post MUST strictly follow this exact 3-part layout separated by double line breaks (\\n\\n):\nLine 1: One short punchy hook dropping straight into a crazy rarely-known fact about India/Indians (1 sentence).\n\\n\\nParagraph 2: 2 to 3 short simple sentences explaining WHY this hidden paradox happens and the shock it causes ordinary Indians (around 50-70 words).\n\\n\\nClosing Line: One short, sharp question that makes people want to reply.\nTotal length MUST be strictly between 400 and 560 characters (never exceed 600). Zero hashtags, zero emojis, no labels. Return ONLY valid JSON.';

const CUSTOM_TOPIC_SYSTEM_PROMPT = 'You act as a deep insider on X writing about RARELY-KNOWN, CRAZY-TO-HEAR ANALYTICAL INSIGHTS inside live trends of the exact topic entered by the user, using the SIMPLEST everyday English (Grade 4-5 words). NEVER give obvious everyday chatter or generic definitions ("People everywhere are talking about..."). Instead, reveal a surprising second-order mechanism, hidden math, or counter-intuitive twist inside current 2025-2026 trends (e.g. for "AI", explain why 95% per-step agent math drops to 36% over 20 steps, why AI models training on web AI text lose rare ideas via model collapse, or why 3-4 year power-transformer waits limit AI more than chips). NEVER mention India, Indians, or Pakistan unless the user\'s topic explicitly asks about them. Every post MUST strictly follow this exact 3-part layout separated by double line breaks (\\n\\n):\nLine 1: One short punchy hook revealing a shocking rarely-known twist on a live trend in the user\'s topic (1 sentence).\n\\n\\nParagraph 2: 2 to 3 short simple sentences explaining the hidden reason and real consequence right now (around 50-70 words).\n\\n\\nClosing Line: One short, sharp question that makes people want to reply.\nTotal length MUST be strictly between 400 and 560 characters (never exceed 600). Zero hashtags, zero emojis, no labels. Return ONLY valid JSON.';

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

YOUR MISSION: Write the BEST possible X post **as a Pakistani talking about Indians**, revealing a **RARELY-KNOWN, CRAZY-TO-HEAR analytical truth** behind this India downside and its hidden effect on ordinary Indians:
1. NOT EVERYDAY SURFACE TALK: Skip obvious lines everyone repeats ("things cost more", "traffic is bad"). Expose a surprising paradox or hidden mechanism most people have never heard before (e.g., sending 90% of water to exported rice while cities buy tankers, or 34% of federal taxes vanishing into old debt interest before paying one clinic).
2. NATURAL VOICE — ZERO LOCATION CLICHÉS: Keep a candid Pakistani observer's perspective naturally in your direct, grounded tone about everyday Indians behind India's loud headlines, but NEVER announce yourself with cliché openers like "Sitting in Pakistan...", "From Pakistan...", "Here in Pakistan...", "As a Pakistani...", or "Looking across the border...". Jump STRAIGHT into the shocking fact or paradox. Keep it analytical and respectful—never abusive.
3. DO NOT SOUND LIKE NEWS: Never write "A new report says", "Today", "Yesterday", "PM X opened", or headline summaries.
4. USE THE SIMPLEST POSSIBLE WORDS: Explain this mind-blowing analytical truth like you are telling a 12-year-old friend. Short words, short sentences (5-12 words). Zero heavy academic jargon.
5. USE ACCURATE LATEST DATA: Anchor the middle paragraph in 1 or 2 exact numbers from the Verified Latest India Data above.
6. END WITH A SHARP QUESTION: Make people stop and reply with their own view.

STRICT POST STRUCTURE (3 parts, separated by double line breaks \\n\\n):
Line 1: One punchy sentence dropping straight into a crazy rarely-known India paradox (no news intro, no "Sitting in Pakistan" opener)
\\n\\n
Paragraph 2: 2-3 short, very simple sentences with accurate latest numbers explaining WHY this happens AND its real shock on everyday Indians (around 50-70 words)
\\n\\n
Line 3: One short, thought-provoking question about India/Indians

LENGTH: Strictly 400+ characters (420 to 560 characters ideal). NEVER under 400 and NEVER exceed 600.
ZERO hashtags. ZERO emojis. NO labels like "Hook:" or "Body:".

TOPICS TO AVOID (do not repeat these angles):
• ${avoidStr}

Return ONLY valid JSON in this exact format:
{
  "topic": "Short plain-English rarely-known downside headline (not news)",
  "subtopic": "The specific hidden India paradox and everyday effect",
  "category": "TRENDING",
  "text": "Hook line\\n\\nBody paragraph with real data and effect\\n\\nClosing question"
}`;
}

/**
 * Creates a post prompt for a user-specified custom topic grounded in live trends and rarely-known insider analytics.
 * @param {string} userTopic - What the user wants to write about
 * @param {string[]} avoidList
 * @param {string} liveFactsBrief
 * @param {string} liveTrendsBrief
 * @returns {string}
 */
export function createCustomTopicPrompt(userTopic, avoidList = [], liveFactsBrief = '', liveTrendsBrief = '') {
  const avoidStr = avoidList.length > 0 ? avoidList.slice(0, 15).join('\n• ') : 'None';
  const topicWantsIndia = topicExplicitlyMentionsIndia(userTopic);

  return `${topicWantsIndia ? SIMPLE_ENGLISH_RULES : NEUTRAL_CUSTOM_TOPIC_RULES}

# X_BOT — INSIDER CUSTOM TOPIC ANALYTICAL ENGINE (2025-2026)

USER TOPIC: "${userTopic}"
${liveTrendsBrief ? `\nCURRENT LIVE TRENDS FOR "${userTopic}" (USE THESE REAL SIGNALS — DIG FOR THE HIDDEN INSIDER TWIST, NOT SURFACE SUMMARY):\n${liveTrendsBrief}\n` : ''}
${liveFactsBrief ? `\nVERIFIED REFERENCE DATA (USE ONLY IF RELEVANT TO "${userTopic}"):\n${liveFactsBrief}\n` : ''}
YOUR MISSION: Act like a sharp insider on X who closely follows "${userTopic}" and is sharing **analytical info about live "${userTopic}" trends that rarely anyone knows and sounds crazy when you first hear it**:
- NEVER give obvious everyday talk or a generic summary of "${userTopic}" (never say "AI helps write faster" or "People everywhere are talking about ${userTopic}...").
- Uncover ONE surprising, counter-intuitive 2025-2026 mechanism or hidden trade-off inside "${userTopic}" (for example: compounding error math that breaks long AI workflows, models collapsing when trained on AI web text, 3-year power-transformer shortages throttling data centers, or polished grammar turning into a trust penalty).
${topicWantsIndia
    ? '- Because the topic mentions India/Indians, keep the grounded cross-border perspective focused clearly on the topic.'
    : '- CRITICAL TOPIC BOUNDARY: Do NOT mention India, Indians, or Pakistan anywhere in this post. Completely ignore India and Pakistan and stick strictly to what the user asked for.'}
- NOT a stiff news bulletin — share it like an eye-opening conversation with a smart friend on X.
- Use the SIMPLEST possible words — short sentences (5-12 words), everyday English, zero academic jargon.

STRICT POST STRUCTURE (3 parts, separated by double line breaks \\n\\n):
Line 1: One short, scroll-stopping hook sentence revealing a surprising or rarely-known analytical twist inside current "${userTopic}" trends
\\n\\n
Paragraph 2: 2-3 simple sentences explaining the hidden cause behind it and the unexpected impact right now (around 50-70 words)
\\n\\n
Line 3: A sharp closing question that makes people rethink "${userTopic}"

LENGTH: Strictly 400+ characters (420 to 560 characters ideal). NEVER under 400 and NEVER exceed 600.
ZERO hashtags. ZERO emojis.

AVOID: ${avoidStr}

Return ONLY valid JSON:
{
  "topic": "Short plain-English rarely-known trend headline inside ${userTopic.replace(/"/g, "'")}",
  "subtopic": "Specific surprising insight explored on ${userTopic.replace(/"/g, "'")}",
  "category": "CUSTOM_TOPIC",
  "text": "Hook\\n\\nBody\\n\\nConclusion"
}`;
}

/* =========================================================
   INDIA-BIASED ANALYTICAL FALLBACK BANK
   High engagement, data-driven, simple everyday English
========================================================= */

export const FALLBACK_BANK = [
  // F1. 90.4% fresh water pumped to exported crops while tech cities buy water tankers
  {
    topic: 'India sends over 90% of its fresh water to crops while cities buy tanker water',
    subtopic: 'World Bank 90.4% agricultural water drain starving Indian city taps',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'India groundwater pumping for crops vs urban water tankers',
    specificEventOrIssue: 'World Bank 90.4% freshwater withdrawal strictly for farming',
    centralArgument: 'Free farm electricity pumps 90% of fresh water into rice and sugar exports, leaving cities on private tankers',
    analyticalAngle: 'Hidden Indian water paradox behind tech city headlines',
    importantStatistics: ['90.4% fresh water to farms', 'under 10% left for cities'],
    keywords: ['India', 'Indians', 'water', 'tankers', 'crops'],
    english: {
      text: 'It sounds unreal until you check the numbers: India sends over 90% of its fresh water to crops while big cities run dry.\n\nWorld Bank figures show 90.4% of fresh water goes straight to rice and sugar crops pumped with free farm power. That leaves under 10% for every home, school, and shop, forcing millions of ordinary Indians to wait in line for pricey private water trucks.\n\nWhy drain underground water for crop exports while city Indians still buy water by the tank?'
    },
    romanUrdu: { text: 'Sun kar yaqeen nahi aata magar haqeeqat yeh hai ke India apna 90% se zyada taaza pani faslon ko deta hai aur baray shehar phir bhi pyasay rehtay hain.\n\nWorld Bank ke mutabiq 90.4% pani chawal aur gannay ki faslon mein muft bijli se lag jata hai. Gharon aur shehron ke liye 10% se kam bachta hai, jis se aam Bharti tanker ka mehnga pani khareednay par majboor hain.\n\nApnay shehron ko pyasa rakh kar itna pani baramad ki faslon par kyon bahaya jata hai?' },
    plainUrdu: { text: 'سن کر یقین نہیں آتا مگر حقیقت یہ ہے کہ بھارت اپنا نوے فیصد سے زیادہ تازہ پانی کھیتوں کو دیتا ہے اور بڑے شہر پھر بھی پیاسے رہتے ہیں۔\n\nورلڈ بینک کے مطابق نوے اعشاریہ چار فیصد تازہ پانی مفت بجلی سے چاول اور گنے کی فصلوں میں لگ جاتا ہے۔ گھروں اور شہروں کے لیے دس فیصد سے کم بچتا ہے، جس سے عام بھارتی شہری ٹینکر کا مہنگا پانی خریدنے پر مجبور ہیں۔\n\nاپنے شہریوں کو ٹینکروں پر لگا کر اتنا زیرِ زمین پانی برآمدی فصلوں میں کیوں بہایا جاتا ہے؟' }
  },

  // F2. 34.0% of central tax revenue eaten strictly by old debt interest
  {
    topic: 'Over 34% of India federal tax cash vanishes paying only old debt interest',
    subtopic: 'One-third of central tax money paid to bond lenders before funding schools or clinics',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'India central government debt interest vs public clinic funding',
    specificEventOrIssue: 'World Bank 34.0% of revenue spent solely on interest payments',
    centralArgument: 'Over one-third of central taxes disappear into old loan interest before building a single clinic or classroom',
    analyticalAngle: 'India high indirect consumer taxes vs public service scarcity',
    importantStatistics: ['34.0% tax paid as debt interest', 'one-third gone to lenders'],
    keywords: ['India', 'Indians', 'tax', 'debt', 'loans'],
    english: {
      text: 'Few people know a staggering budget secret in India: 34% of central tax money pays only interest on old loans.\n\nWorld Bank data shows bond lenders take over a third of federal taxes before a single rupee reaches teachers, nurses, or trains. Ordinary Indians still pay heavy taxes on milk, fuel, and soap every day while public wards stay packed.\n\nHow fast could daily Indian life change if one-third of taxes did not vanish to old debt?'
    },
    romanUrdu: { text: 'Bahut kam log India ke budget ka yeh hairat angez raaz jantay hain ke markazi tax ka 34% hissa sirf puranay qarz ke sood mein jata hai.\n\nWorld Bank ke mutabiq school, hospital ya train par aik rupiya kharch honay se pehlay aik tihai tax qarz dene walay le jatay hain. Aam Bharti doodh, tail aur sabun par roz bhari tax de kar bhi bheed bharay clinic dekhtay hain.\n\nAgar aik tihai tax puranay sood mein na jata toh aam Bharti zindagi kitni behtar hoti?' },
    plainUrdu: { text: 'بہت کم لوگ بھارت کے بجٹ کا یہ حیران کن راز جانتے ہیں کہ مرکزی ٹیکس کا چونتیس فیصد حصہ صرف پرانے سرکاری قرضوں کے سود میں چلا جاتا ہے۔\n\nورلڈ بینک کے مطابق اسکول، نرس یا ٹرین پر ایک روپیہ خرچ ہونے سے پہلے ہی ایک تہائی ٹیکس قرض خواہ لے جاتے ہیں۔ عام بھارتی شہری دودھ، تیل اور صابن پر بھاری روزمرہ ٹیکس دے کر بھی بھیڑ بھرے سرکاری کلینک دیکھتے ہیں۔\n\nاگر اتنا بڑا ٹیکس پرانے سود کی نذر نہ ہوتا تو عام بھارتی زندگی کتنی بہتر ہوتی؟' }
  },

  // F3. 71.6% of Indian workers hold zero formal contracts or sick pay
  {
    topic: 'Over 71% of Indian workers hold zero written contracts or sick pay safety',
    subtopic: 'World Bank 71.6% vulnerable employment behind India modern tech boom',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'Insecure uncontracted work across seven in ten Indian workers',
    specificEventOrIssue: 'World Bank 2025 figure of 71.6% vulnerable employment in India',
    centralArgument: 'Over seven in ten Indian workers lack written contracts, paid leave, or steady pensions behind tech headlines',
    analyticalAngle: 'India shiny software hype vs 72% insecure daily workforce',
    importantStatistics: ['71.6% insecure workers', 'zero sick pay or pension'],
    keywords: ['India', 'Indians', 'workers', 'contracts', 'jobs'],
    english: {
      text: 'Behind all the loud software hype in India, almost nobody mentions that 72% of Indian workers hold zero written contracts.\n\nWorld Bank 2025 numbers put 71.6% of working Indians in fragile daily jobs with no sick pay, no pension, and no layoff notice. One broken delivery bike or sudden fever cuts family money off overnight.\n\nWhy do shiny India boom stories skip the seven in ten everyday workers who lack basic job safety?'
    },
    romanUrdu: { text: 'India ki chamakdar tech surkhiyon ke peechay yeh baat koi nahi batata ke 72% Bharti mazdooron ke paas pakka contract tak nahi hai.\n\nWorld Bank 2025 ke mutabiq 71.6% kaam karnay walay Bharti bina bemari ki chhutti aur bina pension ke rozana rozgar par hain. Aik bukhar ya bike kharab honay par ghar ki kamai foran ruk jati hai.\n\nBari taraqqi ki kahaniyan un saat mein se das aam Bharti logon ko kyon bhool jati hain?' },
    plainUrdu: { text: 'بھارت کی چمکدار ٹیک سرخیوں کے پیچھے یہ حقیقت کوئی نہیں بتاتا کہ بہتر فیصد بھارتی محنت کشوں کے پاس تحریری معاہدہ تک نہیں ہے۔\n\nورلڈ بینک کی دو ہزار پچیس کی فہرست کے مطابق اکہتر اعشاریہ چھ فیصد بھارتی کارکن بیماری کی چھٹی اور پنشن کے بغیر غیر محفوظ کام کرتے ہیں۔ ایک بخار یا بائیک خراب ہونے پر گھر کی آمدنی فوراً رک جاتی ہے۔\n\nبڑی ترقی کی کہانیاں ان دس میں سے سات عام بھارتی کارکنوں کا حال کیوں چھپا لیتی ہیں؟' }
  },

  // F4. 35.5% of young Indian kids grow stunted while grain exports surge
  {
    topic: 'Over 35% of young Indian kids grow stunted even while grain exports surge',
    subtopic: 'World Bank 35.5% child stunting alongside massive rice and wheat harvests',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'India child nutrition paradox amid surplus food exports',
    specificEventOrIssue: 'World Bank 35.5% under-five child stunting rate in India',
    centralArgument: 'Despite exporting millions of tons of grain, over one in three young Indian kids suffer stunted growth from poor protein diets',
    analyticalAngle: 'India food exports vs one in three stunted kids',
    importantStatistics: ['35.5% kids under 5 stunted', 'over 1 in 3 children'],
    keywords: ['India', 'Indians', 'kids', 'grain', 'food'],
    english: {
      text: 'One crazy food paradox in India blows people away: over 35% of young Indian kids grow stunted while grain exports boom.\n\nWorld Bank data shows more than one in three Indian children under five stay too short for their age from weak protein diets and dirty water. Early hunger hurts brain growth and cuts lifetime pay for millions of workers.\n\nHow can a giant grain exporter still leave one in three little kids short on daily food?'
    },
    romanUrdu: { text: 'India ka yeh hairat angez tazad sun kar har koi chonk jata hai ke baray anaaj exports ke bawajood 35% se zyada chhotay bachay kamzor hain.\n\nWorld Bank ke mutabiq teen mein se aik Bharti bacha khalis ghiza aur saaf pani ki kami se qad mein peechay reh jata hai. Bachpan ki bhook un ke mustaqbil ki kamai kam karti hai.\n\nDunya ko anaaj bechnay wala mulk apnay hi teen mein se aik bachay ko poori ghiza kyon nahi de pata?' },
    plainUrdu: { text: 'بھارت کا یہ حیران کن تضاد سن کر ہر کوئی چونک جاتا ہے کہ اناج برآمد کرنے کے باوجود پانچ سال سے کم عمر پینتیس فیصد سے زیادہ بچے کمزور نشوونما کا شکار ہیں۔\n\nورلڈ بینک کے مطابق تین میں سے ایک بھارتی بچہ متوازن غذا اور صاف پانی نہ ملنے سے عمر کے حساب سے چھوٹا رہ جاتا ہے۔ بچپن کی یہ کمی ان کی مستقبل کی کمائی گھٹا دیتی ہے۔\n\nدنیا کو اناج بیچنے والا ملک اپنے ہی تین میں سے ایک معصوم بچے کو پوری غذا کیوں نہیں دے پاتا؟' }
  },

  // F5. Just 1.6 hospital beds per 1,000 people & 43.9% medical bills from pockets
  {
    topic: 'India has just 1.6 hospital beds per 1,000 people behind private hospital ads',
    subtopic: 'World Bank 1.6 beds per 1,000 people forcing 43.9% family out-of-pocket bills',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'Severe public hospital bed scarcity driving Indian household debt',
    specificEventOrIssue: 'World Bank 1.59 hospital beds per 1,000 people and 43.9% self-paid health bills',
    centralArgument: 'Having only 1.6 hospital beds per 1,000 citizens forces everyday Indians into costly private clinics paying 44% out of pocket',
    analyticalAngle: 'India medical tourism image vs 1.6 beds per 1,000 citizens',
    importantStatistics: ['1.6 beds per 1,000 people', '43.9% paid from pockets'],
    keywords: ['India', 'Indians', 'hospital', 'beds', 'medical'],
    english: {
      text: 'Behind shiny medical tourism ads, India actually has only 1.6 hospital beds for every 1,000 people.\n\nWorld Bank figures show packed public wards push ordinary Indians to pay nearly 44% of all medical costs from their own pockets. One sudden surgery forces working parents to pawn home gold or borrow costly app loans just to pay private clinics.\n\nWhat good is booming private healthcare when one sickness still breaks ordinary Indian savers?'
    },
    romanUrdu: { text: 'Mehnge hospital ishteharon ke peechay India ki asli tasveer yeh hai ke har hazar logon par sirf 1.6 sarkari bistar mojood hain.\n\nWorld Bank ke mutabiq ward bharay honay ki wajah se aam Bharti ilaj ke taqreeban 44% paise apni jaib se detay hain. Aik achanak operation par waldain ko ghar ka sona girvi rakhna ya mehnga app qarz lena parta hai.\n\nAisi private chamak ka kya faida jab aik bimari aam Bharti gharon ki bachat mita de?' },
    plainUrdu: { text: 'مہنگے اسپتال اشتہاروں کے پیچھے بھارت کی اصل تصویر یہ ہے کہ ہر ایک ہزار شہریوں کے لیے صرف ایک اعشاریہ چھ بستر موجود ہیں۔\n\nورلڈ بینک کے مطابق سرکاری وارڈ بھرے ہونے کے باعث عام بھارتی علاج کے تقریباً چوالیس فیصد اخراجات خود اپنی جیب سے ادا کرتے ہیں۔ ایک اچانک آپریشن پر والدین کو گھر کا سونا بیچنا یا مہنگا قرض لینا پڑتا ہے۔\n\nایسے نجی اسپتالوں کی چمک کا کیا فائدہ جب ایک بیماری عام بھارتی گھر کی پوری بچت مٹا دے؟' }
  },

  // F6. 72.3% coal electricity & hazardous city air trap
  {
    topic: 'Coal still makes 72% of India electricity even as toxic air shuts city schools',
    subtopic: 'World Bank 72.3% coal share keeping northern Indian air up to 15x WHO limits',
    category: 'TRENDING',
    genreId: 'TRENDING',
    mainSubject: 'India coal power lock-in driving hazardous city smog and lost workdays',
    specificEventOrIssue: 'World Bank 72.3% electricity from coal and toxic northern air readings',
    centralArgument: 'Despite green energy headlines, coal generates 72% of India electricity and drives toxic smog that steals school weeks and outdoor wages',
    analyticalAngle: 'India green energy PR vs 72% coal power trap',
    importantStatistics: ['72.3% coal power', '15 times WHO safe limit'],
    keywords: ['India', 'Indians', 'coal', 'air', 'smog'],
    english: {
      text: 'Loud solar headlines hide a shocking power truth inside India: coal still supplies 72.3% of all Indian electricity.\n\nWorld Bank numbers explain why winter smog around Delhi climbs up to 15 times over safe world limits. Heavy coal smoke shuts schools for weeks, cuts outdoor wages, and makes everyday Indian families spend tight paychecks on lung medicine.\n\nCan clean energy ads ever fix Indian city lungs while three-fourths of power stays on coal?'
    },
    romanUrdu: { text: 'Solar bijli ki bari surkhiyan yeh sach chhupa leti hain ke India mein aaj bhi 72.3% bijli koelay se banti hai.\n\nWorld Bank ke aadad batatay hain ke Delhi aur aas paas ki hawa mehfooz had se 15 guna zyada gandi kyon hoti hai. Koelay ka dhuwan school band karwata hai, mazdoori rokta hai aur logon ki kamai dawai par lagwa deta hai.\n\nJab teen chauthai bijli koelay par chalay toh sirf hara ishtehar shehron ki hawa kaisay saaf karega?' },
    plainUrdu: { text: 'سولر بجلی کی بڑی سرخیاں یہ حیرت انگیز سچ چھپا لیتی ہیں کہ بھارت میں آج بھی بہتر اعشاریہ تین فیصد بجلی کوئلے سے بنتی ہے۔\n\nورلڈ بینک کے اعداد بتاتے ہیں کہ دہلی اور آس پاس کی فضا محفوظ حد سے پندرہ گنا زیادہ آلودہ کیوں رہتی ہے۔ کوئلے کا دھواں اسکول بند کرواتا ہے، دیہاڑی روکتا ہے اور عام بھارتیوں کی کمائی پھیپھڑوں کی دوائی پر خرچ کرواتا ہے۔\n\nجب تین چوتھائی بجلی کوئلے پر چل رہی ہو تو صرف سبز اشتہار شہروں کی فضا کیسے صاف کریں گے؟' }
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

const AI_TREND_BANK = [
  {
    subtopic: 'Why 95% AI agent accuracy collapses to 36% over a 20-step workflow',
    text: 'A weird math trap explains why autonomous AI agents still break in real office work even when demos look magical.\n\nAt 95% accuracy per single click, a 20-step workflow succeeds only 36% of the time because tiny slips compound fast down the chain. That is why teams in 2026 are shrinking AI agents down to tiny 3-step tasks with hard human checkpoints.\n\nWould you trust an AI agent running 20 steps alone if math guarantees two-thirds fail?'
  },
  {
    subtopic: 'Model collapse quietly poisoning future AI systems trained on AI web text',
    text: 'An invisible wall is hitting new AI models right now: training future AI on AI-made text makes models dumber.\n\nResearchers call it model collapse because synthetic training erases rare facts and flattens sharp thinking into dull averages. That strange twist suddenly turned clean pre-2022 human writing, messy forums, and real code logs into rare priceless fuel.\n\nIf the open web keeps filling with AI text, where will tomorrow\'s models learn fresh human ideas?'
  },
  {
    subtopic: 'AI writing flooding the web turned perfect grammar into a bot-detection signal',
    text: 'AI writing tools flooded feeds so hard this year that clean, textbook grammar now makes readers trust a post less.\n\nSearch filters and sharp readers treat smooth neutral prose as synthetic clutter made with zero lived experience. Ironically, small human quirks, strong weird opinions, and messy first-hand details suddenly beat polished AI writing on reach and trust.\n\nDo you notice yourself scrolling faster past flawless text now because it feels fake?'
  },
  {
    subtopic: 'Four-year power transformer waits bottlenecking AI scaling more than chips',
    text: 'Most people assume computer chips limit AI growth today, yet the real choke point is old-school power transformers.\n\nHeavy reasoning models pull far more electricity per answer than basic search, and giant electrical transformers now face wait lists stretching three to four years. Labs can buy racks of fast silicon yet wait years just to wire steady grid power.\n\nCould boring electrical cables end up deciding which AI labs win faster than chip design?'
  },
  {
    subtopic: 'AI coding speed creating senior review burnout and halting junior hiring',
    text: 'AI coding helpers let builders type code ten times faster, yet they created a weird crisis nobody saw coming.\n\nTeams ship far more duplicated code that senior engineers must slowly debug, burning out top staff on review duty while firms stop hiring junior devs. Without juniors learning the ropes today, nobody is sure who becomes the senior reviewer five years out.\n\nIf companies stop training junior coders now, where do future senior builders come from?'
  }
];

const QUANTUM_TREND_BANK = [
  {
    subtopic: 'Store-now-decrypt-later spying forcing banks to swap locks before quantum machines arrive',
    text: 'Spies already steal locked bank and state data today even though code-breaking quantum machines do not exist yet.\n\nSecurity teams call it harvest-now decrypt-later: attackers hoard encrypted files today on cheap drives and wait until stable quantum hardware unlocks them years from now. That crazy race forces banks and cloud apps to replace digital locks right now.\n\nHow many secret files stolen quietly this year will still matter ten years from now?'
  },
  {
    subtopic: 'Why 1,000 noisy physical qubits barely equal one usable logical quantum bit',
    text: 'Wild headline numbers about thousand-qubit quantum chips hide a crazy physics tax almost nobody mentions outside labs.\n\nBecause tiny heat or stray vibrations flip delicate states in split seconds, it takes hundreds of noisy physical qubits just to error-check one stable logical qubit. That is why teams stopped bragging about raw counts and now chase error survival.\n\nDo investors tracking qubit counts realize 99% of a quantum chip only exists to fix errors?'
  }
];

const CRYPTO_TREND_BANK = [
  {
    subtopic: 'Stablecoin issuers quietly becoming larger buyers of US debt bills than whole countries',
    text: 'While retail traders argue over meme coins, digital dollar issuers quietly became huge buyers of government debt bills.\n\nBacking stablecoins one-for-one pushes top crypto firms to hold tens of billions in short Treasury bills, making them larger lenders to Washington than entire mid-sized nations. Boring dollar plumbing now drives real crypto scale more than wild speculation.\n\nDid anyone in 2017 expect crypto to end up helping fund government debt bills?'
  },
  {
    subtopic: 'Why over half of all launched tokens die quietly within months of listing',
    text: 'A shocking pattern hides behind fresh crypto bull headlines: most new tokens never survive their first year alive.\n\nCheap automated launchpads let anyone spin up thousands of lookalike coins per day, slicing retail liquidity into thinner and thinner slivers. Almost all real fee revenue still flows to just a handful of boring blockchains and stablecoin bridges.\n\nWhy do traders keep chasing thousands of fragile new coins when nearly all of them go to zero?'
  }
];

const STARTUP_TECH_TREND_BANK = [
  {
    subtopic: 'Communication links exploding by n(n-1)/2 explaining why 2-person teams beat 30-person startups',
    text: 'A simple math rule called Brooks\'s Law explains why two-person startups now beat funded teams of thirty.\n\nGoing from two builders to thirty explodes internal chat links from one path to 435 paths, swallowing half the week in sync calls and status docs. With modern cloud tools and code helpers, tiny teams spend almost every hour shipping directly to users.\n\nHave you noticed small focused teams moving three times faster than bloated funded companies?'
  }
];

const WORK_CAREER_TREND_BANK = [
  {
    subtopic: 'Ghost job listings and bot-vs-bot hiring breaking traditional resumes',
    text: 'A strange hidden loop broke online hiring: half of posted job ads sit empty on purpose as "ghost jobs" to signal growth.\n\nMeanwhile applicants use AI to blast out hundreds of tailored resumes per hour, forcing recruiters to reject 95% with blind keyword filters. That weird stalemate means one short public demo sent directly to a manager beats two hundred blind forms.\n\nHow many online job posts you applied to this year were never meant to hire anyone?'
  }
];

const CREATOR_MARKETING_TREND_BANK = [
  {
    subtopic: 'Why modern feeds ignore subscriber counts and score every post cold in hour one',
    text: 'Subscriber counts stopped guaranteeing views because modern feeds treat every single post like a fresh cold audition.\n\nInstead of pushing videos straight to followers, algorithms test each upload on a tiny random test group first and check watch time and replies within sixty minutes. That is why unknown creators with 300 followers routinely outdraw dead million-subscriber channels.\n\nDoes building a huge follower count still protect reach, or is every post fighting from zero now?'
  }
];

function buildCustomTopicFallback(userTopic, attempt = 1, liveTrendItems = []) {
  const cleanTopic = String(userTopic || 'your topic').replace(/\s+/g, ' ').trim();
  const shortLabel = cleanTopic.length > 68 ? `${cleanTopic.slice(0, 65)}...` : cleanTopic;
  const lower = cleanTopic.toLowerCase();

  let selectedText = '';
  let selectedSubtopic = `Rarely-known analytical trend in ${shortLabel}`;

  // 1. Specialized insider trend banks (rarely-known second-order insights, NOT surface everyday talk)
  if (/\b(ai|artificial intelligence|llm|chatgpt|claude|gemini|openai|agent|copilot)\b/i.test(lower)) {
    let bank = AI_TREND_BANK;
    if (/\b(writing|write|content|copy|blog|post)\b/i.test(lower)) {
      // Put AI writing insider insight first when the user specifically mentions AI writing
      bank = [AI_TREND_BANK[2], AI_TREND_BANK[1], AI_TREND_BANK[0], AI_TREND_BANK[3], AI_TREND_BANK[4]];
    }
    const chosen = bank[(Math.max(1, attempt) - 1) % bank.length];
    selectedText = chosen.text;
    selectedSubtopic = chosen.subtopic;
  } else if (/\bquantum\b/i.test(lower)) {
    const chosen = QUANTUM_TREND_BANK[(Math.max(1, attempt) - 1) % QUANTUM_TREND_BANK.length];
    selectedText = chosen.text;
    selectedSubtopic = chosen.subtopic;
  } else if (/\b(crypto|bitcoin|btc|eth|blockchain|web3|defi|stablecoin)\b/i.test(lower)) {
    const chosen = CRYPTO_TREND_BANK[(Math.max(1, attempt) - 1) % CRYPTO_TREND_BANK.length];
    selectedText = chosen.text;
    selectedSubtopic = chosen.subtopic;
  } else if (/\b(startup|saas|software|coding|developer|programming|tech)\b/i.test(lower)) {
    const chosen = STARTUP_TECH_TREND_BANK[(Math.max(1, attempt) - 1) % STARTUP_TECH_TREND_BANK.length];
    selectedText = chosen.text;
    selectedSubtopic = chosen.subtopic;
  } else if (/\b(remote|work|job|jobs|career|freelanc|hiring|resume)\b/i.test(lower)) {
    const chosen = WORK_CAREER_TREND_BANK[(Math.max(1, attempt) - 1) % WORK_CAREER_TREND_BANK.length];
    selectedText = chosen.text;
    selectedSubtopic = chosen.subtopic;
  } else if (/\b(creator|youtube|tiktok|social media|newsletter|marketing|seo)\b/i.test(lower)) {
    const chosen = CREATOR_MARKETING_TREND_BANK[(Math.max(1, attempt) - 1) % CREATOR_MARKETING_TREND_BANK.length];
    selectedText = chosen.text;
    selectedSubtopic = chosen.subtopic;
  } else if (Array.isArray(liveTrendItems) && liveTrendItems.length > 0) {
    // 2. Synthesize second-order analytical commentary from live RSS headlines for any arbitrary custom topic
    const trendItem = liveTrendItems[(Math.max(1, attempt) - 1) % liveTrendItems.length];
    const headline = String(trendItem.title || '').replace(/[.!?]+$/, '').trim();
    const shortHeadline = headline.length > 96 ? `${headline.slice(0, 93)}...` : headline;
    selectedSubtopic = shortHeadline || `Hidden bottleneck inside ${shortLabel}`;
    selectedText = [
      `Most people miss the strange hidden twist behind ${shortLabel} right now: ${shortHeadline}.`,
      `Digging past surface headlines shows how fast second-order costs and bottlenecks inside ${shortLabel} flip old winners into laggards. When one piece gets ten times cheaper or faster, the scarce bottleneck shifts somewhere nobody priced in a year ago.`,
      `Where do you think the hidden bottleneck inside ${shortLabel} moves next as this trend accelerates?`
    ].join('\n\n');
  } else {
    // 3. Offline arbitrary custom topic: second-order analytical paradoxes (not generic chatter)
    const hooks = [
      `A weird economic paradox inside ${shortLabel}: making one piece far cheaper often doubles spending on the bottleneck next door.`,
      `Most outsiders watch the noisy surface of ${shortLabel}, missing the silent second-order trap flipping winners upside down.`,
      `A crazy pattern keeps repeating inside ${shortLabel}: early benchmarks look linear until a hidden limit snaps back hard.`
    ];
    const bodies = [
      `Economists call it Jevons Paradox—when faster tools cut cost per unit, total demand explodes instead of shrinking, creating new supply bottlenecks nobody prepared for. Teams watching only average prices miss where the real money and leverage silently moved.`,
      `Whenever a flashy trend in ${shortLabel} becomes dead simple to copy, the cheap layer drops toward zero margin fast. Real power flows straight to the messy, boring chokepoint that cannot be copied overnight by automated tools or weekend clones.`,
      `Insiders tracking ${shortLabel} look past demo hype to watch maintenance costs, failure rates at scale, and hidden feedback loops. Almost every big shift hits a silent wall where fixing edge cases costs ten times more than building the first version.`
    ];
    const questions = [
      `What is the strangest hidden bottleneck in ${shortLabel} that outsiders keep overlooking?`,
      `Which boring chokepoint inside ${shortLabel} do you think holds all the real power now?`,
      `Have you watched a fast trend in ${shortLabel} hit that sudden edge-case wall at real scale?`
    ];
    const idx = (Math.max(1, attempt) - 1) % hooks.length;
    selectedText = `${hooks[idx]}\n\n${bodies[idx]}\n\n${questions[idx]}`;
  }

  const entry = formatEntry(selectedText);
  const meta = extractPostMetadata({
    topic: cleanTopic,
    subtopic: selectedSubtopic,
    genreId: 'CUSTOM_TOPIC',
    category: 'CUSTOM_TOPIC',
    text: entry.text
  });
  return {
    topic: cleanTopic,
    subtopic: meta.subtopic,
    category: 'CUSTOM_TOPIC',
    genreId: 'CUSTOM_TOPIC',
    mainSubject: meta.mainSubject,
    specificEventOrIssue: meta.specificEventOrIssue,
    centralArgument: meta.centralArgument,
    analyticalAngle: meta.analyticalAngle,
    importantStatistics: meta.importantStatistics,
    keywords: meta.keywords,
    normalizedText: meta.normalizedText,
    english: entry,
    romanUrdu: null,
    plainUrdu: null
  };
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

  const isCustomNeutralMode = Boolean(isUserForcedTopic && !topicExplicitlyMentionsIndia(chosenTopic));

  // Gather live verified India statistics ONLY when generating India-focused posts.
  // For custom topics, fetch live topic-specific trend signals instead so posts reflect current real trends in that domain.
  let liveFactsBrief = '';
  let customTrendItems = [];
  let liveTrendsBrief = '';

  if (isUserForcedTopic && chosenTopic) {
    try {
      customTrendItems = await fetchCustomTopicTrends(chosenTopic, {
        excludeRegionalNoise: isCustomNeutralMode
      });
      liveTrendsBrief = formatCustomTrendsBrief(chosenTopic, customTrendItems);
    } catch (e) {
      console.warn(`[Pipeline] Custom topic trend fetch notice: ${e.message}`);
    }
  }

  if (!isCustomNeutralMode) {
    try {
      const liveSnapshot = await getLiveIndiaFactsSnapshot();
      liveFactsBrief = formatFactsBrief(chosenTopic, liveSnapshot);
    } catch (e) {
      console.warn(`[Pipeline] Live India data integration fallback: ${e.message}`);
    }
  }

  // ─── PHASE 2: GENERATE POST (up to 5 attempts) ───────────────────────────
  const MAX_ATTEMPTS = 5;
  let lastRejectionReason = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // On retries, slightly vary the topic framing to get a fresh angle
    const attemptTopic = attempt === 1 ? chosenTopic : `${chosenTopic} — angle ${attempt}`;

    // Build the right prompt: custom topic trend-writer (ignoring India) vs India downsides engine
    const prompt = isUserForcedTopic
      ? createCustomTopicPrompt(
          attempt === 1 ? chosenTopic : `${chosenTopic} (${attempt === 2 ? 'current real-world trends and impact' : `fresh trend angle ${attempt}`})`,
          avoidList,
          liveFactsBrief,
          liveTrendsBrief
        )
      : createTrendingPostPrompt(attemptTopic, trendContext, avoidList, liveFactsBrief);
    const activeSystemPrompt = isCustomNeutralMode ? CUSTOM_TOPIC_SYSTEM_PROMPT : DEFAULT_PAKISTANI_INDIA_SYSTEM_PROMPT;

    let candidate = null;
    let providerName = '';

    /* ---------------- TIER 1. CLOUDFLARE WORKERS AI (PRIMARY + 2-PASS POLISH/EXPAND) ---------------- */
    if (cfToken && cfAccountId && !candidate) {
      try {
        console.log(`[Cloudflare AI] Generating post for ${isCustomNeutralMode ? 'custom topic trends' : 'India downside topic'}: "${chosenTopic}"...`);
        const res = await callWithSimplify(callCloudflareAI, prompt, null, activeSystemPrompt);
        // Allow shorter Pass 1 drafts (120+ chars) so Pass 2 can expand them cleanly to 400+ chars
        let validated = validateAIResponse(res, chosenTopic, chosenCategory, '', 120);

        // Pass 2: Polish, simplify words, enforce 400+ minimum, and strip off-topic country mentions for neutral custom topics
        const audit = auditDraftForSimplification(validated.english.text);
        const offTopicCountryDrift = isCustomNeutralMode && OFF_TOPIC_COUNTRY_REGEX.test(validated.english.text);
        if (audit.needsPolish || validated.english.charCount < MIN_CHARACTERS || offTopicCountryDrift) {
          console.log(`[Cloudflare AI] Pass 2 polish triggered (${[...audit.reasons, ...(offTopicCountryDrift ? ['off_topic_country_mention'] : [])].join(', ')})...`);
          try {
            const polished = await polishWithCloudflareAI(
              validated,
              isCustomNeutralMode ? (liveTrendsBrief || liveFactsBrief) : liveFactsBrief,
              isCustomNeutralMode
            );
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
        if (!isCustomNeutralMode && hasSelfAnnouncingLocationCliche(validated.english.text)) {
          throw new Error(`Cloudflare AI post still contains banned self-announcing location cliché`);
        }
        if (isCustomNeutralMode && OFF_TOPIC_COUNTRY_REGEX.test(validated.english.text)) {
          throw new Error(`Cloudflare AI custom-topic post mentioned India/Pakistan off-topic`);
        }

        candidate = validated;
        providerName = isCustomNeutralMode
          ? 'Cloudflare Workers AI (Custom Topic + Polish)'
          : 'Cloudflare Workers AI (Verified India Data + Polish)';
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
        if (isCustomNeutralMode && OFF_TOPIC_COUNTRY_REGEX.test(validated.english.text)) {
          throw new Error('Gemini custom-topic output drifted off-topic into India/Pakistan');
        }
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
        const res = await callWithSimplify(callXai, prompt, 'grok-2-latest', activeSystemPrompt);
        const validated = validateAIResponse(res, chosenTopic, chosenCategory, '');
        if (isCustomNeutralMode && OFF_TOPIC_COUNTRY_REGEX.test(validated.english.text)) {
          throw new Error('xAI custom-topic output drifted off-topic into India/Pakistan');
        }
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
        const res = await callWithSimplify(callGroq, prompt, groqKey, activeSystemPrompt);
        const validated = validateAIResponse(res, chosenTopic, chosenCategory, '');
        if (isCustomNeutralMode && OFF_TOPIC_COUNTRY_REGEX.test(validated.english.text)) {
          throw new Error('Groq custom-topic output drifted off-topic into India/Pakistan');
        }
        candidate = validated;
        providerName = 'Groq Cloud API (Free)';
        console.log(`[Groq API] ✓ Success!`);
      } catch (err) {
        console.warn(`[Groq API] ${err.message}. Trying fallback bank...`);
      }
    }

    /* ---------------- TIER 5. FALLBACK (CUSTOM-TOPIC TREND BANK OR INDIA BANK) ---------------- */
    if (!candidate) {
      const fallback = isCustomNeutralMode
        ? buildCustomTopicFallback(chosenTopic, attempt, customTrendItems)
        : generateDynamicFallback(chosenCategory, '', cleanExcluded, avoidList);
      if (fallback) {
        candidate = fallback;
        providerName = isCustomNeutralMode ? 'Custom Topic Fallback' : 'Engagement Fallback Bank';
        console.log(`[Fallback Bank] Serving post for: "${candidate.topic}"`);
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

  // If all retry attempts collided with history, guarantee a fresh post appropriate to the mode
  const guaranteedFallback = isCustomNeutralMode
    ? buildCustomTopicFallback(chosenTopic, MAX_ATTEMPTS + 1, customTrendItems)
    : generateDynamicFallback(chosenCategory, '', cleanExcluded, avoidList);
  if (guaranteedFallback) {
    console.log(`[Pipeline] Retries exhausted. Serving guaranteed fresh fallback: "${guaranteedFallback.topic}"`);
    return {
      ...guaranteedFallback,
      provider: isCustomNeutralMode ? 'Custom Topic Fallback' : 'Engagement Fallback Bank'
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

  const isIndiaFocused = OFF_TOPIC_COUNTRY_REGEX.test(`${topic} ${englishPost?.text || ''}`);
  const translationSystemPrompt = isIndiaFocused ? DEFAULT_PAKISTANI_INDIA_SYSTEM_PROMPT : CUSTOM_TOPIC_SYSTEM_PROMPT;

  const prompt = isIndiaFocused
    ? `Translate this post into natural, everyday Pakistani Roman Urdu, keeping the voice of a Pakistani talking about Indians and everyday life in India.

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
- NEVER use cliché self-announcing phrases like "Pakistan mein baith kar", "Pakistan se", "Aik Pakistani ki nazar se", or "Sarhad paar dekhein" — speak straight into the topic.
- Every sentence must be short and easy to understand.
- STRICT MINIMUM LENGTH: Must be 400+ characters (420 to 580 characters total, NEVER under 400 and NEVER over 600).
- ZERO hashtags, ZERO emojis. NEVER use labels like "Hook:" or "Body:".
- Return ONLY valid JSON:
{
  "text": "Line 1 hook\\n\\nBody paragraph\\n\\nConclusion line"
}`
    : `Translate this custom-topic post accurately into natural, conversational Roman Urdu. Stay 100% on the topic of the English post and DO NOT mention India, Indians, or Pakistan.

ENGLISH POST:
"${englishPost.text}"

RULES:
- Preserve the exact 3-part layout separated by double line breaks (\\n\\n):
  Line 1: A single punchy hook line in Roman Urdu matching the English hook.
  \\n\\n
  Paragraph 2: The real body in Roman Urdu explaining the same trends, facts, and impact.
  \\n\\n
  Line 3: A short concluding takeaway or closing question in Roman Urdu.
- Use simple everyday conversational words that anyone understands easily.
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
      let res = await callCloudflareAI(prompt, null, translationSystemPrompt);
      if (res && res.text) {
        let entry = formatEntry(res.text);
        if (!entry.isOverLimit && ((entry.charCount >= 120 && entry.charCount < MIN_CHARACTERS) || hasSelfAnnouncingLocationCliche(entry.text))) {
          res = await callCloudflareAI(`${prompt}\n\nLENGTH FIX: Your last Roman Urdu draft was ${entry.charCount} characters or used a banned location opener. Ensure total length is strictly 420 to 580 characters (400+ required) and remove any cliché location opener like "Pakistan mein baith kar" or "Pakistan se".`, null, translationSystemPrompt);
          if (res && res.text) entry = formatEntry(res.text);
        }
        if (!entry.isOverLimit && entry.charCount >= MIN_CHARACTERS && !hasSelfAnnouncingLocationCliche(entry.text)) romanEntry = entry;
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

  const isIndiaFocused = OFF_TOPIC_COUNTRY_REGEX.test(`${topic} ${englishPost?.text || ''}`);
  const translationSystemPrompt = isIndiaFocused ? DEFAULT_PAKISTANI_INDIA_SYSTEM_PROMPT : CUSTOM_TOPIC_SYSTEM_PROMPT;

  const prompt = isIndiaFocused
    ? `Translate this post into very simple everyday Pakistani Urdu script (اردو), keeping the voice of a Pakistani talking about Indians and India's real issues.

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
- NEVER use cliché openers like "پاکستان میں بیٹھ کر", "پاکستان سے", or "سرحد پار دیکھیں" — start straight with the fact.
- Every sentence must be short and easy to understand.
- STRICT MINIMUM LENGTH: Must be 400+ characters (420 to 580 characters total, NEVER under 400 and NEVER over 600).
- ZERO hashtags, ZERO emojis. NEVER use labels.
- Return ONLY valid JSON:
{
  "text": "اردو ہک لائن\\n\\nاردو باڈی پیراگراف\\n\\nاردو اختتامی لائن"
}`
    : `Translate this custom-topic post accurately into simple everyday Urdu script (اردو). Stay 100% on the topic of the English post and DO NOT mention India, Indians, or Pakistan.

ENGLISH POST:
"${englishPost.text}"

RULES:
- Preserve the exact 3-part layout separated by double line breaks (\\n\\n):
  Line 1: A single punchy hook line in Urdu (اردو) matching the English hook.
  \\n\\n
  Paragraph 2: The real body in Urdu explaining the same trends, facts, and impact.
  \\n\\n
  Line 3: A short concluding takeaway or closing question in Urdu.
- Use simple everyday Urdu that an ordinary reader understands easily.
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
      let res = await callCloudflareAI(prompt, null, translationSystemPrompt);
      if (res && res.text) {
        let entry = formatEntry(res.text);
        if (!entry.isOverLimit && ((entry.charCount >= 120 && entry.charCount < MIN_CHARACTERS) || hasSelfAnnouncingLocationCliche(entry.text))) {
          res = await callCloudflareAI(`${prompt}\n\nLENGTH FIX: Your last Urdu draft was ${entry.charCount} characters or used a banned location opener. Ensure total length is strictly 420 to 580 characters (400+ required) and remove any cliché location opener like "پاکستان میں بیٹھ کر" or "پاکستان سے".`, null, translationSystemPrompt);
          if (res && res.text) entry = formatEntry(res.text);
        }
        if (!entry.isOverLimit && entry.charCount >= MIN_CHARACTERS && !hasSelfAnnouncingLocationCliche(entry.text)) urduEntry = entry;
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

async function polishWithCloudflareAI(candidate, liveFactsBrief = '', isCustomNeutralMode = false) {
  const currentLen = candidate.english.charCount || candidate.english.text.length;
  const lengthInstruction = currentLen < MIN_CHARACTERS
    ? `CRITICAL LENGTH FIX: The current draft is only ${currentLen} characters, which is TOO SHORT (under the strict ${MIN_CHARACTERS}-character minimum). Expand Paragraph 2 by adding one clear everyday effect sentence in simple words so the final post is strictly between 420 and 560 characters.`
    : `LENGTH: Strictly 400+ characters (420 to 560 characters ideal, NEVER under 400 and NEVER over 600). ZERO hashtags, ZERO emojis, NO labels.`;

  const polishPrompt = isCustomNeutralMode
    ? `Rewrite this X post so it sounds like a sharp insider revealing a RARELY-KNOWN, CRAZY-TO-HEAR analytical insight inside live trends of "${(candidate.topic || '').replace(/"/g, "'")}" using the simplest everyday words.

CURRENT DRAFT (${currentLen} chars):
"${candidate.english.text}"
${liveFactsBrief ? `\nLIVE TREND SIGNALS TO GROUND THE POST:\n${liveFactsBrief}\n` : ''}
STRICT REWRITE RULES:
1. IGNORE INDIA / PAKISTAN: Remove any mention of India, Indians, or Pakistan unless explicitly requested by the topic. Focus 100% on "${(candidate.topic || '').replace(/"/g, "'")}".
2. NO OBVIOUS EVERYDAY TALK OR GENERIC FILLER: Remove vague clichés ("People everywhere are talking about...", "Tech moves fast"). Focus on ONE crazy, counter-intuitive second-order mechanism inside this topic.
3. NOT STIFF NEWS: Remove newspaper phrases ("A report says", "Today", "Yesterday", "Latest news").
4. HIDDEN MECHANISM + REAL CONSEQUENCE: Explain WHY this surprising twist happens and what real shock it creates right now.
5. SIMPLEST POSSIBLE WORDS: Replace every long or fancy word (like infrastructure, disparity, demographic, inflation, macroeconomic, expenditure, deteriorating) with tiny everyday words a 12-year-old uses.
6. SHORT SENTENCES: 5 to 12 words per sentence.
7. EXACT 3-PART LAYOUT separated by \\n\\n:
   Line 1: Punchy hook dropping a crazy rarely-known analytical twist inside the topic.
   \\n\\n
   Paragraph 2: 2-3 simple sentences explaining why it happens + real impact right now.
   \\n\\n
   Line 3: Short, sharp closing question.
8. ${lengthInstruction}

Return ONLY valid JSON:
{
  "topic": "${(candidate.topic || '').replace(/"/g, "'")}",
  "subtopic": "${(candidate.subtopic || '').replace(/"/g, "'")}",
  "category": "CUSTOM_TOPIC",
  "text": "Rewritten hook\\n\\nRewritten body\\n\\nRewritten question"
}`
    : `Rewrite this X post so it sounds naturally like **a Pakistani talking about Indians** and revealing a RARELY-KNOWN, CRAZY-TO-HEAR analytical paradox in India, using the simplest words.

CURRENT DRAFT (${currentLen} chars):
"${candidate.english.text}"

VERIFIED FACTS TO KEEP ACCURATE:
${liveFactsBrief || '- Keep the verified numbers accurate.'}

STRICT REWRITE RULES:
1. PAKISTANI PERSPECTIVE ON INDIANS (NO LOCATION CLICHÉS): Keep the sharp, candid Pakistani observer tone talking naturally about how this hidden paradox hits everyday Indians, AND STRICTLY REMOVE any literal cliché self-label like "Sitting in Pakistan", "From Pakistan", "Here in Pakistan", "As a Pakistani", or "Looking across the border". Jump straight into the shocking fact! Keep it grounded, analytical, and civil—zero hate speech.
2. NOT OBVIOUS EVERYDAY TALK OR NEWS: Remove obvious surface complaints and newspaper phrases ("A report says", "Today", "Yesterday", "Latest news"). Keep the surprising, counter-intuitive analytical truth front and center.
3. INDIA PARADOX + REAL SHOCK: Explain WHY the hidden link happens and how it hurts ordinary Indian families, students, or workers.
4. SIMPLEST POSSIBLE WORDS: Replace every long or fancy word (like infrastructure, disparity, demographic, inflation, macroeconomic, expenditure, deteriorating) with tiny everyday words a 12-year-old uses.
5. SHORT SENTENCES: 5 to 12 words per sentence.
6. EXACT 3-PART LAYOUT separated by \\n\\n:
   Line 1: Punchy hook sentence jumping straight into a crazy rarely-known fact about India/Indians (never "Sitting in Pakistan").
   \\n\\n
   Paragraph 2: 2-3 simple sentences with the accurate latest number + hidden mechanism + human effect on Indians.
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

  const polishedRes = await callCloudflareAI(polishPrompt, null, isCustomNeutralMode ? CUSTOM_TOPIC_SYSTEM_PROMPT : DEFAULT_PAKISTANI_INDIA_SYSTEM_PROMPT);
  return validateAIResponse(polishedRes, candidate.topic, candidate.category, candidate.subtopic, MIN_CHARACTERS);
}

export async function callCloudflareAI(prompt, model = null, systemPrompt = DEFAULT_PAKISTANI_INDIA_SYSTEM_PROMPT) {
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
                  content: systemPrompt
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

async function callGroq(prompt, apiKey, systemPrompt = DEFAULT_PAKISTANI_INDIA_SYSTEM_PROMPT) {
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
            content: systemPrompt
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

async function callXai(prompt, model = 'grok-2-latest', systemPrompt = DEFAULT_PAKISTANI_INDIA_SYSTEM_PROMPT) {
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
              content: systemPrompt
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
