/**
 * X-BOT — Data-Driven Analytical Content Engine
 *
 * Core Focus:
 * - Data-driven analytical social media posts written in the SIMPLEST everyday English
 * - 1 or 2 verified numbers, comparisons, and clear insights suitable for a 12-year-old or village shopkeeper
 *
 * Categories / Genres:
 * 1. Pak vs Ind
 * 2. Geopolitics & Global Power
 * 3. Pakistan Politics & Economy
 * 4. Social & Regional Issues
 * 5. AI & Human Society
 * 6. Climate & Global Power
 * 7. Double-Meaning & Satirical Commentary
 *
 * Standards:
 * - English Level: Simplest Everyday English (Sentences 6–14 words, hard limits 400–600 chars, target 400–600 chars)
 * - Zero hashtags, zero emojis, no internal labels or bullet lists
 * - Translations: Pakistani Roman Urdu and Plain Urdu script (اردو) in-place without duplicate creation
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
import { genreManager } from './genreManager.js';

let categoryRotationIndex = 0;

const MIN_CHARACTERS = 380;
const ABSOLUTE_MAX_CHARACTERS = 600;
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
function validateAIResponse(res, chosenTopic, chosenCategory = 'PAK_VS_IND', chosenSubtopic = '') {
  if (!res || typeof res !== 'object') {
    throw new Error('Invalid AI response object');
  }

  const rawText = typeof res.text === 'string' ? res.text.trim() : '';
  if (!rawText || rawText.length < 80) {
    throw new Error('AI returned empty or overly short text');
  }

  const entry = formatEntry(rawText);
  if (entry.isOverLimit || entry.charCount > ABSOLUTE_MAX_CHARACTERS) {
    throw new Error(`AI post exceeds strict 600-char limit (${entry.charCount} chars, max ${ABSOLUTE_MAX_CHARACTERS})`);
  }
  if (entry.charCount < MIN_CHARACTERS) {
    throw new Error(`AI post is too short (${entry.charCount} chars, must be ${MIN_CHARACTERS}-600)`);
  }

  const topic = typeof res.topic === 'string' && res.topic.trim() ? res.topic.trim() : chosenTopic;
  const subtopic = typeof res.subtopic === 'string' && res.subtopic.trim() ? res.subtopic.trim() : (chosenSubtopic || topic);
  const category = typeof res.category === 'string' && res.category.trim() ? res.category.trim() : (chosenCategory || 'PAK_VS_IND');

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
========================================================= */

function createPakVsIndPrompt(chosenTopic, chosenSubtopic, avoidList = []) {
  const avoidStr = avoidList.length > 0 ? avoidList.slice(0, 30).join('\n• ') : 'None';

  return `${SIMPLE_ENGLISH_RULES}

🤖 X ASSISTANT — PAKISTAN & INDIA DATA & ANALYTICS POST ENGINE

ROLE & EDITORIAL PERSONA:
You write in very simple A1-A2 English like regular people talk and text in daily life.
Use only simple everyday words and short, clear sentences. No complicated, fancy, or academic words.
Explain data, economics, industry, technology, and facts simply so anyone understands instantly on the first read.

CORE EDITORIAL DIRECTIVE:
- TALK GENERALLY ABOUT DATA & ANALYTICS: Focus on real analytics, facts, economic numbers, IT exports, agriculture, energy, or industrial growth of Pakistan or India.
- REMOVE DIRECT CONFRONTATIONAL COMPARISONS: Do not frame the post as a rivalry or competition (no "who beats whom", no hostility). Discuss the analytics and reality of either country or the regional economy on its own merits.
- DO NOT CREATE CONFLICTS: Never write about weapons, missiles, war, border disputes, military spending rivalry, or sensitive religious/political divisions. Keep the tone informative, educational, and constructive.

TOPIC: "${chosenTopic}"
SUBTOPIC: "${chosenSubtopic || chosenTopic}"

STRICT POST STRUCTURE (EXACTLY 3 PARTS separated by double line breaks \\n\\n):
Line 1: A single punchy hook line that immediately grabs attention (1 clear sentence).
\\n\\n
Paragraph: The real analytical body with 1 or 2 verified numbers, economic facts, or analytics showing real-world impact (2 to 3 simple sentences).
\\n\\n
Line 3: A one-line engaging conclusion or thoughtful closing question that sparks discussion.

STRICT POST LENGTH & FORMAT RULES:
- TARGET LENGTH: 400 to 600 characters total (including spaces and punctuation).
- HARD LIMITS: 380 to 600 characters.
- ZERO hashtags. ZERO emojis in the post body. NO bullet points.
- NEVER include labels like "Hook:", "Line 1:", "Body:", or "Conclusion:" in the post text.

MANDATORY HISTORICAL AVOIDANCE (DO NOT REPEAT THESE TOPICS, ARGUMENTS OR STATS):
• ${avoidStr}

Return ONLY valid JSON matching this exact structure:
{
  "topic": "${chosenTopic}",
  "subtopic": "${chosenSubtopic || chosenTopic}",
  "category": "PAK_VS_IND",
  "text": "Line 1 hook\\n\\nReal body paragraph with facts and numbers\\n\\nOne-line conclusion"
}`;
}

function createEnglishPrompt(chosenTopic, chosenSubtopic, targetCategory, avoidList = []) {
  const avoidStr = avoidList.length > 0 ? avoidList.slice(0, 25).join('\n• ') : 'None';
  const categoryName = targetCategory?.name || 'Geopolitics & Global Power';
  const categoryDesc = targetCategory?.description || 'Data-driven analysis';

  return `${SIMPLE_ENGLISH_RULES}

# X_BOT — SIMPLE A1-A2 CONTENT ENGINE

ROLE & EDITORIAL PERSONA:
You write in very simple A1-A2 English like regular people talk and text in daily life.
Use only simple everyday words and short, clear sentences. No complicated, fancy, or academic words.
Explain ideas simply so anyone understands instantly on the first read.

TOPIC: "${chosenTopic}"
SUBTOPIC: "${chosenSubtopic || chosenTopic}"
CATEGORY: ${categoryName} (${categoryDesc})

STRICT POST STRUCTURE (EXACTLY 3 PARTS separated by double line breaks \\n\\n):
Line 1: A single punchy hook line that immediately grabs attention (1 clear sentence).
\\n\\n
Paragraph: The real analytical body with 1 or 2 real numbers and clear explanation of real-world human impact (2 to 3 simple sentences).
\\n\\n
Line 3: A one-line engaging conclusion or thoughtful closing question that makes the reader think.

WRITING RULES:
1. FACTS & NUMBERS: Include 1 or 2 real numbers only.
2. SIMPLE A1-A2 ENGLISH: Short, direct, human sentences. Everyday words only.
3. ZERO hashtags. ZERO emojis in the post. NO bullet points. NO labels like "Hook:" or "Body:".
4. TARGET LENGTH: 400 to 600 characters total (hard limits 380 to 600).

MANDATORY HISTORICAL AVOIDANCE:
• ${avoidStr}

Return ONLY valid JSON matching this exact structure:
{
  "topic": "${chosenTopic}",
  "subtopic": "${chosenSubtopic || chosenTopic}",
  "category": "${targetCategory?.id || 'GEOPOLITICS'}",
  "text": "Line 1 hook\\n\\nReal body paragraph with facts and numbers\\n\\nOne-line conclusion"
}`;
}

/* =========================================================
   FALLBACK BANK (MERGED CURATED & DYNAMIC BANK)
   All entries written in simplest English (400-600 chars),
   verified numbers with source citations, passing checkSimpleEnglish.
========================================================= */

export const FALLBACK_BANK = [
  // 1. Software Talent: Freelance Density vs Corporate IT Scale
  // Source: NASSCOM / Payoneer (2024)
  {
    topic: "Software Talent: Freelance Density vs Corporate IT Scale",
    subtopic: "IT freelancing and global gig economy",
    category: 'PAK_VS_IND',
    genreId: 'PAK_VS_IND',
    mainSubject: "IT freelancing and software talent",
    specificEventOrIssue: "Global digital freelance rankings and software export growth",
    centralArgument: "Independent young freelance coders earn billions and challenge big corporate office models",
    analyticalAngle: "Independent workers vs big corporate offices",
    importantStatistics: ["$193B India", "1.5M developers Pakistan"],
    keywords: ["freelance", "software", "coders", "laptops", "youth"],
    english: {
      text: "India earns about 193 billion dollars a year from big computer firms.\n\nPakistan is taking a very different road. More than 1.5 million young Pakistanis now work online from home as freelancers. They write code for foreign clients on their own laptops. Big office towers cost billions of dollars to build. But young people with cheap laptops can learn and work anywhere.\n\nCan independent young workers beat big company offices?"
    },
    romanUrdu: {
      text: "India barri IT companiyon se saalana 193 arab dollar kamata hai.\n\nPakistan ek mukhtalif rasta ikhtiyar kar raha hai. Yahan 15 lakh se zyada nojawan ghar bethay online freelance kaam karte hain. Wo apnay laptop par bahir ke clients ke liye software banatay hain. Baray daftar banane par arbon dollar lagtay hain. Magar saste laptop par nojawan kahin bhi kaam kar saktay hain.\n\nKya azad nojawan barray daftaron ka muqabla kar saktay hain?"
    },
    plainUrdu: {
      text: "بھارت بڑی آئی ٹی کمپنیوں سے سالانہ 193 ارب ڈالر کماتا ہے۔\n\nپاکستان ایک بالکل مختلف راستہ اختیار کر رہا ہے۔ یہاں پندرہ لاکھ سے زائد نوجوان گھر بیٹھے آن لائن فری لانس کام کرتے ہیں۔ وہ اپنے لیپ ٹاپ پر غیر ملکی گاہکوں کے لیے سافٹ ویئر بناتے ہیں۔ بڑے کارپوریٹ دفاتر بنانے پر اربوں ڈالر خرچ ہوتے ہیں۔ مگر سستے لیپ ٹاپ سے نوجوان کہیں بھی کام کر سکتے ہیں۔\n\nکیا آزاد نوجوان روایتی بڑے دفاتر کو مات دے سکتے ہیں؟"
    }
  },

  // 2. Agriculture & Water: Irrigation Scale vs Storage Deficits
  // Source: World Bank / WAPDA (2023)
  {
    topic: "Agriculture & Water: Irrigation Scale vs Storage Deficits",
    subtopic: "Water management and Indus Basin hydrology",
    category: 'PAK_VS_IND',
    genreId: 'PAK_VS_IND',
    mainSubject: "Indus Basin irrigation and agricultural productivity",
    specificEventOrIssue: "Canal network acreage vs days of water storage capacity",
    centralArgument: "Pakistan has massive canals but lacks dams to store water through dry seasons",
    analyticalAngle: "Water storage days vs farming survival",
    importantStatistics: ["45M acres", "30 days Pakistan", "120 days India"],
    keywords: ["water", "canals", "farmers", "storage", "crops"],
    english: {
      text: "Pakistan has one of the largest canal networks in the world. It waters more than 45 million acres of green farmland. Farmers work hard and grow fine Basmati rice at low prices.\n\nYet Pakistan can only store 30 days of river water. In comparison, India can store 120 days of river water. Rich soil helps, but crops will dry up without stored water.\n\nHow can farming survive when river water runs out so fast?"
    },
    romanUrdu: {
      text: "Pakistan ke paas dunya ke baray nehri nizamon mein se ek nizam hai. Ye 4.5 crore acre zameen ko paani deta hai. Kisan sakht mehnat kar ke saste daamon behtareen Basmati chawal ugate hain.\n\nMagar Pakistan ke paas sirf 30 din ka paani jama karne ki jagah hai. Muqablay mein India 120 din ka paani jama kar sakta hai. Zarkhez mitti achi hai magar paani ke baghair faslein sookh jati hain.\n\nKheti-bari kaisay chalay gi jab paani itni jaldi khatam ho jaye?"
    },
    plainUrdu: {
      text: "پاکستان کے پاس دنیا کے بڑے نہری نظاموں میں سے ایک نظام ہے۔ یہ ساڑھے چار کروڑ ایکڑ زرعی زمین کو پانی دیتا ہے۔ کسان محنت کر کے کم لاگت میں بہترین باسمتی چاول اگاتے ہیں۔\n\nتاہم پاکستان کے پاس صرف تیس دن کا دریا کا پانی محفوظ کرنے کی گنجائش ہے۔ دوسری طرف بھارت کے پاس ایک سو بیس دن ہیں۔ زرخیز مٹی اچھی ہے مگر پانی کے بغیر فصلیں سوکھ جاتی ہیں۔\n\nجب پانی اتنی جلدی ختم ہو جائے تو زراعت کیسے بچے گی؟"
    }
  },

  // 3. India & Pakistan: Post-Colonial Centralization
  // Source: State Bank of Pakistan / RBI (2023)
  {
    topic: "India & Pakistan: Post-Colonial Centralization",
    subtopic: "Why India became centralized after 1947",
    category: 'PAK_VS_IND',
    genreId: 'PAK_VS_IND',
    mainSubject: "Why India became centralized after 1947",
    specificEventOrIssue: "Central government tax control vs provincial autonomy",
    centralArgument: "Central governments take most tax money and leave local towns without funds",
    analyticalAngle: "Central control vs local citizen needs",
    importantStatistics: ["1947 independence", "70% tax control"],
    keywords: ["taxes", "central", "local", "towns", "power"],
    english: {
      text: "In 1947, India and Pakistan took over old rules from the British. Both capitals promised to share power with local towns and provinces. Instead, top leaders took away power from elected state leaders many times.\n\nToday, central offices in both capitals control over 70% of all public tax money. Local village councils wait for small repairs and school funds.\n\nDid freedom help regular towns, or just put new bosses in charge?"
    },
    romanUrdu: {
      text: "1947 mein India aur Pakistan ne angrezon ke puranay qawaneen apnaye. Dono rajdhaniyon ne soobon aur shehron ke sath taqat baantne ka wada kiya tha. Magar baray hukmarano ne soobai assemblies ko kayi baar toda.\n\nAaj dono markazi hukoomatein 70% se zyada tax control karti hain. Chhotay gaon aur shehr marammat aur school funds ke muntazir rehte hain.\n\nKya azaadi ne aam bastiyon ki madad ki ya sirf naye afsar bitha diye?"
    },
    plainUrdu: {
      text: "1947 میں بھارت اور پاکستان نے انگریزوں کے پرانے قوانین اپنائے۔ دونوں دارالحکومتوں نے صوبوں اور شہروں کے ساتھ اختیارات بانٹنے کا وعدہ کیا تھا۔ لیکن بڑے حکمرانوں نے منتخب صوبائی اسمبلیوں کو بار بار توڑا۔\n\nآج دونوں مرکزی حکومتیں ستر فیصد سے زیادہ ٹیکس کنٹرول کرتی ہیں۔ چھوٹے گاؤں اور شہر مرمت اور اسکولوں کے فنڈز کے منتظر رہتے ہیں۔\n\nکیا آزادی نے عام بستیوں کو فائدہ پہنچایا یا صرف نئے حاکم بٹھا دیے؟"
    }
  },

  // 4. India Politics: Electoral Bonds & Party Wealth
  // Source: Association for Democratic Reforms / Supreme Court of India (2024)
  {
    topic: "India Politics: Electoral Bonds & Party Wealth",
    subtopic: "Election machinery and campaign funding",
    category: 'PAK_VS_IND',
    genreId: 'PAK_VS_IND',
    mainSubject: "Electoral Bonds and secret corporate election money",
    specificEventOrIssue: "Corporate political gifts and campaign costs",
    centralArgument: "Huge corporate political donations give rich donors undue power over regular voters",
    analyticalAngle: "Election spending vs regular voter influence",
    importantStatistics: ["$2B bonds", "55% ruling party", "$1.5B Pakistan"],
    keywords: ["elections", "money", "campaign", "donations", "votes"],
    english: {
      text: "Between 2018 and 2024, Indian parties took 2 billion dollars in secret political gifts. The ruling party took more than 55% of all that corporate cash. Across the border, Pakistani election campaigns cost over 1.5 billion dollars in cash.\n\nPowerful business groups give money to leaders behind closed doors. Rich donors pay for campaigns and then expect special favors.\n\nCan regular votes win when big money buys power?"
    },
    romanUrdu: {
      text: "2018 se 2024 ke darmiyan Indian jamaton ne khufia raste se 2 arab dollar liye. Hukmaran party ko is corporate raqam ka 55% se zyada hissa mila. Doosri taraf Pakistani intikhabat par 1.5 arab dollar se zyada kharch hotay hain.\n\nTaquatwar business groups band kamron mein paisa detay hain. Ameer log chunao mein madad kar ke faiday uthatay hain.\n\nJab itni daulat chalay toh aam shehri ke vote ki kya hesiyat reh jati hai?"
    },
    plainUrdu: {
      text: "2018 سے 2024 کے درمیان بھارتی جماعتوں نے خفیہ راستے سے دو ارب ڈالر کا چندہ لیا۔ حکمران جماعت کو اس رقم کا 55 فیصد سے زیادہ حصہ ملا۔ دوسری طرف پاکستانی انتخابات پر ڈیڑھ ارب ڈالر سے زیادہ رقم لگ جاتی ہے۔\n\nطاقتور کاروباری حلقے بند کمروں میں سیاست دانوں کو پیسہ دیتے ہیں۔ امیر لوگ مہم کے پیسے دے کر بعد میں فائدے لیتے ہیں۔\n\nجب اتنی دولت اثر انداز ہو تو عام شہری کے ووٹ کی کیا حیثیت رہ جاتی ہے؟"
    }
  },

  // 5. Solar Transition: Rooftop Energy Adoption & Grid Deficits
  // Source: NEPRA / Central Electricity Authority (2024)
  {
    topic: "Solar Transition: Rooftop Energy Adoption & Grid Deficits",
    subtopic: "Renewable energy and solar transition",
    category: 'PAK_VS_IND',
    genreId: 'PAK_VS_IND',
    mainSubject: "Rooftop solar adoption and renewable energy transition",
    specificEventOrIssue: "Booming rooftop solar installations offsetting expensive grid electricity",
    centralArgument: "High grid power tariffs are driving millions of consumers toward decentralized rooftop solar",
    analyticalAngle: "Decentralized rooftop solar vs centralized grid utilities",
    importantStatistics: ["90 GW solar India", "3000 MW rooftop solar Pakistan"],
    keywords: ["solar", "energy", "rooftop", "tariffs", "power"],
    english: {
      text: "Solar power is rewriting the energy landscape across South Asian cities.\n\nOver the past year, rooftop solar panel imports into Pakistan exceeded 3000 megawatts as families cut costly utility bills. India's total solar capacity crossed 90 gigawatts, backed by large solar parks and state subsidies. Consumers are taking control of their own power generation right on their rooftops.\n\nCan decentralized solar solve regional energy shortages faster than big central power plants?"
    },
    romanUrdu: {
      text: "South Asian shehron mein solar power bijli ka nizam badal rahi hai.\n\nPichlay aik saal mein Pakistan mein 3000 megawatt se zyada ke rooftop solar panels lagaye gaye. Doosri taraf India ki solar capacity 90 gigawatt se tajawuz kar chuki hai. Aam shehri bijli ke bhari billon se bachne ke liye apni chhaton par khud bijli bana rahay hain.\n\nKya chhat par lagi solar bijli baray sarkari bijli gharon se jaldi masla hal kar sakti hai?"
    },
    plainUrdu: {
      text: "شمسی توانائی جنوبی ایشیا کے شہروں میں بجلی کے نظام کو تیزی سے بدل رہی ہے۔\n\nگزشتہ ایک سال میں پاکستان میں تین ہزار میگاواٹ سے زائد کے سولر پینل درآمد کر کے لگائے گئے۔ دوسری طرف بھارت کی شمسی توانائی کی پیداواری صلاحیت نوے گیگاواٹ سے تجاوز کر چکی ہے۔ شہری مہنگے بلوں سے بچنے کے لیے اپنی چھتوں پر خود بجلی بنا رہے ہیں۔\n\nکیا چھتوں پر لگی شمسی توانائی بڑے سرکاری منصوبوں سے پہلے توانائی بحران حل کر سکتی ہے؟"
    }
  },

  // 6. Mobile Connectivity & Fintech: South Asian Digital Wallets
  // Source: State Bank of Pakistan / RBI / GSMA (2024)
  {
    topic: "Mobile Connectivity & Fintech: South Asian Digital Wallets",
    subtopic: "Digital public infrastructure and fintech",
    category: 'PAK_VS_IND',
    genreId: 'PAK_VS_IND',
    mainSubject: "Digital wallets and branchless banking penetration",
    specificEventOrIssue: "Mobile wallets transforming cash economies into digital financial networks",
    centralArgument: "Cheap smartphones and QR payments bring millions of unbanked citizens into the formal financial system",
    analyticalAngle: "Everyday digital payments vs traditional branch banking",
    importantStatistics: ["12 billion monthly UPI transactions", "100 million branchless accounts Pakistan"],
    keywords: ["fintech", "wallets", "mobile", "banking", "payments"],
    english: {
      text: "Mobile wallets have turned basic smartphones into neighborhood bank branches.\n\nIn Pakistan, branchless mobile accounts crossed 100 million as shopkeepers and workers send money without visiting banks. Across India, instant phone payments process more than 12 billion digital transactions each month. Street vendors who never held bank books now receive immediate digital payments for daily sales.\n\nCan mobile fintech fully replace cash and formalize the regional informal economy?"
    },
    romanUrdu: {
      text: "Mobile wallets ne aam smartphone ko mohallay ka bank bana diya hai.\n\nPakistan mein branchless mobile accounts 10 crore se tajawuz kar chukay hain aur log asani se raqam bhejte hain. India mein har maheenay 12 arab se zyada digital transactions mobile se hoti hain. Rehrri walay aur chhotay dukandar bhi ab phone par fori raqam wasool kar rahay hain.\n\nKya mobile wallet nizaam cash ko khatam kar ke poori maeeshat ko digital bana sakta hai?"
    },
    plainUrdu: {
      text: "موبائل والٹس نے عام اسمارٹ فونز کو محلے کے بینک میں تبدیل کر دیا ہے۔\n\nپاکستان میں برانچ لیس بینک اکاؤنٹس کی تعداد دس کروڑ سے تجاوز کر چکی ہے اور شہری آسانی سے رقوم منتقل کرتے ہیں۔ بھارت میں ماہانہ بارہ ارب سے زیادہ ڈیجیٹل ادائیگیاں موبائل کے ذریعے ہو رہی ہیں۔ چھوٹے دکاندار اور ریڑھی بان بھی اب فون کے ذریعے فوری ادائیگیاں وصول کرتے ہیں۔\n\nکیا موبائل والٹس کی وسعت کیش کے روایتی نظام کی جگہ لے کر معیشت کو دستاویزی بنا سکتی ہے؟"
    }
  },

  // 7. Cricket Diplomacy: BCCI Monopoly & Global Revenue
  // Source: ICC Annual Report (2024)
  {
    topic: "Cricket Diplomacy: BCCI Monopoly & Global Revenue",
    subtopic: "BCCI financial influence and IPL economics",
    category: 'PAK_VS_IND',
    genreId: 'PAK_VS_IND',
    mainSubject: "BCCI commercial share of global cricket revenue",
    specificEventOrIssue: "Television broadcast rights and bilateral match blocks",
    centralArgument: "Television broadcast wealth allows one board to control world cricket and block matches",
    analyticalAngle: "Commercial television wealth vs genuine sporting culture",
    importantStatistics: ["38.5% ICC revenue", "$6.2B IPL rights"],
    keywords: ["cricket", "fans", "matches", "money", "bcci"],
    english: {
      text: "The Indian cricket board takes about 38% of all money earned by the International Cricket Council. That comes to over 230 million dollars every single year. The rights to show Indian league matches on television sold for over 6 billion dollars.\n\nThis huge financial weight lets leaders choose match places and block tours with Pakistan.\n\nWhen big television money runs the game, is cricket still a sport for fans?"
    },
    romanUrdu: {
      text: "Indian cricket board aalmi cricket council ki kul aamdani ka taqreeban 38% hissa leta hai. Ye har saal 230 million dollar se zyada banta hai. Indian league ke TV rights 6 arab dollar se zyada mein bikay.\n\nIs barri maali taqat se wo match ki jagah tay karte hain aur Pakistan se series roktay hain.\n\nJab TV ka paisa khel chalane lagay toh kya cricket ab bhi aam fans ka khel raha?"
    },
    plainUrdu: {
      text: "بھارتی کرکٹ بورڈ عالمی کرکٹ کونسل کی کل آمدنی کا تقریباً 38 فیصد حصہ لیتا ہے۔ یہ ہر سال 230 ملین ڈالر سے زیادہ بنتا ہے۔ انڈین لیگ کے ٹی وی نشریاتی حقوق چھ ارب ڈالر سے زائد میں فروخت ہوئے۔\n\nاس بے پناہ مالی طاقت سے وہ میچوں کے مقامات طے کرتے ہیں اور پاک بھارت سیریز روکتے ہیں۔\n\nجب ٹی وی کا پیسہ کھیل کے فیصلے کرے تو کیا کرکٹ اب بھی شائقین کا کھیل ہے؟"
    }
  },

  // 8. South Asia Development: Bangladesh vs India vs Pakistan
  // Source: World Bank / IMF (2024)
  {
    topic: "South Asia Development: Bangladesh vs India vs Pakistan",
    subtopic: "India vs China vs Bangladesh vs Pakistan",
    category: 'PAK_VS_IND',
    genreId: 'PAK_VS_IND',
    mainSubject: "GDP per capita and export growth in South Asia",
    specificEventOrIssue: "Garment exports vs ballistic missile spending",
    centralArgument: "Bangladesh focused on factories and health, passing Pakistan in income per person",
    analyticalAngle: "Basic human development vs military missile parades",
    importantStatistics: ["$2650 Bangladesh", "$1550 Pakistan", "$47B garments"],
    keywords: ["income", "factories", "garments", "jobs", "schools"],
    english: {
      text: "Fifty years ago, people thought Bangladesh would always stay poor. Today, its income per person is about 2,650 dollars. That is well ahead of Pakistan at 1,550 dollars and very close to India. Bangladesh sells over 47 billion dollars of clothes to the world each year.\n\nOther nations spend billions on heavy missiles while millions of children miss school meals.\n\nDoes real strength come from giant missiles or healthy working families?"
    },
    romanUrdu: {
      text: "Pachaas saal pehle log sochtay thay ke Bangladesh ghareeb hi rahay ga. Aaj uski fi kas aamdani taqreeban 2,650 dollar hai. Ye Pakistan ki 1,550 dollar se behtar hai aur India ke qareeb hai. Bangladesh har saal 47 arab dollar ke kapray dunya ko bechta hai.\n\nDoosray mulk missiles par arbon bahatay hain jabke bachon ko khana nahi milta.\n\nAsal taqat baray missiles se aati hai ya tandrust kamane walay khandan se?"
    },
    plainUrdu: {
      text: "پچاس سال پہلے لوگ سمجھتے تھے کہ بنگلہ دیش ہمیشہ غریب رہے گا۔ آج اس کی فی کس آمدنی تقریباً 2,650 ڈالر ہے۔ یہ پاکستان کی 1,550 ڈالر سے بہت بہتر ہے اور بھارت کے قریب ہے۔ بنگلہ دیش ہر سال 47 ارب ڈالر کے کپڑے برآمد کرتا ہے۔\n\nدوسرے ممالک میزائلوں پر اربوں بہاتے ہیں جبکہ بچوں کو کھانا نہیں ملتا۔\n\nاصل طاقت بڑے میزائلوں سے آتی ہے یا خوشحال محنت کش خاندانوں سے؟"
    }
  },

  // 9. India Politics: BJP vs Congress & Hindutva
  // Source: Election Commission of India / CSDS (2024)
  {
    topic: "India Politics: BJP vs Congress & Hindutva",
    subtopic: "BJP and Hindutva",
    category: 'PAK_VS_IND',
    genreId: 'PAK_VS_IND',
    mainSubject: "BJP and Hindutva",
    specificEventOrIssue: "Rise of religious nationalism and campaign money",
    centralArgument: "Massive campaign funds and religious slogans squeeze secular democracy",
    analyticalAngle: "Religious slogans vs equal rights for all",
    importantStatistics: ["10 to 1 spending", "elections"],
    keywords: ["politics", "campaigns", "parties", "votes", "democracy"],
    english: {
      text: "In India, the ruling party built a massive election machine. Big corporate donors gave millions, letting them outspend rivals ten to one. Slogans about religion now dominate the daily news across the country. Pakistan made the same mistake for decades by mixing faith with political power.\n\nWhen rulers use religious pride to win votes, regular problems like jobs and clinics get pushed aside.\n\nCan honest democracy work when faith is used for political gain?"
    },
    romanUrdu: {
      text: "India mein hukmaran party ne bohot barri election machine kharri ki. Baray sarmayakaron ne itna paisa diya ke unhon ne mukhalifeen se 10 guna zyada kharch kiya. Mazhab ke naaray rozana ki khabron par chha gaye hain. Pakistan ne bhi dahaiyon tak yahi ghalti ki.\n\nJab hukmaran vote ke liye jazbaat ka sahara lein, toh nokri aur aspataal peechay reh jatay hain.\n\nKya jamhooriyat theek chal sakti hai jab siyasat mein mazhab ka sahara liya jaye?"
    },
    plainUrdu: {
      text: "بھارت میں حکمران جماعت نے ایک بہت بڑی انتخابی مشین کھڑی کی۔ بڑے سرمایہ داروں نے اتنا پیسہ دیا کہ انہوں نے مخالفین سے دس گنا زیادہ خرچ کیا۔ مذہب کے نعرے روزانہ کی خبروں پر چھا چکے ہیں۔ پاکستان نے بھی دہائیوں تک یہی غلطی کی۔\n\nجب حکمران ووٹ کے لیے مذہبی جذبات استعمال کریں تو روزگار اور اسپتال پیچھے رہ جاتے ہیں۔\n\nکیا جمہوریت درست چل سکتی ہے جب سیاست میں مذہب کا نام استعمال ہو؟"
    }
  },

  // 10. RSS: Organizational Cadres & State Influence
  // Source: The Hindu / Indian Express (2023)
  {
    topic: "RSS: Organizational Cadres & State Influence",
    subtopic: "RSS history and organizational structure",
    category: 'PAK_VS_IND',
    genreId: 'PAK_VS_IND',
    mainSubject: "RSS history and organizational structure",
    specificEventOrIssue: "Cadre network influence on governance",
    centralArgument: "Unelected volunteer groups shape government policy without answering to voters",
    analyticalAngle: "Unelected volunteer groups vs elected parliament",
    importantStatistics: ["thousands of daily camps", "5 million volunteers"],
    keywords: ["volunteers", "camps", "parliament", "elections", "power"],
    english: {
      text: "The Rashtriya Swayamsevak Sangh runs thousands of daily camps across India. Millions of members meet every morning to train and share strict ideas. Today, these unelected members help pick party candidates and steer state decisions. Pakistan faced similar problems whenever hidden groups guided government policy.\n\nMinisters come and go, but powerful groups operate behind closed doors for decades.\n\nWho truly runs a country: elected leaders or unelected groups?"
    },
    romanUrdu: {
      text: "Rashtriya Swayamsevak Sangh India bhar mein hazaron rozana camps chalati hai. Lakhon afrad har subah milte hain aur ek khas soch phailatay hain. Aaj ye ghair-muntakhib log tickets aur sarkari faislon mein asar rakhte hain. Pakistan ne bhi yahi masla dekha hai.\n\nWazeer aate jatay rehte hain magar band kamron mein faislay karne walay saalon qayam rehte hain.\n\nAsal mein mulk kon chalata hai: awam ke chune huay leaders ya parde ke peechay log?"
    },
    plainUrdu: {
      text: "راشٹریہ سویم سیوک سنگھ پورے بھارت میں روزانہ ہزاروں کیمپ چلاتی ہے۔ لاکھوں افراد ہر صبح تربیت اور مخصوص سوچ کے لیے جمع ہوتے ہیں۔ آج یہ غیر منتخب لوگ انتخابی ٹکٹوں اور حکومتی فیصلوں میں اثر رکھتے ہیں۔ پاکستان نے بھی یہی مسئلہ دیکھا ہے۔\n\nوزیر آتے جاتے رہتے ہیں مگر پردے کے پیچھے فیصلے کرنے والے دہائیوں تک قائم رہتے ہیں۔\n\nاصل میں ملک کون چلاتا ہے: عوام کے منتخب رہنما یا غیر منتخب حلقے؟"
    }
  },

  // 11. India Caste & Pakistan Feudalism: Wealth Divide
  // Source: Oxfam / World Inequality Report (2024)
  {
    topic: "India Caste & Pakistan Feudalism: Wealth Divide",
    subtopic: "Caste and economic inequality",
    category: 'PAK_VS_IND',
    genreId: 'PAK_VS_IND',
    mainSubject: "Caste and economic inequality",
    specificEventOrIssue: "Dalit landlessness and rural debt traps",
    centralArgument: "Ancient social rank and landlord debt keep millions of poor workers trapped",
    analyticalAngle: "Ancient social rank vs equal human dignity",
    importantStatistics: ["top 10% own 77% wealth", "half of sanitation workers"],
    keywords: ["landlords", "workers", "farms", "debts", "dignity"],
    english: {
      text: "In India, the richest 10% hold more than 75% of all national wealth. Meanwhile, millions from lower castes clean dirty street drains for very little pay. Across the border in Pakistan, landless farm workers remain stuck in heavy debt.\n\nPowerful village landlords keep them trapped. Both nations boast about modern progress, but old social walls keep working families down.\n\nCan real human freedom exist when birth decides how someone is treated?"
    },
    romanUrdu: {
      text: "India mein 10% ameer log mulk ki 75% se zyada daulat par qabiz hain. Jabke nichli zaat ke lakhon log kam paison par gandi naaliyan saaf karne par majboor hain. Pakistan mein bhi be-zameen kisan waderon ke qarzay mein phansay hain.\n\nDono mulk taraqqi ke daaway karte hain magar purana riwaj aam mazdoor ko ooper nahi anay deta.\n\nKya asal azaadi mil sakti hai jab paidaish hi insan ki qadar tay kare?"
    },
    plainUrdu: {
      text: "بھارت میں دس فیصد امیر ترین لوگ ملک کی 75 فیصد سے زیادہ دولت پر قابض ہیں۔ جبکہ نچلی ذاتوں کے لاکھوں لوگ معمولی اجرت پر گندے نالے صاف کرنے پر مجبور ہیں۔ پاکستان میں بھی بے زمین کسان جاگیرداروں کے قرضوں میں جکڑے ہیں۔\n\nدونوں ممالک ترقی کے دعوے کرتے ہیں لیکن پرانی زنجیریں مزدور خاندانوں کو دبا کر رکھتی ہیں۔\n\nکیا حقیقی آزادی ممکن ہے جب پیدائش ہی انسان کی قدر اور مقدر طے کرے؟"
    }
  },

  // 12. India vs Pakistan: Regional Wealth & Federal Friction
  // Source: Reserve Bank of India / SBP (2023)
  {
    topic: "India vs Pakistan: Regional Wealth & Federal Friction",
    subtopic: "North vs South",
    category: 'PAK_VS_IND',
    genreId: 'PAK_VS_IND',
    mainSubject: "North vs South and tax contribution",
    specificEventOrIssue: "Tax contribution vs devolution disparity",
    centralArgument: "Productive states pay high taxes but get back pennies from central capitals",
    analyticalAngle: "Tax revenue unfairness vs regional unity",
    importantStatistics: ["30% taxes southern states", "40 paise return per rupee"],
    keywords: ["taxes", "south", "regions", "provinces", "money"],
    english: {
      text: "Southern Indian states pay more than 30% of all central taxes collected. Yet for every rupee sent to New Delhi, they get back barely 40 paise for local work. In Pakistan, Sindh generates most tax revenue while cities like Karachi face broken roads and water shortages.\n\nCentral capitals take money from busy factories to build projects elsewhere.\n\nWhy should hardworking regions pay high taxes only to receive breadcrumbs in return?"
    },
    romanUrdu: {
      text: "Junoobi India ke soobay markaz ke kul tax ka 30% se zyada hissa detay hain. Magar New Delhi bhejay gaye har rupay par unhein sirf 40 paise wapis miltay hain. Pakistan mein bhi Sindh sab se zyada tax deta hai magar Karachi mein tooti sarkein hain.\n\nMarkaz kamane walay shehron se paisa le kar doosri jagah lagata hai.\n\nMehnat karne walay ilaqay bhari tax kyon dein jab badlay mein unhein kuch na milay?"
    },
    plainUrdu: {
      text: "جنوبی بھارت کی ریاستیں مرکز کے کل ٹیکس کا تیس فیصد سے زیادہ حصہ دیتی ہیں۔ لیکن دارالحکومت بھیجے گئے ہر روپے پر انہیں بمشکل چالیس پیسے واپس ملتے ہیں۔ پاکستان میں بھی سندھ سب سے زیادہ ٹیکس دیتا ہے مگر کراچی ٹوٹی سڑکوں کا شکار ہے۔\n\nمرکز محنتی شہروں کی کمائی لے کر دوسری جگہ لگا دیتا ہے۔\n\nمحنتی علاقے بھاری ٹیکس کیوں دیں جب بدلے میں انہیں کھنڈرات اور مایوسی ملے؟"
    }
  },

  // 13. Sikhs & Federal Disputes: Agrarian Dissent
  // Source: The Tribune / Indian Express (2023)
  {
    topic: "Sikhs & Federal Disputes: Agrarian Dissent",
    subtopic: "Operation Blue Star and farmer protests",
    category: 'PAK_VS_IND',
    genreId: 'PAK_VS_IND',
    mainSubject: "Sikh political representation and agrarian distress",
    specificEventOrIssue: "Farmer protests and state responses",
    centralArgument: "Peaceful farmers marching for fair crop prices face labels instead of help",
    analyticalAngle: "Farmers demanding crop prices vs state pushback",
    importantStatistics: ["thousands of tractors", "historic gurdwara corridor"],
    keywords: ["farmers", "crops", "tractors", "peace", "rights"],
    english: {
      text: "Thousands of Sikh farmers drove tractors toward New Delhi to protect their family farms. They wanted fair prices for wheat and rice so their families could survive. Instead of listening to their worries, state TV channels called them bad people.\n\nPakistan opened a peaceful corridor so Sikhs could visit their holy site.\n\nWhy do state leaders treat peaceful farming families like enemies of the nation?"
    },
    romanUrdu: {
      text: "Hazaron Sikh kisan apnay haq ke liye tractor chala kar New Delhi pohnchay. Wo gandum aur chawal ki munasib qeemat chahte thay taakay khandan pal sakein. Unki baat sunnay ke bajaye sarkari TV channels ne unhein dushman qarar diya.\n\nPakistan ne Kartarpur ke raste Sikh zaireen ke liye darwazay kholay.\n\nHukoomatein apnay hi kisan khandan ko dushman ki tarah kyon dekhti hain?"
    },
    plainUrdu: {
      text: "ہزاروں سکھ کسان اپنے روزگار کے تحفظ کے لیے ٹریکٹر چلا کر نئی دہلی پہنچے۔ وہ گندم اور چاول کی مناسب قیمت چاہتے تھے تاکہ ان کے بچے پل سکیں۔ کسانوں کی بات سننے کے بجائے سرکاری ٹی وی نے انہیں شرپسند کہا۔\n\nپاکستان نے کرتارپور راہداری کھول کر محبت اور امن کا پیغام دیا۔\n\nحکومتیں اپنے ہی محنتی کسان خاندانوں کو دشمن کی طرح کیوں دیکھتی ہیں؟"
    }
  },

  // 14. India vs Neighbours: Regional Influence & Ports
  // Source: World Bank / Asian Development Bank (2024)
  {
    topic: "India vs Neighbours: Regional Influence & Ports",
    subtopic: "India-Pakistan relations and Chinese influence",
    category: 'PAK_VS_IND',
    genreId: 'PAK_VS_IND',
    mainSubject: "Neighbourhood port diplomacy and South Asian trade",
    specificEventOrIssue: "Chinese port investments vs regional cooperation",
    centralArgument: "Neighbouring countries choose cheaper foreign partners when regional talks stay frozen",
    analyticalAngle: "Regional bullying vs mutual respect with neighbours",
    importantStatistics: ["SAARC frozen", "billions in port funding"],
    keywords: ["neighbours", "ports", "trade", "ships", "borders"],
    english: {
      text: "South Asian countries share long borders, rivers, and common languages. Yet direct trade between India and Pakistan remains shut down due to politics. Smaller neighbours like Sri Lanka, Nepal, and Bangladesh now build ports with Chinese money.\n\nLeaders give speeches about regional brotherhood while keeping border trade gates locked shut.\n\nCan any country be a trusted regional leader if it cannot get along with its neighbours?"
    },
    romanUrdu: {
      text: "South Asian mulkon ki sarhadein, darya aur zubanein aik jaisi hain. Magar siyasat ki waja se India aur Pakistan ki aapas ki tijarat band pari hai. Sri Lanka, Nepal aur Bangladesh ab Cheen ke paison se ports bana rahay hain.\n\nHukmaran dosti ke bhashan detay hain magar sarhad ke darwazay band rakhte hain.\n\nKya koi mulk bara leader ban sakta hai agar wo hamsayon se rishta na nibha sakay?"
    },
    plainUrdu: {
      text: "جنوبی ایشیا کے ممالک مشترکہ سرحدیں، دریا اور زبانیں رکھتے ہیں۔ لیکن سیاست کی وجہ سے پاک بھارت براہ راست تجارت بند پڑی ہے۔ سری لنکا، نیپال اور بنگلہ دیش اب چینی فنڈز سے اپنی بندرگاہیں بنا رہے ہیں۔\n\nحکمران دوستی کے بھاشن دیتے ہیں لیکن سرحد کے تجارتی پھاٹک بند رکھتے ہیں۔\n\nکیا کوئی ملک خطے کا بڑا رہنما بن سکتا ہے اگر وہ پڑوسیوں کے ساتھ اچھے تعلقات نہ رکھے؟"
    }
  },

  // 15. India vs Pakistan: Russian Oil & Energy Realities
  // Source: IEA / Bloomberg (2024)
  {
    topic: "India vs Pakistan: Russian Oil & Energy Realities",
    subtopic: "Russian oil imports",
    category: 'PAK_VS_IND',
    genreId: 'PAK_VS_IND',
    mainSubject: "Discounted Russian crude oil purchases",
    specificEventOrIssue: "Buying discounted oil while balancing foreign ties",
    centralArgument: "Countries buy cheaper fuel for their citizens regardless of outside political advice",
    analyticalAngle: "Cheap energy for regular citizens vs foreign pressure",
    importantStatistics: ["1.6 million barrels daily", "cheaper fuel"],
    keywords: ["oil", "fuel", "energy", "petrol", "prices"],
    english: {
      text: "In 2023, India bought about 1.6 million barrels of discounted oil from Russia every day. It ignored pressure from Western capitals to keep petrol affordable for regular drivers. Meanwhile, Pakistan paid high prices for imported fuel while waiting on foreign loans.\n\nAffordable oil keeps food prices down and factories open for regular workers.\n\nShould poor nations obey foreign powers or secure cheap fuel for their people?"
    },
    romanUrdu: {
      text: "2023 mein India ne Russia se rozana taqreeban 16 lakh barrel sasta tail khareeda. Us ne maghribi dabao ko nazar-andaz kiya taakay aam shehri ke liye petrol sasta rahay. Pakistan doosri taraf mehenga tail khareedta raha aur qarzay leta raha.\n\nSasta tail factoryan chalata hai aur aam cheezon ki qeemat kam rakhta hai.\n\nKya ghareeb mulkon ko bahir ki sunni chahiye ya apne logon ke liye sasta fuel lena chahiye?"
    },
    plainUrdu: {
      text: "2023 میں بھارت نے روس سے روزانہ تقریباً سولہ لاکھ بیرل سستا تیل خریدا۔ اس نے مغربی دباؤ کو نظر انداز کیا تاکہ عام شہریوں کے لیے پیٹرول سستا رہے۔ دوسری طرف پاکستان مہنگا ایندھن خریدتا رہا اور غیر ملکی قرضوں پر انحصار کیا۔\n\nسستا تیل فیکٹریاں چلاتا ہے اور روزمرہ اشیاء کی قیمتیں قابو میں رکھتا ہے۔\n\nکیا غریب ممالک کو باہر کی باتیں سننی چاہئیں یا اپنے شہریوں کے لیے سستا ایندھن لینا چاہیے؟"
    }
  },

  // 16. Textile & Garment Exports: Industrial Footprints & Global Markets
  // Source: WTO / Pakistan Bureau of Statistics (2024)
  {
    topic: "Textile & Garment Exports: Industrial Footprints & Global Markets",
    subtopic: "Export diversification and industrial policy",
    category: 'PAK_VS_IND',
    genreId: 'PAK_VS_IND',
    mainSubject: "Textile manufacturing and readymade garment exports",
    specificEventOrIssue: "Garment manufacturing providing formal industrial employment and foreign exchange",
    centralArgument: "Textile factories employ millions of workers and anchor export earnings across the region",
    analyticalAngle: "Value-added garment exports vs raw commodity exports",
    importantStatistics: ["$16B textile exports Pakistan", "$36B textile exports India"],
    keywords: ["textile", "garments", "exports", "factories", "cotton"],
    english: {
      text: "Textile factories remain the industrial backbone for millions of South Asian families.\n\nPakistan earns over 16 billion dollars yearly exporting textiles, providing jobs to roughly 40% of the industrial workforce. India's textile and apparel shipments top 36 billion dollars across global retail chains. Value-added garment stitching turns domestic cotton crops into high-value exports that power local manufacturing hubs.\n\nCan regional textile mills climb higher into advanced fashion to compete with automation?"
    },
    romanUrdu: {
      text: "Textile factories South Asia ke lakhon khandanon ke rozgar ki bunyad hain.\n\nPakistan saalana 16 arab dollar se zyada ki textile masnooat baramad karta hai jis se 40% sanati mazdoor jurray hain. India ki textile baramdaat 36 arab dollar se zyada hain. Kapray ki silai kisan ki kapas ko aalmi dunya mein qeemti export bana deti hai.\n\nKya muqami textile mills jadeed technology apna kar aalmi muqabla barqarar rakh sakein gi?"
    },
    plainUrdu: {
      text: "ٹیکسٹائل فیکٹریاں جنوبی ایشیا کے لاکھوں محنت کش خاندانوں کے روزگار کا سب سے بڑا سہارا ہیں۔\n\nپاکستان سالانہ سولہ ارب ڈالر سے زائد کی ٹیکسٹائل مصنوعات برآمد کرتا ہے جو صنعتی افرادی قوت کے چالیس فیصد کو روزگار دیتی ہیں۔ بھارت کی ٹیکسٹائل برآمدات چھتیس ارب ڈالر سے زائد ہیں۔ ملبوسات کی سلائی ملکی کپاس کو قیمتی برآمدی مصنوعات میں بدل دیتی ہے۔\n\nکیا خطے کی ٹیکسٹائل ملیں جدید ٹیکنالوجی اپنا کر مستقبل کی عالمی مسابقت جیت سکتی ہیں؟"
    }
  },

  // 17. Semiconductor Geopolitics: TSMC & Taiwan Choke Point
  // Source: SIA / Bloomberg (2024)
  {
    topic: "Semiconductor Geopolitics: TSMC & Taiwan Choke Point",
    subtopic: "Taiwan Strait and global microchip supply security",
    category: 'GEOPOLITICS',
    genreId: 'GEOPOLITICS',
    mainSubject: "Global computer chip supply in Taiwan",
    specificEventOrIssue: "TSMC manufacturing monopoly and global supply risk",
    centralArgument: "Almost all modern phone and car chips come from one small island",
    analyticalAngle: "Microscopic computer chips vs giant armies",
    importantStatistics: ["90% advanced chips", "$2.6 trillion trade at risk"],
    keywords: ["chips", "phones", "factories", "cars", "computers"],
    english: {
      text: "One island makes more than 90% of the world's most advanced computer chips. These tiny silicon chips power our smartphones, cars, airplanes, and medical equipment. If trade routes around the island close, factories across the globe will grind to a halt.\n\nBig world powers spend billions trying to build new chip plants, but opening one takes ten years.\n\nDoes global power depend on massive armies, or on tiny computer chips?"
    },
    romanUrdu: {
      text: "Dunya ke 90% se zyada jadeed computer chips sirf ek jazeera banata hai. Ye chhotay chips hamaray mobile phones, gariyon, jahazon aur machine ko chalatay hain. Agar is jazeeray ka rasta band hua toh dunya ki factoryan ruk jayengi.\n\nBarri taqatein nai factories lagane par arbon laga rahi hain magar is mein das saal lagte hain.\n\nKya dunya barri fojon ke sahare chalti hai ya chhotay computer chips par?"
    },
    plainUrdu: {
      text: "دنیا کے نوے فیصد سے زیادہ جدید کمپیوٹر چپس صرف ایک چھوٹا جزیرہ بناتا ہے۔ یہ چھوٹی چپس ہمارے موبائل فونز، گاڑیوں، جہازوں اور مشینوں کو چلاتی ہیں۔ اگر اس جزیرے کا راستہ بند ہوا تو دنیا کی فیکٹریاں رک جائیں گی۔\n\nبڑی عالمی طاقتیں نئے کارخانے لگانے پر اربوں لگا رہی ہیں لیکن اس میں دس سال لگتے ہیں۔\n\nکیا دنیا بڑی فوجوں کے سہارے چلتی ہے یا کمپیوٹر کی ان چھوٹی چپس پر؟"
    }
  },

  // 18. Red Sea Shipping Disruption: Bab-el-Mandeb Bottleneck
  // Source: UNCTAD / IMF (2024)
  {
    topic: "Red Sea Shipping Disruption: Bab-el-Mandeb Bottleneck",
    subtopic: "Red Sea maritime security and shipping lane disruptions",
    category: 'GEOPOLITICS',
    genreId: 'GEOPOLITICS',
    mainSubject: "Red Sea cargo ship delays and higher grocery prices",
    specificEventOrIssue: "Shipping diversions around Africa and rising freight costs",
    centralArgument: "Blocked narrow sea channels force cargo ships around Africa, raising costs for regular shoppers",
    analyticalAngle: "Narrow sea routes vs everyday consumer prices",
    importantStatistics: ["14 extra days", "50% Suez canal revenue drop"],
    keywords: ["ships", "sea", "cargo", "prices", "routes"],
    english: {
      text: "Big cargo ships carry wheat, oil, and shoes across narrow sea channels. When danger broke out along the Red Sea, ships took the long road around Africa. That detour adds 14 extra days to every trip. It also burns over 1 million dollars in extra ship fuel.\n\nShip owners pass these higher fuel bills straight to grocery stores and regular buyers.\n\nCan modern world trade stay cheap when a narrow water crossing gets blocked?"
    },
    romanUrdu: {
      text: "Baray cargo jahaz darya aur samundar ke raste gandum, tail aur jootay le jatay hain. Jab Red Sea mein khatra barha toh jahazon ne Africa ka lamba rasta liya. Is chakar se har safar par 14 din aur 10 lakh dollar ka extra fuel laga.\n\nJahaz chalane walay ye sara kharcha aam dukandar aur khareedar par daal detay hain.\n\nKya aalmi saman sasta reh sakta hai jab samundar ka ek chhota rasta band ho jaye?"
    },
    plainUrdu: {
      text: "بڑے بحری جہاز گندم، ایندھن اور روزمرہ سامان سمندر کے راستے لاتے ہیں۔ جب بحیرہ احمر میں خطرہ بڑھا تو جہازوں نے افریقہ کا طویل راستہ اختیار کیا۔ اس سے ہر چکر پر چودہ دن اور دس لاکھ ڈالر کا اضافی ایندھن جلتا ہے۔\n\nجہازوں کے مالکان یہ سارا بوجھ دکانوں اور عام خریداروں پر ڈال دیتے ہیں۔\n\nکیا عالمی تجارت سستی رہ سکتی ہے جب سمندر کا ایک تنگ راستہ بند ہو جائے؟"
    }
  },

  // 19. Critical Minerals Scramble: Rare Earth Refining Monopoly
  // Source: IEA / US Geological Survey (2024)
  {
    topic: "Critical Minerals Scramble: Rare Earth Refining Monopoly",
    subtopic: "Critical mineral supply chains and green transition dependencies",
    category: 'GEOPOLITICS',
    genreId: 'GEOPOLITICS',
    mainSubject: "Rare earth mineral refining and clean energy parts",
    specificEventOrIssue: "China refining share vs Western battery supply needs",
    centralArgument: "Electric cars need special minerals that are almost entirely cleaned in one country",
    analyticalAngle: "Clean green energy vs new mineral monopolies",
    importantStatistics: ["70% minerals cleaned in China", "90% motor magnets"],
    keywords: ["minerals", "batteries", "cars", "clean", "energy"],
    english: {
      text: "Electric cars and clean power generators need special minerals to run. Today, one country cleans over 70% of those rare minerals from the ground. It also makes about 90% of the magnets used in electric car motors worldwide.\n\nOther countries want to build their own processing plants, but cleaning these minerals takes years of hard work.\n\nDid the world move away from oil sellers only to depend on one mineral seller?"
    },
    romanUrdu: {
      text: "Bijli se chalnay wali gariyon aur solar panels ko khas madaniyat chahiye hoti hain. Aaj sirf ek mulk zameen se nikli in 70% se zyada madaniyat ko saaf karta hai. Wo electric gariyon ke motors ke 90% magnets bhi akele banata hai.\n\nDoosray mulk apne plants lagana chahte hain magar is kaam mein saalon ki sakht mehnat lagti hai.\n\nKya dunya tail walon se azaad ho kar mineral bechne walay ke haath mein aagayi?"
    },
    plainUrdu: {
      text: "بجلی سے چلنے والی نئی گاڑیوں اور سولر سسٹمز کو خاص معدنیات درکار ہوتی ہیں۔ آج صرف ایک ملک زمین سے نکلنے والی ستر فیصد سے زیادہ معدنیات کو صاف کرتا ہے۔ وہ نئی گاڑیوں کی موٹروں کے نوے فیصد میگنیٹ بھی اکیلے تیار کرتا ہے۔\n\nدوسرے ممالک اپنے کارخانے لگانا چاہتے ہیں لیکن اس کام میں سالوں کی طویل اور سخت محنت درکار ہوتی ہے۔\n\nکیا دنیا تیل بیچنے والوں سے جان چھڑا کر معدنیات کی اجارہ داری میں پھنس گئی ہے؟"
    }
  },

  // 20. Pakistan Energy Crisis: Capacity Payments & Debt
  // Source: NEPRA / World Bank (2024)
  {
    topic: "Pakistan Energy Crisis: Capacity Payments & Debt",
    subtopic: "Energy sector circular debt and capacity payments crisis",
    category: 'PAKISTAN_POLITICS',
    genreId: 'PAKISTAN_POLITICS',
    mainSubject: "Capacity payments to private power plants",
    specificEventOrIssue: "Paying billions for unconsumed electricity while factories shut down",
    centralArgument: "Contracts guarantee private plant owners billions in payments even when generators sit silent",
    analyticalAngle: "Paying for unused electricity vs small factory shutdowns",
    importantStatistics: ["2 trillion rupees annual payments", "55 rupees per unit"],
    keywords: ["electricity", "bills", "factories", "meters", "power"],
    english: {
      text: "Pakistan power bills carry a heavy charge that confuses most families. Private power plants receive over 2 trillion rupees every year just for keeping engines ready. They get paid this cash even when their generators sit completely silent.\n\nMeanwhile, small weaving factories shut down because power rates crossed 55 rupees a unit.\n\nWhy should regular families pay heavy monthly bills for electricity nobody ever used?"
    },
    romanUrdu: {
      text: "Pakistan mein bijli ke bill mein ek aisi raqam shamil hoti hai jo aam aadmi ko samajh nahi aati. Niji bijli gharon ko har saal 20 kharab rupay sirf plant tayyar rakhnay par miltay hain. Unhein ye paisa tab bhi milta hai jab bijli bilkul na banay.\n\nIdhar 55 rupay unit hone par chhoti factoryan band ho rahi hain.\n\nAam khandan har maheenay us bijli ka bill kyon dein jo kisi ne istamal hi nahi ki?"
    },
    plainUrdu: {
      text: "پاکستان میں بجلی کے بل میں ایک ایسی رقم شامل ہوتی ہے جو عام آدمی کو سمجھ نہیں آتی۔ نجی بجلی گھروں کو ہر سال دو کھرب روپے صرف پلانٹ کھڑا رکھنے پر ملتے ہیں۔ انہیں یہ رقم تب بھی ملتی ہے جب پلانٹ بالکل بند پڑا ہو۔\n\nادھر پچپن روپے یونٹ ہونے کی وجہ سے چھوٹے کارخانے بند ہو رہے ہیں۔\n\nعام خاندان ہر ماہ اس بجلی کے بل کیوں بھریں جو کبھی کسی نے استعمال ہی نہیں کی؟"
    }
  },

  // 21. Pakistan Tax Divide: Salaried Squeeze vs Untaxed Elites
  // Source: Federal Board of Revenue (2024)
  {
    topic: "Pakistan Tax Divide: Salaried Squeeze vs Untaxed Elites",
    subtopic: "Tax base broadening and elite exemptions vs salaried class",
    category: 'PAKISTAN_POLITICS',
    genreId: 'PAKISTAN_POLITICS',
    mainSubject: "Salaried workers tax burden vs untaxed wealthy traders",
    specificEventOrIssue: "Income tax deducted at source while property barons pay little",
    centralArgument: "Office employees pay automatic monthly taxes while wealthy property owners skip the tax net",
    analyticalAngle: "Honest salaried workers vs untaxed wealthy elites",
    importantStatistics: ["360 billion rupees from salaried staff", "up to 35% tax rate"],
    keywords: ["taxes", "salary", "workers", "traders", "money"],
    english: {
      text: "Salaried workers paid over 360 billion rupees in direct income taxes last year. Their tax money gets cut from paychecks automatically before they even touch it. Yet wealthy property owners and big traders pay very little to the state treasury.\n\nEvery new national budget squeezes honest office workers while leaving rich traders alone.\n\nWhy should honest monthly wage earners carry the entire weight of the country?"
    },
    romanUrdu: {
      text: "Mulazmat karne walay logon ne pichlay saal 360 arab rupay se zyada income tax diya. Unka tax tankhwah milne se pehle hi kat jata hai. Magar baray property dealers aur ameer tajir khazanay mein bohot kam hissa daaltay hain.\n\nHar naye budget mein mulazimeen par bojh barhta hai aur ameer log bach jatay hain.\n\nEman-dar tankhwah-dar tabqa akele pooray mulk ka bojh kyon uthaye?"
    },
    plainUrdu: {
      text: "تنخواہ دار ملازمین نے پچھلے سال 360 ارب روپے سے زیادہ انکم ٹیکس دیا۔ ان کا ٹیکس تنخواہ ملنے سے پہلے ہی کٹ جاتا ہے۔ لیکن بڑے پراپرٹی ڈیلرز اور امیر تاجر قومی خزانے میں بہت کم حصہ ڈالتے ہیں۔\n\nہر نئے بجٹ میں ملازمین پر بوجھ بڑھا دیا جاتا ہے جبکہ بااثر افراد بچ نکلتے ہیں۔\n\nایک ایماندار تنخواہ دار ملازم اکیلے پورے ملک کا خرچ کیوں اٹھائے؟"
    }
  },

  // 22. State Owned Enterprises: The Trillion Rupee Sovereign Drain
  // Source: Ministry of Finance / IMF (2024)
  {
    topic: "State Owned Enterprises: The Trillion Rupee Sovereign Drain",
    subtopic: "Privatization of state-owned enterprises and fiscal drain",
    category: 'PAKISTAN_POLITICS',
    genreId: 'PAKISTAN_POLITICS',
    mainSubject: "Losses in broken state-owned companies",
    specificEventOrIssue: "Billions in bailouts to broken state airlines and railways",
    centralArgument: "Failing state-owned businesses burn billions in public money each year that schools need",
    analyticalAngle: "Bailing out broken state companies vs funding public schools",
    importantStatistics: ["500 billion rupees lost each year", "schools underfunded"],
    keywords: ["companies", "losses", "schools", "money", "trains"],
    english: {
      text: "A handful of broken government companies lose over 500 billion rupees every single year. These broken airlines, steel mills, and power offices run on public bailout cash. Over the last ten years, keeping them alive cost trillions of public rupees.\n\nThat lost money could have built clean classrooms and bought books for poor children.\n\nWhy keep pouring public money into failing companies while local schools crumble?"
    },
    romanUrdu: {
      text: "Chand na-kabil sarkari idaray har saal 500 arab rupay se zyada ka nuqsan karte hain. Ye tooti hui airlines, steel mills aur bijli ke daftar awam ke paison par chaltay hain. Pichlay das saalon mein in par kharbon rupay lag chukay hain.\n\nIs raqam se saaf classrooms ban saktay thay aur ghareeb bachon ko kitabein mil sakti theen.\n\nNakam companiyon mein awami paisa kyon bahaya jaye jabke school toor-phoor ka shikar hon?"
    },
    plainUrdu: {
      text: "چند ناکارہ سرکاری ادارے ہر سال پانچ سو ارب روپے سے زیادہ کا نقصان کرتے ہیں۔ یہ بند پڑی ایئر لائنز، اسٹیل ملز اور بجلی کے محکمے عوام کے ٹیکس پر چلتے ہیں۔ پچھلے دس سالوں میں ان پر کھربوں روپے بہائے جا چکے ہیں۔\n\nاس رقم سے غریب بچوں کے لیے اسکول بن سکتے تھے اور کتابیں خریدی جا سکتی تھیں۔\n\nنقصان کرنے والے اداروں میں عوامی پیسہ کیوں بہایا جائے جبکہ اسکول ٹوٹ پھوٹ کا شکار ہوں؟"
    }
  },

  // 23. Balochistan Natural Resources: Royalties vs Reality
  // Source: Pakistan Bureau of Statistics / UNDP (2023)
  {
    topic: "Balochistan Natural Resources: Royalties vs Reality",
    subtopic: "Balochistan resource royalties and political integration",
    category: 'SOCIAL_ETHNIC_ISSUES',
    genreId: 'SOCIAL_ETHNIC_ISSUES',
    mainSubject: "Sui gas field production vs lack of household gas",
    specificEventOrIssue: "75% of residents lack gas pipelines despite living on gas fields",
    centralArgument: "Taking gas and copper from poor regions without providing clean pipes or schools is deeply unfair",
    analyticalAngle: "Resource extraction vs local town living standards",
    importantStatistics: ["1952 discovery", "75% lack pipe gas"],
    keywords: ["gas", "pipes", "firewood", "winter", "homes"],
    english: {
      text: "For over seventy years, gas from Balochistan helped cook food across Pakistan. It powered big factory engines in distant cities. Yet more than 75% of local families in the province have no gas pipes in their homes. In cold winter months, families gather firewood to stay warm.\n\nLeaving local towns behind while taking their wealth hurts national unity.\n\nHow can people feel happy when their own rooms stay freezing?"
    },
    romanUrdu: {
      text: "Sattar saal se Balochistan ki gas ne mulk bhar ki factories chalayin aur choolhay jalaye. Magar soobay ke 75% se zyada khandan ke paas ghar mein gas ka pipe nahi hai. Sakht sardi mein khawateen aur bachay lakriyan jalane par majboor hain.\n\nZameen se qeemti cheez le kar muqami bastiyon ko bhula dena na-insafi hai.\n\nLog kaisay apna samjhein jab unki gas bahir jaye magar unka apna ghar thanda rahay?"
    },
    plainUrdu: {
      text: "ستر سال سے بلوچستان کی گیس نے ملک بھر کی فیکٹریاں چلائیں اور چولہے جلائے۔ لیکن صوبے کے 75 فیصد سے زیادہ خاندانوں کے گھروں میں گیس کے پائپ نہیں ہیں۔ سخت سردی میں خواتین اور بچے لکڑیاں جلا کر گزارا کرتے ہیں۔\n\nزمین سے دولت نکال کر مقامی بستیوں کو محروم رکھنا سراسر ناانصافی ہے۔\n\nلوگ کیسے خوش رہیں جب گیس ان کی زمین سے نکلے لیکن ان کے اپنے گھر ٹھنڈے رہیں؟"
    }
  },

  // 24. Out of School Children: South Asia's Lost Generation
  // Source: UNICEF / Ministry of Education (2024)
  {
    topic: "Out of School Children: South Asia's Lost Generation",
    subtopic: "Out-of-school children crisis and foundational literacy",
    category: 'SOCIAL_ETHNIC_ISSUES',
    genreId: 'SOCIAL_ETHNIC_ISSUES',
    mainSubject: "Out of school children numbers in Pakistan",
    specificEventOrIssue: "26 million children out of school while education budgets stay tiny",
    centralArgument: "Leaving over 26 million children out of school destroys the nation's future foundation",
    analyticalAngle: "Out-of-school children vs speeches about youth dividends",
    importantStatistics: ["26 million out of school", "less than 2% GDP for schools"],
    keywords: ["children", "schools", "books", "reading", "future"],
    english: {
      text: "More than 26 million young boys and girls in Pakistan do not go to school. That is the second largest group of unschooled children on earth. The government spends less than 2% of national income on public primary schools. Leaders give fine speeches praising youth in big halls.\n\nYet one out of three children cannot read a simple sentence.\n\nHow can a country build a bright future when millions of kids never hold a pencil?"
    },
    romanUrdu: {
      text: "Pakistan mein 2.6 crore se zyada bachay aur bachiyan kisi school nahi jatay. Ye poori dunya mein doosra sab se bara adad hai. Hukoomat aam primary schoolon aur teachers par aamdani ka 2% se bhi kam kharch karti hai.\n\nLeaders nojawanon ki tareef karte hain magar har teesra bacha aam jumla nahi parh sakta.\n\nKoi mulk acha mustaqbil kaisay banaye ga jab karoron bachon ke paas qalam hi na ho?"
    },
    plainUrdu: {
      text: "پاکستان میں دو کروڑ ساٹھ لاکھ سے زیادہ بچے اور بچیاں کسی اسکول نہیں جاتے۔ یہ پوری دنیا میں اسکول سے باہر بچوں کی دوسری بڑی تعداد ہے۔ حکومت پرائمری اسکولوں اور اساتذہ پر آمدنی کا دو فیصد سے بھی کم لگاتی ہے۔\n\nرہنما نوجوانوں کی تعریف کرتے ہیں لیکن ہر تیسرا بچہ ایک سادہ جملہ نہیں پڑھ سکتا۔\n\nکوئی ملک روشن مستقبل کیسے بنائے گا جب کروڑوں بچوں نے کبھی قلم پکڑا ہی نہ ہو؟"
    }
  },

  // 25. AI Job Displacement: The South Asian BPO Crisis
  // Source: Gartner / ILO (2024)
  {
    topic: "AI Job Displacement: The South Asian BPO Crisis",
    subtopic: "Generative AI displacing South Asian BPO and call center jobs",
    category: 'AI_HUMAN_SOCIETY',
    genreId: 'AI_HUMAN_SOCIETY',
    mainSubject: "Call center jobs vs automated voice bots",
    specificEventOrIssue: "Automated software answering customer support calls for pennies",
    centralArgument: "New computer programs answer phone queries cheaply, threatening office jobs for young graduates",
    analyticalAngle: "Software voice bots vs office jobs for college graduates",
    importantStatistics: ["5 million support jobs", "5 cents vs 4 dollars"],
    keywords: ["jobs", "computers", "calls", "graduates", "work"],
    english: {
      text: "Over 5 million young college graduates in South Asia work answering support calls on computers. New computer voice programs can now answer customer questions for just 5 cents a call. Human office workers cost about 4 dollars for that same work.\n\nForeign banks have already moved thousands of helpline desks to computer bots.\n\nWhere will young graduates find office work when computer programs take basic jobs?"
    },
    romanUrdu: {
      text: "South Asia mein 50 lakh se zyada nojawan computer par helpline aur support ki nokri karte hain. Naye computer voice programs ab sirf 5 cents mein call ka jawab de detay hain. Jabke aam insan us kaam ke 4 dollar leta hai.\n\nBahir ke baray banks ne pehle hi hazaron helpline jobs computer ke hawalay kar di hain.\n\nDegree walay nojawan kahan kaam karenge jab computer hi aam daftari nokriyan le le?"
    },
    plainUrdu: {
      text: "جنوبی ایشیا میں پچاس لاکھ سے زیادہ نوجوان کمپیوٹر پر کال سینٹر اور سپورٹ کا کام کرتے ہیں۔ نئے کمپیوٹر وائس پروگرام اب صرف پانچ سینٹ میں سوالات کے جواب دے دیتے ہیں۔ جبکہ ایک انسان اس کام کے چار ڈالر لیتا ہے۔\n\nغیر ملکی بینکوں نے پہلے ہی ہزاروں ہیلپ لائن ملازمتیں کمپیوٹر کے حوالے کر دی ہیں۔\n\nڈگری یافتہ نوجوان کہاں کام کریں گے جب کمپیوٹر ہی دفتری ملازمتیں سنبھال لے گا؟"
    }
  },

  // 26. Gig Economy Surveillance: Algorithmic Control of Couriers
  // Source: Fairwork / ILO (2024)
  {
    topic: "Gig Economy Surveillance: Algorithmic Control of Couriers",
    subtopic: "Gig economy workers and automated algorithmic management",
    category: 'AI_HUMAN_SOCIETY',
    genreId: 'AI_HUMAN_SOCIETY',
    mainSubject: "Delivery bike riders managed by smartphone phone applications",
    specificEventOrIssue: "Automated account deactivation based on small rating drops",
    centralArgument: "Smartphone apps track riders constantly and shut accounts down without a human conversation",
    analyticalAngle: "App tracking algorithms vs fair treatment of delivery riders",
    importantStatistics: ["4.7 star rating cutoff", "millions of riders"],
    keywords: ["delivery", "bikes", "apps", "phones", "riders"],
    english: {
      text: "Millions of young men ride motorbikes delivering food boxes through city traffic. Mobile phone apps track their speed and pick their daily roads. The app counts every single minute of their ride. If a rider rating falls below 4.7 stars, the app turns off their account.\n\nNo manager calls to ask if rain made roads slippery.\n\nDid modern smartphone apps free working people, or put them under digital bosses?"
    },
    romanUrdu: {
      text: "Lakhon nojawan shehr ke traffic mein motorbike chala kar khana pohnchatay hain. Mobile phone apps unki raftaar, rasta aur har minute note karti hain. Agar app rating 4.7 se gir jaye toh unka account khud-ba-khud band ho jata hai.\n\nKoi manager phone kar ke nahi poochta ke bike kharab thi ya barish ki waja se dair hui.\n\nKya smartphone apps ne mazdoor ko azaadi di ya machine ka ghulam bana diya?"
    },
    plainUrdu: {
      text: "لاکھوں نوجوان شہر کے ٹریفک میں موٹر سائیکل چلا کر کھانا اور پارسل پہنچاتے ہیں۔ موبائل ایپس ان کی رفتار، راستہ اور ہر منٹ نوٹ کرتی ہیں۔ اگر ایپ پر ریٹنگ 4.7 سے نیچے آ جائے تو اکاؤنٹ خود بخود بند ہو جاتا ہے۔\n\nکوئی مینیجر فون کر کے نہیں پوچھتا کہ بائیک خراب تھی یا بارش کی وجہ سے دیر ہوئی۔\n\nکیا اسمارٹ فون ایپس نے مزدور کو روزگار کی آزادی دی یا مشینوں کا ماتحت بنا دیا؟"
    }
  },

  // 27. Climate Injustice: Pakistan Floods vs Global Pledges
  // Source: World Bank / COP28 (2023)
  {
    topic: "Climate Injustice: Pakistan Floods vs Global Pledges",
    subtopic: "Pakistan 2022 floods and historical emissions debt of G7",
    category: 'CLIMATE_GLOBAL_POWER',
    genreId: 'CLIMATE_GLOBAL_POWER',
    mainSubject: "2022 flood damages vs international assistance pledges",
    specificEventOrIssue: "Pakistan contributes under 1% of smoke but suffered 30 billion dollars in flood damages",
    centralArgument: "Poor nations suffer catastrophic floods from global smoke while rich nations offer tiny aid checks",
    analyticalAngle: "Huge flood destruction vs small foreign aid checks",
    importantStatistics: ["under 1% smoke share", "$30 billion flood damages", "33 million displaced"],
    keywords: ["floods", "rain", "mud", "damage", "help"],
    english: {
      text: "Pakistan makes less than 1% of the world's dirty air emissions. Yet heavy summer floods in 2022 broke river banks and caused over 30 billion dollars in damage. More than 33 million regular people lost their mud homes and farm crops.\n\nAt global climate meetings, rich countries gave tiny checks that barely covered small repairs.\n\nWhy should poor farming families lose everything for dirty air they never created?"
    },
    romanUrdu: {
      text: "Pakistan dunya ki 1% se bhi kam gandi hawa banata hai. Magar 2022 ke selaab ne darya toray aur 30 arab dollar se zyada ka nuqsan kiya. 3.3 crore se zyada aam logon ke kache ghar aur faslein paani mein beh gayin.\n\nAalmi meetings mein ameer mulkon ne chhotay checks diye jo marammat ke liye bhi kam thay.\n\nGhareeb kisan us aloodgi ka nuqsan kyon uthayein jo unhon ne paida hi nahi ki?"
    },
    plainUrdu: {
      text: "پاکستان دنیا کی ایک فیصد سے بھی کم آلودگی پیدا کرتا ہے۔ لیکن 2022 کے تباہ کن سیلاب نے تیس ارب ڈالر سے زیادہ کا نقصان کیا۔ تین کروڑ سے زیادہ عام شہریوں کے کچے مکانات اور فصلیں بہہ گئیں۔\n\nعالمی کانفرنسوں میں امیر ممالک نے برائے نام فنڈز دیے جو چھوٹی مرمت کے لیے بھی ناکافی تھے۔\n\nغریب کسان خاندان اس آلودگی کا خمیازہ کیوں بھگتیں جو انہوں نے کبھی پیدا ہی نہیں کی؟"
    }
  },

  // 28. Urban Air Pollution: South Asian Smog Emergency
  // Source: WHO / Air Quality Life Index (2024)
  {
    topic: "Urban Air Pollution: South Asian Smog Emergency",
    subtopic: "Urban smog crisis, industrial emissions and air quality indices",
    category: 'CLIMATE_GLOBAL_POWER',
    genreId: 'CLIMATE_GLOBAL_POWER',
    mainSubject: "Winter toxic smog across Lahore, Delhi, and Karachi",
    specificEventOrIssue: "AQI exceeding 500 while governments just close schools on Sundays",
    centralArgument: "Poisonous winter smoke cuts five years off citizen lives while leaders treat it like bad weather",
    analyticalAngle: "Poisonous air vs simple Sunday school closures",
    importantStatistics: ["5 years off life", "smoke above 500 index"],
    keywords: ["smog", "smoke", "cough", "winter", "air"],
    english: {
      text: "Every winter, dirty brown smoke blankets big cities from Lahore to New Delhi. Medical experts warn this toxic smog cuts more than 5 years off an average person's life. Old factory chimneys and dirty vehicle fuel pump black dust into children's lungs.\n\nMinisters order Sunday school closures rather than making factory owners install clean filters.\n\nWhy treat poisonous air like ordinary bad weather when our children cannot breathe?"
    },
    romanUrdu: {
      text: "Har sardi Lahore se New Delhi tak baray shehron par zehreela dhuwan chha jata hai. Doctors kehte hain ke ye smog aam insan ki zindagi se 5 saal kam kar deti hai. Puranay karkhane aur kharab petrol bachon ke phepbron mein dhuwan bharte hain.\n\nWazeer karkhanon par filter lagwane ke bajaye itwar ki chhutti karwa detay hain.\n\nZehreeli hawa ko mausam ka bahana kyon banaya jaye jab bachay saans na le sakein?"
    },
    plainUrdu: {
      text: "ہر سردی میں لاہور سے نئی دہلی تک بڑے شہروں پر کالا زہریلا دھواں چھا جاتا ہے۔ ماہرین کا کہنا ہے کہ یہ اسموگ عام شہری کی زندگی سے پانچ سال چھین لیتی ہے۔ پرانے کارخانے اور خراب پیٹرول بچوں کے پھیپھڑوں میں زہر بھرتے ہیں۔\n\nوزیر کارخانوں پر فلٹر لگانے کے بجائے اتوار کی چھٹی کا اعلان کر دیتے ہیں۔\n\nزہریلی فضا کو موسمی مجبوری کیوں کہا جائے جب ہمارے اپنے بچے سانس نہ لے سکیں؟"
    }
  },

  // 29. State Priorities: VIP Protocol vs Citizen Ambulances
  // Source: Dawn / Express Tribune (2024)
  {
    topic: "State Priorities: VIP Protocol vs Citizen Ambulances",
    subtopic: "VIP protocol motorcades blocking citizen emergency ambulances",
    category: 'SATIRICAL_COMMENTARY',
    genreId: 'SATIRICAL_COMMENTARY',
    mainSubject: "VIP motorcades blocking citizen traffic",
    specificEventOrIssue: "35 bulletproof vehicles blocking ambulances on city roads",
    centralArgument: "Blocking sick people in traffic so leaders can travel in giant convoys shows broken priorities",
    analyticalAngle: "Giant security convoys vs sick patients waiting in ambulances",
    importantStatistics: ["35 armored vehicles", "45 minute road blocks"],
    keywords: ["cars", "protocol", "roads", "ambulances", "hospital"],
    english: {
      text: "A regular leader convoy in South Asia brings out 35 armored cars. Hundreds of police guards line the route. Officers block busy city roads for forty-five minutes so big cars can speed through. Sick people in hospital ambulances get trapped behind security barriers.\n\nLeaders preach sacrifice while burning barrels of fuel on short rides.\n\nDoes the state exist to serve regular voters or to clear roads for wealthy bosses?"
    },
    romanUrdu: {
      text: "South Asia mein kisi baray wazeer ke safar par 35 bulletproof gariyan aur hazaron police aati hai. Afsar 45 minute ke liye shehr ki sarkein band kar detay hain taakay kafla guzray. Aspataal janay wali ambulances barriers ke peechay phansi rehti hain.\n\nHukmaran TV par sadgi ka dars detay hain magar chhotay safar par petrol ulat-te hain.\n\nSarkari nizam aam shehri ki khidmat ke liye hai ya baray afsaron ka rasta kholne ke liye?"
    },
    plainUrdu: {
      text: "جنوبی ایشیا میں روایتی پروٹوکول کے لیے 35 بلٹ پروف گاڑیاں اور سینکڑوں اہلکار سڑکوں پر نکل آتے ہیں۔ پولیس پینتالیس منٹ کے لیے راستے بند کر دیتی ہے تاکہ قافلہ گزر سکے۔ اسپتال جانے والی ایمبولینسیں بیریئرز کے پیچھے پھنسی رہتی ہیں۔\n\nحکمران ٹی وی پر سادگی کا بھاشن دیتے ہیں مگر مختصر فاصلے کے لیے پیٹرول اڑاتے ہیں۔\n\nریاست عام شہریوں کی خدمت کے لیے بنی ہے یا بڑے حاکموں کے راستے کھولنے کے لیے؟"
    }
  },

  // 30. Official Austerity Summits: Buffets vs Budget Cuts
  // Source: Dawn / The News (2024)
  {
    topic: "Official Austerity Summits: Buffets vs Budget Cuts",
    subtopic: "Austerity task forces dining at five-star hotel summits",
    category: 'SATIRICAL_COMMENTARY',
    genreId: 'SATIRICAL_COMMENTARY',
    mainSubject: "Government austerity task forces dining at luxury five-star hotels",
    specificEventOrIssue: "Spending millions on luxury meals to announce office tea biscuit cuts",
    centralArgument: "Holding expensive hotel banquets to announce cutting biscuits for junior clerks is pure theater",
    analyticalAngle: "Expensive five-star dinners vs cutting biscuits for office clerks",
    importantStatistics: ["five-star hotel meetings", "cutting office biscuits"],
    keywords: ["hotels", "dinners", "savings", "clerks", "biscuits"],
    english: {
      text: "Government saving committees love to meet inside expensive five-star hotels. They spend public money on rich hotel dinners. Then they announce that junior clerks will lose their office tea biscuits. Printing their colorful summary books costs more money than the plan ever saves.\n\nMinisters clap for their own thrift while buying shiny cars for official drives.\n\nIs official saving a real plan, or just an expensive show for public cameras?"
    },
    romanUrdu: {
      text: "Bachat karne wali sarkari committees mehangay 5-star hotels mein bethna pasand karti hain. Wo shaandar khanon par paisa lagati hain aur elaan karti hain ke chhotay clerk ki chai biscuit band hai. Inki rangeen kitabein chhapne par bachat se zyada kharcha ho jata hai.\n\nWazeer apni bachat par taaliyan bajatay hain aur nai chamakti gariyan khareedtay hain.\n\nKya ye bachat ka koi sachha mansooba hai ya sirf camera ke liye mehanga drama?"
    },
    plainUrdu: {
      text: "بچت کمیٹیوں کے اجلاس مہنگے فائیو اسٹار ہوٹلوں میں سجتے ہیں۔ وہ پر تکلف کھانوں پر پیسہ اڑاتے ہیں اور فیصلہ سناتے ہیں کہ چھوٹے کلرک کی چائے بسکٹ بند کر دیے جائیں۔ ان کی رنگین کتابیں چھاپنے پر بچت سے زیادہ خرچ ہو جاتا ہے۔\n\nوزیر اپنی بچت کے دعوؤں پر تالیاں بجاتے ہیں اور پروٹوکول کے لیے چمچماتی نئی گاڑیاں لیتے ہیں۔\n\nکیا یہ بچت کی سنجیدہ پالیسی ہے یا کیمروں کے سامنے دکھانے کے لیے مہنگا تماشا؟"
    }
  }
];

export const CURATED_STORY_TOPICS = FALLBACK_BANK;

/* =========================================================
   DYNAMIC CATEGORY FALLBACK ENGINE WITH ZERO DUPLICATION
========================================================= */

function generateDynamicFallback(category, subtopic = '', excludedTopic = '', avoidList = []) {
  const cleanExcluded = String(excludedTopic || '').toLowerCase().trim();
  const avoidCombined = avoidList.map(a => String(a).toLowerCase());

  for (const item of FALLBACK_BANK) {
    if (category && item.category !== category) {
      continue;
    }

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

    return {
      topic: item.topic,
      subtopic: item.subtopic || subtopic || item.topic,
      category: item.category,
      genreId: item.category,
      mainSubject: item.mainSubject,
      specificEventOrIssue: item.specificEventOrIssue,
      centralArgument: item.centralArgument,
      analyticalAngle: item.analyticalAngle,
      importantStatistics: item.importantStatistics,
      keywords: item.keywords,
      english: formatEntry(item.english.text),
      romanUrdu: item.romanUrdu ? formatEntry(item.romanUrdu.text) : null,
      plainUrdu: item.plainUrdu ? formatEntry(item.plainUrdu.text) : null
    };
  }

  // Second pass: if category has no entries (e.g. custom user-added genre), pick any unseen entry
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

    return {
      topic: item.topic,
      subtopic: item.subtopic || subtopic || item.topic,
      category: category || item.category,
      genreId: category || item.category,
      mainSubject: item.mainSubject,
      specificEventOrIssue: item.specificEventOrIssue,
      centralArgument: item.centralArgument,
      analyticalAngle: item.analyticalAngle,
      importantStatistics: item.importantStatistics,
      keywords: item.keywords,
      english: formatEntry(item.english.text),
      romanUrdu: item.romanUrdu ? formatEntry(item.romanUrdu.text) : null,
      plainUrdu: item.plainUrdu ? formatEntry(item.plainUrdu.text) : null
    };
  }

  return null;
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

export async function generateEnglishPost(customTopic = '', excludedTopic = '', excludedContext = null) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const cfToken = process.env.CLOUDFLARE_API_TOKEN || config.cloudflareApiToken;
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || config.cloudflareAccountId;
  const xaiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const cleanExcluded = String(excludedTopic || '').toLowerCase().trim();

  // Retrieve comprehensive past topics and avoid list from permanent historyStore and Mongo
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

  // Also query Mongo topics to avoid across bot reboots
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

  // Genre selection
  const primaryGenre = genreManager.getPrimaryGenre();
  const allGenres = genreManager.getAllGenres();

  let targetCategory;
  if (primaryGenre) {
    targetCategory = primaryGenre;
  } else {
    targetCategory = allGenres[categoryRotationIndex % allGenres.length];
    categoryRotationIndex++;
  }

  let chosenCategory = targetCategory.id;

  // If a custom topic is provided, align genre
  if (customTopic.trim()) {
    chosenCategory = 'PAK_VS_IND';
    targetCategory = allGenres.find(g => g.id === 'PAK_VS_IND') || targetCategory;
  }

  const usedSubtopics = historyStore.getAllUsedSubtopics(chosenCategory);

  // RETRY LOOP: Try up to 5 times to generate a genuinely unique post
  const MAX_ATTEMPTS = 5;
  let lastRejectionReason = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let chosenTopic = customTopic.trim();
    if (chosenTopic && (attempt > 1 || (cleanExcluded && chosenTopic.toLowerCase() === cleanExcluded))) {
      chosenTopic = '';
    }

    // Select an unused subtopic for this attempt
    const chosenSubtopic = chosenTopic || genreManager.getUnusedSubtopic(chosenCategory, usedSubtopics, cleanExcluded);
    if (!chosenTopic) {
      chosenTopic = chosenSubtopic;
    }

    // Construct prompt
    const prompt = chosenCategory === 'PAK_VS_IND'
      ? createPakVsIndPrompt(chosenTopic, chosenSubtopic, avoidList)
      : createEnglishPrompt(chosenTopic, chosenSubtopic, targetCategory, avoidList);

    let candidate = null;
    let providerName = '';

    /* ---------------- TIER 1. GOOGLE GEMINI FREE API ---------------- */
    if (geminiKey && !candidate) {
      try {
        const res = await callWithSimplify(callGemini, prompt, geminiKey);
        const validated = validateAIResponse(res, chosenTopic, chosenCategory, chosenSubtopic);
        candidate = validated;
        providerName = 'Google Gemini Free API';
      } catch (err) {
        console.warn(`[Gemini API] ${err.message}. Trying next tier...`);
      }
    }

    /* ---------------- TIER 2. CLOUDFLARE WORKERS AI ---------------- */
    if (cfToken && cfAccountId && !candidate) {
      try {
        console.log(`[Cloudflare AI] Calling Cloudflare Workers AI for topic: "${chosenTopic}"...`);
        const res = await callWithSimplify(callCloudflareAI, prompt);
        const validated = validateAIResponse(res, chosenTopic, chosenCategory, chosenSubtopic);
        candidate = validated;
        providerName = 'Cloudflare Workers AI (Llama 3.1)';
        console.log(`[Cloudflare AI] ✓ Successfully generated post with Cloudflare Workers AI!`);
      } catch (err) {
        console.warn(`[Cloudflare AI] ${err.message}. Trying next tier...`);
      }
    }

    /* ---------------- TIER 3. xAI GROK API ---------------- */
    if (xaiKey && !candidate) {
      try {
        console.log(`[Grok API] Calling xAI Grok API for topic: "${chosenTopic}"...`);
        const res = await callWithSimplify(callXai, prompt, 'grok-2-latest');
        const validated = validateAIResponse(res, chosenTopic, chosenCategory, chosenSubtopic);
        candidate = validated;
        providerName = 'xAI Grok API';
        console.log(`[Grok API] ✓ Successfully generated post with xAI Grok!`);
      } catch (err) {
        console.warn(`[Grok API] ${err.message}. Trying next tier...`);
      }
    }

    /* ---------------- TIER 4. GROQ CLOUD API ---------------- */
    if (groqKey && !candidate) {
      try {
        console.log(`[Groq API] Calling Groq Cloud API for topic: "${chosenTopic}"...`);
        const res = await callWithSimplify(callGroq, prompt, groqKey);
        const validated = validateAIResponse(res, chosenTopic, chosenCategory, chosenSubtopic);
        candidate = validated;
        providerName = 'Groq Cloud API (Free)';
        console.log(`[Groq API] ✓ Successfully generated post with Groq!`);
      } catch (err) {
        console.warn(`[Groq API] ${err.message}. Trying fallback bank...`);
      }
    }

    /* ---------------- TIER 5. FALLBACK BANK ---------------- */
    if (!candidate) {
      const fallback = generateDynamicFallback(chosenCategory, chosenSubtopic, cleanExcluded, avoidList);
      if (fallback) {
        candidate = fallback;
        providerName = 'Fallback Analytical Bank';
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
      console.warn(`[Pipeline] Concurrency lock conflict for candidate "${candidate.topic}". Retrying...`);
      continue;
    }

    try {
      // RUN 6-STAGE DUPLICATE AND ARGUMENT UNIQUENESS CHECKS
      const dupCheck = historyStore.isDuplicateOrSimilar(candidate.english.text, candidate.topic, candidateMeta);
      const isMongoDup = await isDuplicatePost(candidate.topic, candidate.english.text, candidateMeta);

      if (dupCheck.isDuplicate || isMongoDup) {
        lastRejectionReason = dupCheck.reason || 'MongoDB exact/subtopic collision';
        console.warn(`[Pipeline Attempt ${attempt}/${MAX_ATTEMPTS}] Rejected non-unique candidate "${candidate.topic}": ${lastRejectionReason}`);
        avoidList.unshift(`AVOID_REJECTED_ATTEMPT: "${candidate.topic}" (${lastRejectionReason})`);
        usedSubtopics.push(candidateMeta.subtopic);
        continue; // Retry loop with different subtopic
      }

      // Candidate is 100% unique! Persist to HistoryStore and MongoDB
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

  throw new Error(`Unable to generate a unique post after ${MAX_ATTEMPTS} attempts for genre "${targetCategory.name}". Reason: ${lastRejectionReason || 'Subtopics and arguments exhausted'}`);
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

  const prompt = `Translate this post into very simple Pakistani Roman Urdu.

ENGLISH POST:
"${englishPost.text}"

RULES:
- Preserve the exact 3-part layout separated by double line breaks (\\n\\n):
  Line 1: A single punchy hook line in Roman Urdu.
  \\n\\n
  Paragraph 2: The real body in Roman Urdu with the exact same numbers and facts.
  \\n\\n
  Line 3: A one-line engaging conclusion or closing question in Roman Urdu.
- Use simple everyday words that any regular Pakistani speaks at home.
- Keep the exact same numbers, facts, and the final question intact.
- Every sentence must be short and easy to understand.
- Target length: 400 to 600 characters total.
- ZERO hashtags, ZERO emojis. NEVER use labels like "Hook:" or "Body:".
- Return ONLY valid JSON:
{
  "text": "Line 1 hook\\n\\nBody paragraph\\n\\nConclusion line"
}`;

  let romanEntry = null;

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

  const prompt = `Translate this post into very simple Pakistani Urdu script (اردو).

ENGLISH POST:
"${englishPost.text}"

RULES:
- Preserve the exact 3-part layout separated by double line breaks (\\n\\n):
  Line 1: A single punchy hook line in Urdu (اردو).
  \\n\\n
  Paragraph 2: The real body in Urdu with the exact same numbers and facts.
  \\n\\n
  Line 3: A one-line engaging conclusion or closing question in Urdu.
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

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${targetModel}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        max_tokens: 512,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content: 'You write engaging X posts in simple conversational A1-A2 English like regular people talk and text. Every post MUST strictly follow this exact 3-part layout separated by double line breaks (\\n\\n):\nLine 1: A single punchy hook line.\n\\n\\nParagraph: The real body with verified facts and real numbers.\n\\n\\nClosing Line: A one-line engaging conclusion or thoughtful question.\nTotal post length MUST be between 400 and 600 characters. Never use hashtags, emojis, or labels like "Hook:" or "Body:". Return ONLY a valid JSON object matching the requested schema.'
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
            content: 'You write engaging X posts in simple conversational A1-A2 English like regular people talk and text. Every post MUST strictly follow this exact 3-part layout separated by double line breaks (\\n\\n):\nLine 1: A single punchy hook line.\n\\n\\nParagraph: The real body with verified facts and real numbers.\n\\n\\nClosing Line: A one-line engaging conclusion or thoughtful question.\nTotal post length MUST be between 400 and 600 characters. Never use hashtags, emojis, or labels like "Hook:" or "Body:". Return ONLY a valid JSON object matching the requested schema.'
          },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4
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
              content: 'You write engaging X posts in simple conversational A1-A2 English like regular people talk and text. Every post MUST strictly follow this exact 3-part layout separated by double line breaks (\\n\\n):\nLine 1: A single punchy hook line.\n\\n\\nParagraph: The real body with verified facts and real numbers.\n\\n\\nClosing Line: A one-line engaging conclusion or thoughtful question.\nTotal post length MUST be between 400 and 600 characters. Never use hashtags, emojis, or labels like "Hook:" or "Body:". Return ONLY a valid JSON object matching the requested schema.'
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
