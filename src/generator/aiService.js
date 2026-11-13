/**
 * X-BOT — Advanced Geopolitical & Strategic Analysis Content Engine
 *
 * Core Focus:
 * - Current global affairs, geopolitical rivalries, and military strategy
 * - Economic warfare, emerging technologies, and international power politics
 * - Sounds like a geopolitical analyst explaining the deeper meaning behind world events
 *
 * Categories:
 * A. China, Taiwan & Indo-Pacific
 * B. Military Strategy & Intelligence
 * C. Iran, Israel & Middle East
 * D. Global Economy & Financial Warfare
 * E. AI, Technology & Cybersecurity
 * F. Civilization, History & Global Power
 *
 * Standards:
 * - English Level: Natural, fluent B1–B2 analytical English
 * - Target Length: 180–260 characters (strictly max 280 X characters)
 * - Zero hashtags, zero emojis, zero conversational fluff
 * - Translations: Pakistani Roman Urdu and Plain Urdu script (اردو)
 * - Strict MongoDB SHA-256 deduplication & category rotation
 */

import Groq from 'groq-sdk';
import { calculateXCharacterCount } from '../utils/validation.js';
import {
  isDuplicatePost,
  saveGeneratedPost,
  getAllUsedTopics
} from '../db/postModel.js';

/* =========================================================
   6 CORE STRATEGIC CATEGORIES & KEYWORDS
========================================================= */

export const CONTENT_CATEGORIES = [
  {
    id: 'CHINA_TAIWAN_INDO_PACIFIC',
    name: 'China, Taiwan & Indo-Pacific',
    keywords: [
      "People's Liberation Army (PLA)", "Taiwan annexation", "Taiwan Strait",
      "TSMC", "Semiconductor industry", "Advanced AI chips", "Chip manufacturing",
      "Silicon supply chains", "Naval blockade", "Military encirclement",
      "US-China rivalry", "Indo-Pacific strategy", "South China Sea", "Strategic deterrence"
    ]
  },
  {
    id: 'MILITARY_STRATEGY_INTELLIGENCE',
    name: 'Military Strategy & Intelligence',
    keywords: [
      "Sun Tzu", "The Art of War", "Military doctrine", "Electronic warfare",
      "Cyber warfare", "Intelligence operations", "Satellite surveillance",
      "Military radars", "Missile defence", "Drone warfare", "Hypersonic weapons",
      "Nuclear deterrence", "Proxy warfare", "Strategic corridors", "Military alliances"
    ]
  },
  {
    id: 'IRAN_ISRAEL_MIDDLE_EAST',
    name: 'Iran, Israel & Middle East',
    keywords: [
      "Iran", "Israel", "United States", "Nuclear programme", "Nuclear deterrence",
      "Oil prices", "Strait of Hormuz", "Energy security", "Regional proxies",
      "Missile capabilities", "Cyber attacks", "Middle Eastern power balance",
      "Sanctions", "Regional escalation"
    ]
  },
  {
    id: 'GLOBAL_ECONOMY_FINANCIAL_WARFARE',
    name: 'Global Economy & Financial Warfare',
    keywords: [
      "Global oil markets", "Stock exchanges", "Cryptocurrency", "Bitcoin",
      "Economic sanctions", "Dollar dominance", "Financial warfare", "Trade wars",
      "Global markets", "Supply chain disruption", "Energy corridors",
      "International trade routes", "Strategic ports", "Economic dependencies"
    ]
  },
  {
    id: 'AI_TECHNOLOGY_CYBERSECURITY',
    name: 'AI, Technology & Cybersecurity',
    keywords: [
      "Artificial intelligence", "AI chip race", "Semiconductor dependency",
      "Cyber espionage", "Digital surveillance", "Digital dictatorship",
      "Algorithmic control", "Data sovereignty", "Quantum computing",
      "Cyber attacks", "Critical infrastructure", "Digital currency",
      "Information warfare", "Technology sanctions"
    ]
  },
  {
    id: 'CIVILIZATION_HISTORY_GLOBAL_POWER',
    name: 'Civilization, History & Global Power',
    keywords: [
      "Rise and fall of civilizations", "Ancient trade routes", "Silk Road",
      "Belt and Road Initiative", "Global corridors", "Historical empires",
      "Civilizational competition", "Geography and power", "Resource control",
      "Maritime trade", "Strategic geography", "New world order"
    ]
  }
];

/* =========================================================
   CURATED ANALYTICAL TOPIC BANK (B1-B2 ANALYTICAL BENCHMARKS)
========================================================= */

export const CURATED_STORY_TOPICS = [
  // Category A: China, Taiwan & Indo-Pacific
  {
    topic: "Taiwan's Semiconductor Shield and the Global Economy",
    category: 'CHINA_TAIWAN_INDO_PACIFIC',
    english: {
      text: "Taiwan's importance goes far beyond its geography. Its semiconductor industry connects the island to the global economy. Any military crisis in the Taiwan Strait disrupts AI development, chip supply, and global trade. Control over Taiwan carries consequences far beyond Asia."
    },
    romanUrdu: {
      text: "Taiwan ki ahemiyat sirf geography tak mehdood nahi. Iski semiconductor industry poori aalmi maeeshat ko jorrti hai. Taiwan Strait mein koi bhi larrai computer chips aur trade ko foran rok degi. Taiwan par qabzay ke asraat Asia se bohat agay jayenge."
    },
    plainUrdu: {
      text: "تائیوان کی اہمیت محض جغرافیے تک محدود نہیں۔ اس کی سیمی کنڈکٹر صنعت جزیرے کو عالمی معیشت سے جوڑتی ہے۔ آبنائے تائیوان میں فوجی بحران چپ سپلائی اور عالمی تجارت کو مفلوج کر دے گا۔ تائیوان پر کنٹرول کے نتائج ایشیا سے کہیں آگے تک جائیں گے۔"
    }
  },
  {
    topic: "PLA Encirclement and the Strategy of Chokepoints",
    category: 'CHINA_TAIWAN_INDO_PACIFIC',
    english: {
      text: "China's PLA naval drills around Taiwan aren't preparing for a traditional beach landing. A sustained maritime blockade cuts off energy imports and halts advanced semiconductor exports in days. In modern warfare, economic starvation precedes artillery."
    },
    romanUrdu: {
      text: "Taiwan ke ird gird China ki PLA mashqein kisi foji hamlay ki nahi balkay naakabandi ki tayari hain. Samandar band hotay hi Taiwan ka tail aur chip export dinon mein ruk jaye gi. Jadeed jung mein topon se pehle maashi naakabandi aati hai."
    },
    plainUrdu: {
      text: "تائیوان کے گرد چینی فوج کی مشقیں روایتی زمینی حملے کی تیاری نہیں۔ بحری ناکہ بندی چند دنوں میں تائیوان کے ایندھن اور چپ برآمدات کو روک سکتی ہے۔ جدید دور کی جنگ میں گولہ باری سے پہلے معاشی محاصرہ فیصلہ کن ہوتا ہے۔"
    }
  },

  // Category B: Military Strategy & Intelligence
  {
    topic: "Sun Tzu, Information Warfare and Modern Military Doctrine",
    category: 'MILITARY_STRATEGY_INTELLIGENCE',
    english: {
      text: "Sun Tzu argued that understanding the enemy is essential to victory. Modern military strategy follows a similar principle. Satellite surveillance, cyber intelligence, and electronic warfare weaken an opponent before missiles launch. Information is as valuable as firepower."
    },
    romanUrdu: {
      text: "Sun Tzu ka usool tha ke dushman ko samajhna hi jeet ki asal bunyad hai. Jadeed military doctrine isi par chalti hai. Satellite surveillance, cyber intelligence aur electronic jammers pehla missile chalnay se pehle dushman ko kamzor kar dete hain."
    },
    plainUrdu: {
      text: "سن زو کا مؤقف تھا کہ دشمن کو سمجھنا ہی فتح کی اصل ضمانت ہے۔ جدید فوجی حکمت عملی اسی اصول پر استوار ہے۔ سیٹلائٹ نگرانی، سائبر انٹیلی جنس اور الیکٹرانک وارفیئر پہلے میزائل کے داغے جانے سے قبل حریف کو مفلوج کر دیتے ہیں۔"
    }
  },
  {
    topic: "Electronic Warfare and the Silent Radar Battles",
    category: 'MILITARY_STRATEGY_INTELLIGENCE',
    english: {
      text: "Modern air superiority is no longer decided by dogfights. Long-range phased-array radars and airborne electronic jammers blind defensive sensors before aircraft ever appear. Whoever commands the electromagnetic spectrum commands the battlefield."
    },
    romanUrdu: {
      text: "Hawa mein bartari ab aam jahazon ki larrai se nahi jeeti jati. Long-range phased-array radars aur airborne electronic jammers hamlay se pehle dushman ke sensors ko andha kar dete hain. Jo electromagnetic spectrum par qabza karega, maidan uska hoga."
    },
    plainUrdu: {
      text: "فضائی برتری اب روایتی فضائی جھڑپوں سے طے نہیں پاتی۔ طویل فاصلے کے فیزڈ ارے ریڈارز اور الیکٹرانک جیمرز حملہ آور طیاروں کے پہنچنے سے قبل دفاعی سینسرز کو اندھا کر دیتے ہیں۔ جو الیکٹرو میگنیٹک میدان جیتے گا، معرکہ اسی کا ہوگا۔"
    }
  },

  // Category C: Iran, Israel & Middle East
  {
    topic: "Iran, the Strait of Hormuz and Global Energy Markets",
    category: 'IRAN_ISRAEL_MIDDLE_EAST',
    english: {
      text: "A conflict involving Iran is never limited to the Middle East. The Strait of Hormuz carries a major share of global oil trade. Any disruption immediately rocks energy prices, financial markets, and foreign economies. Geography remains a decisive weapon in world politics."
    },
    romanUrdu: {
      text: "Iran ki larrai kabhi sirf Middle East tak mehdood nahi rehti. Strait of Hormuz aalmi tail ki rasad ka barri hissa sambhalta hai. Yahan ki rukawat foran tail ki qeematein aur stock markets hila deti hai. Aalmi siyasat mein geography sab se bara hathiyar hai."
    },
    plainUrdu: {
      text: "ایران سے وابستہ کشیدگی کبھی مشرق وسطیٰ تک محدود نہیں رہتی۔ آبنائے ہرمز عالمی تیل کی ترسیل کا بڑا حصہ سنبھالتی ہے۔ یہاں معمولی رکاوٹ بھی توانائی کی قیمتوں اور منڈیوں کو ہلا دیتی ہے۔ جغرافیہ آج بھی عالمی سیاست کا سب سے بڑا ہتھیار ہے۔"
    }
  },
  {
    topic: "Regional Proxies and the Attrition of Superpower Power",
    category: 'IRAN_ISRAEL_MIDDLE_EAST',
    english: {
      text: "Direct confrontations between heavily armed states are avoided due to nuclear risks. Instead, low-cost drone networks and regional proxies fight protracted wars along vital trade corridors, forcing major powers to burn billion-dollar missiles to counter cheap attacks."
    },
    romanUrdu: {
      text: "Nuclear khatray ki wajah se barri taqatein aapas mein seedhi jung se bachti hain. Iske bajaye saste drones aur regional proxies ahem tijarati raston par jung larrte hain, jahan superpowers ko saste hamlon ke samnay arabon dollar ke missiles zaya karnay partay hain."
    },
    plainUrdu: {
      text: "ایٹمی خطرات کی وجہ سے بڑی طاقتیں براہ راست تصادم سے گریز کرتی ہیں۔ اس کے برعکس سستے ڈرونز اور پراکسی نیٹ ورکس اہم تجارتی راہداریوں پر ایسی جنگ چھیڑتے ہیں جہاں بڑی طاقتوں کو معمولی حملوں کے دفاع کے لیے اربوں ڈالرز جھونکنے پڑتے ہیں۔"
    }
  },

  // Category D: Global Economy & Financial Warfare
  {
    topic: "Dollar Dominance and the Weaponization of Global Finance",
    category: 'GLOBAL_ECONOMY_FINANCIAL_WARFARE',
    english: {
      text: "When international clearing rails and foreign reserves are frozen as policy levers, financial dominance creates its own counter-reaction. Nations diversify into gold, local currency settlements, and decentralized ledgers to insulate their economies from dollar shocks."
    },
    romanUrdu: {
      text: "Jab international banking systems aur bank reserves ko siyasi hathiyar banaya jata hai, to dollar ki bartari apne khilaf naye raste banati hai. Mumalik ab sonay, local currency trade aur decentralized crypto ki taraf ja rahay hain taakay sanctions se bach sakein."
    },
    plainUrdu: {
      text: "جب بین الاقوامی مالیاتی نیٹ ورکس اور زر مبادلہ کے ذخائر کو بطور ہتھیار استعمال کیا جائے تو مالیاتی بالادستی خود اپنے متبادل کو جنم دیتی ہے۔ ممالک اب سونے، مقامی کرنسیوں اور بلاک چین کی طرف بڑھ رہے ہیں تاکہ مالیاتی جھٹکوں سے محفوظ رہ سکیں۔"
    }
  },
  {
    topic: "Maritime Chokepoints and Fragile Global Supply Chains",
    category: 'GLOBAL_ECONOMY_FINANCIAL_WARFARE',
    english: {
      text: "Financial algorithms price corporate earnings, but ninety percent of physical goods still navigate vulnerable maritime straits. When a chokepoint like the Red Sea or Malacca narrows, shipping costs surge and global inflation follows. Physical trade outranks paper finance."
    },
    romanUrdu: {
      text: "Stock markets company munafay ka hisab lagati hain, magar 90 percent saaman tang samandari raston se guzarta hai. Jab Red Sea ya Malacca mein rukawat aati hai to kiraya barhta hai aur mehangai aati hai. Zameeni tijarat hamesha paper finance se bari hoti hai."
    },
    plainUrdu: {
      text: "اسٹاک مارکیٹیں کارپوریٹ منافع کا حساب لگاتی ہیں، لیکن دنیا کا نوے فیصد سامان تنگ بحری راہداریوں سے گزرتا ہے۔ جب بحیرہ احمر یا ملاکا میں رکاوٹ آئے تو کرایے بڑھتے ہیں اور عالمی افراط زر جنم لیتا ہے۔ حقیقی تجارت کا وزن کاغذی مالیات سے زیادہ ہے۔"
    }
  },

  // Category E: AI, Technology & Cybersecurity
  {
    topic: "The AI Chip Race as the New Geopolitical Balance of Power",
    category: 'AI_TECHNOLOGY_CYBERSECURITY',
    english: {
      text: "The geopolitical balance of power is no longer measured solely in steel and nuclear warheads. Sovereign power now hinges on silicon foundry capacity and advanced AI accelerator hardware. Silicon dominance dictates the future of intelligence, economy, and military strategy."
    },
    romanUrdu: {
      text: "Taqat ka aalmi tawazun ab sirf foj aur atom bomb se nahi naapa jata. Riyasati taqat ab semiconductor foundries aur advanced AI chips par munhasir hai. Silicon par qabza hi mustaqbil ki intelligence, maeeshat aur military strategy ka faisla karta hai."
    },
    plainUrdu: {
      text: "عالمی طاقت کا توازن اب محض بارود اور ایٹمی ہتھیاروں سے نہیں تولا جاتا۔ اب خودمختاری کا دارومدار جدید مائیکرو چپس اور مصنوعی ذہانت کے سسٹمز پر ہے۔ سلیکان پر کنٹرول ہی مستقبل کی انٹیلی جنس، معیشت اور عسکری حکمت عملی کی سمت متعین کرتا ہے۔"
    }
  },
  {
    topic: "Digital Surveillance and the Architecture of Modern Power",
    category: 'AI_TECHNOLOGY_CYBERSECURITY',
    english: {
      text: "Historical dictatorships relied on physical secret police to enforce order. Modern governance leverages ubiquitous smartphone telemetry, automated facial surveillance, and programmable digital currencies. State authority has transitioned from physical force to algorithmic control."
    },
    romanUrdu: {
      text: "Puranay aamiron ko awaam dabane ke liye secret police chahiye hoti thi. Jadeed riyasat smartphone telemetry, facial recognition cameras aur programmable digital currency ka sahara leti hai. Hakumat ka zor ab physical taqat se nikal kar algorithmic control ban chuka hai."
    },
    plainUrdu: {
      text: "ماضی کی آمریتیں اقتدار قائم رکھنے کے لیے خفیہ پولیس پر انحصار کرتی تھیں۔ جدید ریاستی نظام اسمارٹ فون ٹیلی میٹری، خودکار کیمروں اور ڈیجیٹل کرنسی کا سہارا لیتا ہے۔ اقتدار کا طریقہ کار اب جسمانی طاقت سے بدل کر الگورتھمک گرفت میں ڈھل چکا ہے۔"
    }
  },

  // Category F: Civilization, History & Global Power
  {
    topic: "Strategic Corridors and the Rise and Fall of Empires",
    category: 'CIVILIZATION_HISTORY_GLOBAL_POWER',
    english: {
      text: "From the ancient Silk Road to modern maritime corridors, empires have consistently risen and collapsed along trade routes. Pipelines, undersea fiber cables, and deep-water ports are simply the modern technological expressions of timeless civilizational competition."
    },
    romanUrdu: {
      text: "Qadeem Silk Road se le kar jadeed maritime corridors tak, saltanatein hamesha tijarati raston ke gird bani aur bikhri hain. Oil pipelines, undersea internet cables aur deep-sea ports qadeem tehzeebi mukablay ki jadeed shaklein hain."
    },
    plainUrdu: {
      text: "قدیم شاہراہ ریشم سے لے کر جدید بحری راہداریوں تک، سلطنتیں ہمیشہ تجارتی راستوں پر ہی عروج پاتی اور ختم ہوتی رہی ہیں۔ پائپ لائنز، سمندری انٹرنیٹ کیبلز اور گہرے بندرگاہیں دراصل ازلی تہذیبی رقابت کے جدید روپ ہیں۔"
    }
  },
  {
    topic: "Bagram, Regional Proxies and Great Power Competition",
    category: 'CIVILIZATION_HISTORY_GLOBAL_POWER',
    english: {
      text: "Bagram was never about Afghanistan. It was always about the surrounding regional powers: China, Iran, and Pakistan. When global superpowers bargain for intelligence perches and strategic corridors, nations trapped in the middle invariably absorb the collateral cost."
    },
    romanUrdu: {
      text: "Bagram ka maamla kabhi Afghanistan ka tha hi nahi. Asal nishana hamesha China, Iran aur Pakistan thay. Jab superpowers intelligence perches aur corridors ka souda karti hain, to darmiyan mein phansay mumalik hamesha sab se bhari qeemat chukatay hain."
    },
    plainUrdu: {
      text: "بگرام کا معاملہ کبھی افغانستان کا تھا ہی نہیں۔ اصل نظر ہمیشہ چین، ایران اور پاکستان پر تھی۔ جب عالمی سپر پاورز انٹیلی جنس اڈوں اور راہداریوں کا سودا کرتی ہیں، تو جغرافیے کے درمیان پھنسے ممالک ہی سب سے بھاری قیمت چکاتے ہیں۔"
    }
  }
];

let categoryRotationIndex = 0;
let storyCounter = 0;

const MIN_CHARACTERS = 180;
const MAX_CHARACTERS = 265;
const ABSOLUTE_MAX_CHARACTERS = 280;

/* =========================================================
   TEXT FORMATTING AND VALIDATION
========================================================= */

function formatEntry(text) {
  const clean = (text || '')
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

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

function validateAIResponse(res, chosenTopic, chosenCategory = 'GEOPOLITICS_STRATEGY') {
  if (!res || typeof res !== 'object') {
    throw new Error('Invalid AI response object');
  }

  const rawText = typeof res.text === 'string' ? res.text.trim() : '';
  if (!rawText || rawText.length < 80) {
    throw new Error('AI returned empty or overly short text');
  }

  const entry = formatEntry(rawText);
  if (entry.isOverLimit || entry.charCount > ABSOLUTE_MAX_CHARACTERS) {
    throw new Error(`AI post exceeds X 280-char limit (${entry.charCount} chars)`);
  }

  return {
    topic: typeof res.topic === 'string' && res.topic.trim() ? res.topic.trim() : chosenTopic,
    category: typeof res.category === 'string' && res.category.trim() ? res.category.trim() : chosenCategory,
    english: entry
  };
}

/* =========================================================
   MASTER ANALYTICAL AI PROMPT
========================================================= */

function createEnglishPrompt(chosenTopic, usedTopics, targetCategory = null) {
  const avoidListStr =
    usedTopics.length > 0
      ? usedTopics.slice(0, 30).join('; ')
      : 'None';

  const categoryContext = targetCategory
    ? `TARGET THEMATIC FOCUS: ${targetCategory.name}\nKEY TERMS TO DRAW ON (USE MEANINGFULLY): ${targetCategory.keywords.slice(0, 8).join(', ')}`
    : `KEY DOMAINS: China/Taiwan/PLA, Military Strategy (Sun Tzu, EW, Radars), Iran/Hormuz/Oil, Financial Warfare/Sanctions, AI/Cyber Warfare, Historical Corridors`;

  return `# X-BOT — ADVANCED GEOPOLITICAL & STRATEGIC ANALYSIS CONTENT ENGINE

You are an elite geopolitical and strategic defense analyst writing intellectual, insightful, and thought-provoking analysis for X (formerly Twitter).

TOPIC: "${chosenTopic}"

${categoryContext}

============================================================
1. CORE CONTENT DIRECTION
============================================================
- Write as a seasoned geopolitical analyst explaining the deeper strategic meaning behind world events.
- Explore strategic conflicts, hidden economic connections, technological dependencies, or shifts in global power.
- Absolutely NO ordinary motivational posts, generic educational primers, or superficial news summaries.
- Deliver intellectual depth with meaningful cause-and-effect reasoning.

============================================================
2. ANALYTICAL WRITING STYLE (B1–B2 FLUENCY)
============================================================
- Analytical, not simplistic. Use natural, fluent English (B1–B2 level).
- Strategic vocabulary and geopolitical terminology are WELCOME when they add analytical value (e.g. deterrence, semiconductor foundries, maritime blockade, chokepoints, electromagnetic spectrum, sovereign reserves).
- NEVER force keywords into sentences just to sound intelligent. Every technical term must directly advance your central argument.
- Connect keywords through clear, logical explanations. Avoid disconnected sentences or lists of weapons/politicians.
- Distinguish confirmed strategic facts from allegations and interpretations. No sensationalism or fabricated breaking news.

============================================================
3. 5-PART ANALYTICAL STORYTELLING STRUCTURE
============================================================
Build your post around ONE central analytical thesis:
1. HOOK: Open with a bold geopolitical observation or unexpected strategic connection.
2. CONTEXT: Explain the relevant conflict, development, or historical background.
3. ANALYSIS: Connect military, economic, technological, or political factors.
4. IMPLICATION: Explain why the development matters beyond the immediate region.
5. FINAL THOUGHT: Finish with a memorable analytical observation that leaves the reader reflecting.
(Maintain natural logical flow rather than treating this as a rigid formula).

============================================================
4. QUALITY STYLE BENCHMARKS (STUDY THEIR REASONING & DEPTH)
============================================================
Benchmark 1 (Taiwan & Semiconductors):
"Taiwan's importance goes far beyond its geography. Its semiconductor industry connects the island to the global economy. Any military crisis in the Taiwan Strait disrupts AI development, chip supply, and global trade. Control over Taiwan carries consequences far beyond Asia."

Benchmark 2 (Iran & Oil Markets):
"A conflict involving Iran is never limited to the Middle East. The Strait of Hormuz carries a major share of global oil trade. Any disruption immediately rocks energy prices, stock markets, and foreign economies. Geography remains a decisive weapon in world politics."

Benchmark 3 (Military Strategy & Technology):
"Sun Tzu argued that understanding the enemy is essential to victory. Modern military strategy follows a similar principle. Satellite surveillance, cyber intelligence, and electronic warfare weaken an opponent before missiles launch. Information is as valuable as firepower."

============================================================
5. STRICT CONSTRAINTS & FORMAT
============================================================
- Length: Target 190 to 260 characters. ABSOLUTE MAXIMUM: 280 characters.
- Must fit within Twitter/X's 280 character limit.
- ZERO hashtags (no #tags at all).
- ZERO emojis.
- Avoid generic AI openers (e.g. "In today's world...", "It is important to remember...", "Imagine a world...").
- Do NOT duplicate or closely rephrase any of these recently published topics:
${avoidListStr}

EDITORIAL PRIORITY:
Analytical depth > Logical connections > Natural storytelling > Strategic terminology > Strong conclusion.

Return ONLY valid JSON matching this exact structure:
{
  "topic": "${chosenTopic}",
  "category": "GEOPOLITICAL_STRATEGY",
  "text": "Your complete analytical post here"
}`;
}

/* =========================================================
   GENERATE ENGLISH POST WITH CATEGORY ROTATION
========================================================= */

export async function generateEnglishPost(customTopic = '') {
  const geminiKey = process.env.GEMINI_API_KEY;
  const xaiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  let usedTopics = [];
  try {
    usedTopics = await getAllUsedTopics(200);
  } catch (error) {
    console.warn('[Database] Could not retrieve used topics:', error.message);
  }

  const normalizedUsedTopics = usedTopics.map(t => String(t).toLowerCase().trim());

  // Determine Category Rotation for Option 5 Fresh Post Diversity
  const targetCategory = CONTENT_CATEGORIES[categoryRotationIndex % CONTENT_CATEGORIES.length];
  categoryRotationIndex++;

  let chosenTopic = customTopic.trim();
  let chosenCategory = targetCategory.id;

  if (!chosenTopic) {
    // Prefer an unused curated topic from the current target category
    const categoryCurated = CURATED_STORY_TOPICS.filter(
      item => item.category === targetCategory.id && !normalizedUsedTopics.includes(item.topic.toLowerCase().trim())
    );

    // If none unused in current category, check any unused in the entire curated bank
    const allUnusedCurated = CURATED_STORY_TOPICS.filter(
      item => !normalizedUsedTopics.includes(item.topic.toLowerCase().trim())
    );

    if (categoryCurated.length > 0) {
      chosenTopic = categoryCurated[storyCounter % categoryCurated.length].topic;
      chosenCategory = categoryCurated[storyCounter % categoryCurated.length].category;
    } else if (allUnusedCurated.length > 0) {
      chosenTopic = allUnusedCurated[storyCounter % allUnusedCurated.length].topic;
      chosenCategory = allUnusedCurated[storyCounter % allUnusedCurated.length].category;
    } else {
      chosenTopic = CURATED_STORY_TOPICS[storyCounter % CURATED_STORY_TOPICS.length].topic;
      chosenCategory = CURATED_STORY_TOPICS[storyCounter % CURATED_STORY_TOPICS.length].category;
    }

    storyCounter++;
  }

  const prompt = createEnglishPrompt(chosenTopic, usedTopics, targetCategory);

  /* ---------------- 1. GOOGLE GEMINI FREE API (PRIMARY) ---------------- */
  if (geminiKey) {
    try {
      const res = await callGemini(prompt, geminiKey);
      const validated = validateAIResponse(res, chosenTopic, chosenCategory);
      const isDup = await isDuplicatePost(validated.topic, validated.english.text);

      if (!isDup) {
        await saveGeneratedPost({
          topic: validated.topic,
          category: validated.category,
          english: validated.english,
          provider: 'Google Gemini Free API'
        });

        return {
          ...validated,
          provider: 'Google Gemini Free API'
        };
      }
      console.warn('[Gemini] Duplicate post rejected, falling back to Grok...');
    } catch (error) {
      console.warn(`[Gemini API] ${error.message}. Falling back to Grok...`);
    }
  }

  /* ---------------- 2. xAI GROK API (SECONDARY FALLBACK) ---------------- */
  if (xaiKey) {
    try {
      const res = await callXai(prompt, 'grok-beta');
      const validated = validateAIResponse(res, chosenTopic, chosenCategory);
      const isDup = await isDuplicatePost(validated.topic, validated.english.text);

      if (!isDup) {
        await saveGeneratedPost({
          topic: validated.topic,
          category: validated.category,
          english: validated.english,
          provider: 'xAI Grok API'
        });

        return {
          ...validated,
          provider: 'xAI Grok API'
        };
      }
      console.warn('[Grok] Duplicate post rejected, trying next...');
    } catch (error) {
      console.warn(`[Grok API] ${error.message}. Falling back to Groq...`);
    }
  }

  /* ---------------- 3. GROQ CLOUD API (TERTIARY FALLBACK) ---------------- */
  if (groqKey) {
    try {
      const res = await callGroq(prompt, groqKey);
      const validated = validateAIResponse(res, chosenTopic, chosenCategory);
      const isDup = await isDuplicatePost(validated.topic, validated.english.text);

      if (!isDup) {
        await saveGeneratedPost({
          topic: validated.topic,
          category: validated.category,
          english: validated.english,
          provider: 'Groq Cloud API (Free)'
        });

        return {
          ...validated,
          provider: 'Groq Cloud API (Free)'
        };
      }
      console.warn('[Groq] Duplicate post rejected, using curated fallback...');
    } catch (error) {
      console.warn(`[Groq API] ${error.message}. Falling back to curated bank...`);
    }
  }

  /* ---------------- 4. CURATED ANALYTICAL ENGINE ---------------- */
  const found =
    CURATED_STORY_TOPICS.find(
      item => item.topic.toLowerCase().trim() === chosenTopic.toLowerCase().trim()
    ) ||
    CURATED_STORY_TOPICS.find(item => item.category === chosenCategory) ||
    CURATED_STORY_TOPICS[storyCounter % CURATED_STORY_TOPICS.length];

  const entry = formatEntry(found.english.text);

  await saveGeneratedPost({
    topic: found.topic,
    category: found.category,
    english: entry,
    romanUrdu: formatEntry(found.romanUrdu?.text || ''),
    plainUrdu: formatEntry(found.plainUrdu?.text || ''),
    provider: 'Curated Geopolitical Engine'
  });

  return {
    topic: found.topic,
    category: found.category,
    english: entry,
    provider: 'Curated Geopolitical Engine'
  };
}

/* =========================================================
   PAKISTANI ROMAN URDU TRANSLATION
========================================================= */

export async function generateRomanUrduFromEnglish(englishPost, topic = '') {
  const geminiKey = process.env.GEMINI_API_KEY;
  const xaiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const prompt = `Convert this English geopolitical and strategic analysis post into natural Pakistani conversational Roman Urdu.

ENGLISH POST:
"${englishPost.text}"

RULES:
- Use natural Pakistani Roman Urdu.
- Preserve the exact analytical meaning and strategic insight.
- Use dignified, familiar vocabulary (B1-B2 equivalent).
- Keep length between 180 and 265 characters (strictly under 280 X chars).
- Never use hashtags.
- Return ONLY valid JSON:
{
  "text": "Roman Urdu text here"
}`;

  if (geminiKey) {
    try {
      const res = await callGemini(prompt, geminiKey);
      if (res && res.text) {
        const entry = formatEntry(res.text);
        if (!entry.isOverLimit && entry.charCount > 20) return entry;
      }
    } catch (error) {
      console.warn('[Roman Urdu Gemini]', error.message);
    }
  }

  if (xaiKey) {
    try {
      const res = await callXai(prompt, 'grok-beta');
      if (res && res.text) {
        const entry = formatEntry(res.text);
        if (!entry.isOverLimit && entry.charCount > 20) return entry;
      }
    } catch (error) {
      console.warn('[Roman Urdu Grok]', error.message);
    }
  }

  if (groqKey) {
    try {
      const res = await callGroq(prompt, groqKey);
      if (res && res.text) {
        const entry = formatEntry(res.text);
        if (!entry.isOverLimit && entry.charCount > 20) return entry;
      }
    } catch (error) {
      console.warn('[Roman Urdu Groq]', error.message);
    }
  }

  const found =
    CURATED_STORY_TOPICS.find(
      item => item.topic === topic || item.english.text === englishPost.text
    ) || CURATED_STORY_TOPICS[0];

  return formatEntry(found.romanUrdu.text);
}

/* =========================================================
   PLAIN URDU SCRIPT TRANSLATION
========================================================= */

export async function generatePlainUrduFromEnglish(englishPost, topic = '') {
  const geminiKey = process.env.GEMINI_API_KEY;
  const xaiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const prompt = `Convert this English geopolitical and strategic analysis post into clear, dignified Pakistani Urdu script (اردو).

ENGLISH POST:
"${englishPost.text}"

RULES:
- Write natural, grammatically correct Pakistani Urdu script.
- Preserve the original strategic meaning and analytical depth.
- Keep length between 180 and 265 characters (strictly under 280 X chars).
- Never use hashtags.
- Return ONLY valid JSON:
{
  "text": "مختصر، جامع اور مدلل اردو متن یہاں تحریر کریں"
}`;

  if (geminiKey) {
    try {
      const res = await callGemini(prompt, geminiKey);
      if (res && res.text) {
        const entry = formatEntry(res.text);
        if (!entry.isOverLimit && entry.charCount > 20) return entry;
      }
    } catch (error) {
      console.warn('[Plain Urdu Gemini]', error.message);
    }
  }

  if (xaiKey) {
    try {
      const res = await callXai(prompt, 'grok-beta');
      if (res && res.text) {
        const entry = formatEntry(res.text);
        if (!entry.isOverLimit && entry.charCount > 20) return entry;
      }
    } catch (error) {
      console.warn('[Plain Urdu Grok]', error.message);
    }
  }

  if (groqKey) {
    try {
      const res = await callGroq(prompt, groqKey);
      if (res && res.text) {
        const entry = formatEntry(res.text);
        if (!entry.isOverLimit && entry.charCount > 20) return entry;
      }
    } catch (error) {
      console.warn('[Plain Urdu Groq]', error.message);
    }
  }

  const found =
    CURATED_STORY_TOPICS.find(
      item => item.topic === topic || item.english.text === englishPost.text
    ) || CURATED_STORY_TOPICS[0];

  return formatEntry(found.plainUrdu.text);
}

/* =========================================================
   MULTILINGUAL POST GENERATION (3 LANGUAGES IN 1 CALL)
========================================================= */

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

/* =========================================================
   API CALL WRAPPERS (GROQ & XAI)
========================================================= */

async function callGroq(prompt, apiKey) {
  const groq = new Groq({ apiKey });
  const model = process.env.AI_MODEL || 'llama-3.3-70b-versatile';

  const completion = await groq.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: 'You are an advanced geopolitical intelligence analyst writing analytical commentary for X (Twitter).'
      },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.6
  });

  const rawJson = completion.choices[0]?.message?.content;
  return JSON.parse(rawJson);
}

async function callXai(prompt, model = 'grok-beta') {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || model,
      messages: [
        {
          role: 'system',
          content: 'You are an advanced geopolitical intelligence analyst writing analytical commentary for X (Twitter).'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.6
    })
  });

  if (!response.ok) {
    throw new Error(`xAI error HTTP ${response.status}`);
  }

  const json = await response.json();
  const content = json.choices[0]?.message?.content || '';
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No valid JSON object found in Grok response');
  return JSON.parse(match[0]);
}

async function callGemini(prompt, apiKey) {
  // Free Google Gemini Models (Primary: gemini-3.5-flash, Fallbacks: 3.5-flash-lite, 3.1-flash-lite)
  const models = [
    process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite'
  ];
  const uniqueModels = [...new Set(models)];

  let lastError = null;
  for (const model of uniqueModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: 'You are an advanced geopolitical intelligence analyst writing analytical commentary for X (Twitter). Return ONLY valid JSON.'
            }]
          },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.6,
            responseMimeType: 'application/json'
          }
        })
      });
      clearTimeout(timer);

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const msg = errJson.error?.message || `HTTP ${response.status}`;
        lastError = new Error(`Gemini (${model}): ${msg}`);
        continue;
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) {
        lastError = new Error(`Gemini (${model}): No JSON object found in output`);
        continue;
      }

      return JSON.parse(match[0]);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini free tier models failed');
}
