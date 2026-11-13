
/**
 * Geopolitical & Technology Strategy AI Service for X_BOT
 *
 * Features:
 * - China, Taiwan, PLA and semiconductor strategy
 * - Military strategy and electronic warfare
 * - Global trade routes and energy security
 * - Digital surveillance and cyber warfare
 * - Iran, oil markets, crypto and nuclear deterrence
 *
 * Standards:
 * - Target: 180-260 characters
 * - Maximum: 280 X characters
 * - Zero hashtags
 * - English, Pakistani Roman Urdu and Urdu script
 * - MongoDB duplicate checking
 * - Grok -> Groq -> Curated fallback
 */

import Groq from 'groq-sdk';

import { calculateXCharacterCount } from '../utils/validation.js';

import {
  isDuplicatePost,
  saveGeneratedPost,
  getAllUsedTopics
} from '../db/postModel.js';


/* =========================================================
   CURATED TOPIC BANK
========================================================= */

export const CURATED_STORY_TOPICS = [
  {
    topic: "Bagram, Regional Proxies and the China-Pakistan Dilemma",
    category: 'GEOPOLITICS_SOUTH_ASIA',

    english: {
      text: "Bagram was never about Afghanistan. It was always about China, Iran, and Pakistan. If US-Taliban are talking about spying on Beijing and building a proxy against Tehran, Kabul becomes a marketplace. And Pakistan pays the price for being in the middle."
    },

    romanUrdu: {
      text: "Bagram ka maamla kabhi Afghanistan ka tha hi nahi. Asal nishana hamesha China, Iran aur Pakistan thay. Agar US aur Taliban Beijing par nazar rakhnay ke souday karein, to Kabul bazaar ban jata hai, aur qeemat darmiyan mein phansa Pakistan ada karta hai."
    },

    plainUrdu: {
      text: "بگرام کا معاملہ کبھی افغانستان کا تھا ہی نہیں۔ اصل نظر ہمیشہ چین، ایران اور پاکستان پر تھی۔ اگر امریکہ اور طالبان بیجنگ پر نظر رکھنے کے معاہدے کریں تو کابل منڈی بن جاتا ہے، اور خمیازہ درمیان میں پھنسا پاکستان بھگتے گا۔"
    }
  },

  {
    topic: "The Degree Trap and the Illusion of Real Assets",
    category: 'SOCIETAL_ECONOMICS',

    english: {
      text: "Our ancestors with no degrees and limited means bought land — real assets. Today, we sell that very land to buy a piece of paper called a degree. Why fund research labs when a ring light is cheaper? A trap no generation has ever faced before."
    },

    romanUrdu: {
      text: "Hamaray barron ne baghair degree ke zameenein khareedein — asal daulat. Aaj hum usi zameen ko bech kar degree ka kaghaz khareed rahay hain. Lab par kon kharch kare jab ring light sasti hai? Aisa jaal jo kisi nasl ne nahi dekha."
    },

    plainUrdu: {
      text: "ہمارے بزرگوں نے بغیر ڈگریوں کے زمینیں خریدیں جو حقیقی اثاثے تھیں۔ آج ہم اسی زمین کو بیچ کر ڈگری کے نام پر کاغذ کا ٹکڑا خرید رہے ہیں۔ لیب پر کون خرچ کرے جب کیمرے کی رنگ لائٹ زیادہ سستی ہے؟ ایسا جال جو پہلے کبھی نہیں تھا۔"
    }
  },

  {
    topic: "PLA Encirclement and Taiwan's Semiconductor Shield",
    category: 'CHINA_TAIWAN_SEMICONDUCTORS',

    english: {
      text: "China doesn't need to invade Taiwan with soldiers. A simple naval blockade around the island stops the world's computer chip supply immediately. When the chips stop, global technology freezes. The real weapon isn't guns; it's tiny computer chips."
    },

    romanUrdu: {
      text: "China ko Taiwan par hamla karnay ki zaroorat nahi. Island ke ird gird behri naakabandi poori duniya ki chip supply foran rok deti hai. Jab chips rukti hain, global technology jam jati hai. Asal hathiyar bandook nahi, choti computer chips hain."
    },

    plainUrdu: {
      text: "چین کو تائیوان پر فوج کشی کی ضرورت نہیں۔ جزیرے کے گرد محض بحری ناکہ بندی دنیا بھر کی کمپیوٹر چپس کی فراہمی روک سکتی ہے۔ چپس رکتے ہی عالمی ٹیکنالوجی مفلوج ہو جائے گی۔ اصل طاقت بندوق نہیں، چھوٹی مائیکرو چپس ہیں۔"
    }
  },

  {
    topic: "Sun Tzu, PLA Radars and the Art of Winning Without Fighting",
    category: 'MILITARY_STRATEGY_SUNTZU',

    english: {
      text: "Sun Tzu taught that the highest victory is winning without fighting a battle. China's new radars and electronic jammers over Taiwan are not planning an invasion; they are making expensive warships completely useless without firing a single shot."
    },

    romanUrdu: {
      text: "Sun Tzu ka usool tha ke behtareen jeet baghair larray dushman ko jhukana hai. Taiwan ke ird gird China ke naye radars aur jammers kisi hamlay ki tayari nahi; balkay mehangay behri jahazon ko aik goli chalaye baghair be-asar karna hai."
    },

    plainUrdu: {
      text: "سن زو کا اصول تھا کہ سب سے بڑی فتح بغیر لڑے دشمن کو زیر کرنا ہے۔ تائیوان کے گرد چین کے نئے ریڈارز اور جیمرز حملے کی تیاری نہیں، بلکہ بھاری بحری جنگی جہازوں کو ایک گولی چلائے بغیر ناکارہ بنانا ہے۔"
    }
  },

  {
    topic: "Silicon Valley's Fatal Dependence on Asian Fabs",
    category: 'TECH_SILICON_VALLEY_CHIPS',

    english: {
      text: "Silicon Valley creates the world's software, but builds almost none of its own computer chips. If ships stop moving through the Taiwan Strait, the entire global artificial intelligence boom stops in a single day. Brilliant code cannot run without factory metal."
    },

    romanUrdu: {
      text: "Silicon Valley duniya ka software banati hai, magar computer chips khud nahi banati. Agar Taiwan Strait mein jahaz chalna band ho jayein, to poori duniya ka AI inqilab aik din mein ruk jayega. Behtareen code bhi factory ki chips ke baghair bekar hai."
    },

    plainUrdu: {
      text: "سلیکان ویلی دنیا کا سافٹ ویئر بناتی ہے، مگر کمپیوٹر چپس خود نہیں بنا سکتی۔ اگر آبنائے تائیوان سے بحری جہازوں کی آمدورفت رک جائے تو مصنوعی ذہانت کا عالمی عروج ایک دن میں تھم جائے گا۔ شاندار کوڈ بھی فیکٹری کی چپس کے بغیر نہیں چل سکتا۔"
    }
  },

  {
    topic: "The Malacca Strait Chokepoint and Trade Corridors",
    category: 'TRADE_CORRIDORS_GEOPOLITICS',

    english: {
      text: "Eighty percent of China's imported oil passes through the narrow Malacca Strait. Beijing's Belt and Road ports and radar networks aren't just commercial trade corridors; they are survival valves for when maritime chokepoints close."
    },

    romanUrdu: {
      text: "China ka 80 percent tail Malacca ki tang patti se guzarta hai. China ke banaye huay trade corridors aur radar stations sirf tijarat ke liye nahi, balkay aisi naakabandi se bachnay ke raste hain jab samandar band ho jayein."
    },

    plainUrdu: {
      text: "چین کا اسی فیصد تیل آبنائے ملاکا کی تنگ پٹی سے گزرتا ہے۔ بیجنگ کے تجارتی کوریڈورز اور ریڈار نیٹ ورکس محض معیشت کے لیے نہیں، بلکہ اس وقت کی تیاری ہیں جب عالمی سمندری راستے بند کر دیے جائیں گے۔"
    }
  },

  {
    topic: "The Digital Dictatorship and Silent Social Control",
    category: 'SURVEILLANCE_DIGITAL_DICTATORSHIP',

    english: {
      text: "Past dictators needed secret police and physical wiretaps to control people. The modern digital state only needs smartphone tracking, street cameras, and digital money. Control is no longer loud. It is completely silent."
    },

    romanUrdu: {
      text: "Pichli sadi ke aamir ko secret police aur foj chahiye hoti thi. Aaj ki digital riyasat ko sirf mobile tracking, street cameras aur digital bank accounts chahiye. Qabza ab shor nahi machata; ye bilkul khamosh hai."
    },

    plainUrdu: {
      text: "ماضی کے آمروں کو عوام کو قابو میں رکھنے کے لیے خفیہ پولیس درکار ہوتی تھی۔ آج کی جدید ریاست کو صرف موبائل ٹریکنگ، سڑکوں کے کیمرے اور ڈیجیٹل پیسہ درکار ہے۔ جبر اب شور نہیں مچاتا، یہ بالکل خاموش ہے۔"
    }
  },

  {
    topic: "Iran, the Strait of Hormuz and the Global Oil Shock",
    category: 'ENERGY_IRAN_OIL_MARKETS',

    english: {
      text: "A single incident near the Strait of Hormuz can send world oil prices soaring in hours. When oil tankers stop moving, banks panic, prices jump, and developing nations run out of fuel. One narrow water passage holds the global economy hostage."
    },

    romanUrdu: {
      text: "Strait of Hormuz ke qareeb aik waqia chand ghanton mein aalmi tail ki qeematein asman par pohncha sakta hai. Jab oil tankers rukte hain, banks ghabra jatay hain aur ghareeb mulkon mein petrol khatam ho jata hai. Aik tang samandari rasta poori aalmi maeeshat ko bandh kar baitha hai."
    },

    plainUrdu: {
      text: "آبنائے ہرمز کے قریب ایک چھوٹا واقعہ چند گھنٹوں میں عالمی تیل کی قیمتیں آسمان پر پہنچا سکتا ہے۔ جب آئل ٹینکرز رکتے ہیں تو بینک گھبرا جاتے ہیں اور غریب ممالک ایندھن اور اشیاء کے بحران میں مبتلا ہو جاتے ہیں۔ ایک تنگ بحری راستہ پوری عالمی معیشت کو یرغمال بنائے ہوئے ہے۔"
    }
  },

  {
    topic: "Cyber Warfare and the Invisible Battlefield",
    category: 'CYBER_ATTACKS_CRITICAL_INFRA',

    english: {
      text: "The next major conflict will not start with loud sirens or missiles. It begins with silent computer code turning off city electricity, blinding defense screens, and stopping bank payments in seconds. The most dangerous weapon is now invisible."
    },

    romanUrdu: {
      text: "Agli barri jung loud sirens ya missiles se shuru nahi hogi. Ye khamosh computer code se shuru hogi jo shehron ki bijli band karega, defense screens ko andha karega, aur bank payments rokay ga. Sab se khatarnak hathiyar ab nazar nahi aata."
    },

    plainUrdu: {
      text: "اگلی بڑی جنگ سائرن یا میزائلوں سے شروع نہیں ہوگی۔ یہ ایک خاموش کمپیوٹر کوڈ سے شروع ہوگی جو شہروں کی بجلی بند کر دے گا، دفاعی اسکرینوں کو اندھا کرے گا اور لمحوں میں بینک ادائیگیاں روک دے گا۔ سب سے خطرناک ہتھیار اب نظر نہیں آتا۔"
    }
  },

  {
    topic: "Nuclear Deterrence vs Microchip Defense",
    category: 'GEOPOLITICS_NUCLEAR_TECH',

    english: {
      text: "Nuclear weapons stop big countries from invading each other. But computer chips stop countries from cutting off global trade. When national survival means keeping the global economy running, tiny computer chips become the strongest defense."
    },

    romanUrdu: {
      text: "Nuclear hathiyar mulkon ko aik doosray par hamla karnay se roktay hain. Magar computer chips mulkon ko tijarat band karnay se rokti hain. Jab baqa ka matlab aalmi maeeshat chalana ban jaye, to choti chips sab se barri dhaal ban jati hain."
    },

    plainUrdu: {
      text: "ایٹمی ہتھیار ممالک کو ایک دوسرے پر چڑھائی سے روکتے ہیں۔ لیکن کمپیوٹر چپس ممالک کو عالمی تجارت منقطع کرنے سے روکتی ہیں۔ جب قومی بقا کا مطلب عالمی معیشت کو رواں رکھنا ہو، تو چھوٹی مائیکرو چپس ہی سب سے مضبوط دفاع بن جاتی ہیں۔"
    }
  },

  {
    topic: "The Stock Exchange Illusion in an Era of Kinetic Conflict",
    category: 'FINANCE_MARKETS_CONFLICT',

    english: {
      text: "Stock markets trade near record highs while the Red Sea, the Persian Gulf, and the Taiwan Strait are wired with anti-ship missiles. Financial algorithms price corporate quarterly profits, but they cannot price global supply chain death."
    },

    romanUrdu: {
      text: "Stock market records bana rahi hai jabkay Red Sea, Gulf, aur Taiwan mein missile tayar kharay hain. Wall Street ke algorithms company ke munafay ka hisaab to lagatay hain, magar global supply chains band honay ka andaza nahi."
    },

    plainUrdu: {
      text: "اسٹاک مارکیٹیں ریکارڈ سطح پر ہیں جبکہ بحیرہ احمر، خلیج فارس اور تائیوان میں اینٹی شپ میزائل نصب ہیں۔ مالیاتی الگورتھم کمپنیوں کے سہ ماہی منافع کا حساب تو لگاتے ہیں، مگر وہ عالمی سپلائی چین کے خاتمے کی قیمت بھول چکے ہیں۔"
    }
  },

  {
    topic: "Crypto, Capital Flight and Sanctions Evasion",
    category: 'CRYPTO_GEOPOLITICS',

    english: {
      text: "When superpowers weaponize the dollar and freeze sovereign central bank reserves, Bitcoin and private crypto rails become state survival tools. Decentralized ledgers are no longer speculative toys; they are the financial underground of geopolitics."
    },

    romanUrdu: {
      text: "Jab barri taqatein dollar ko hathiyar banati hain aur bank reserves freeze karti hain, to Bitcoin mulkon ke liye sahara ban jata hai. Decentralized crypto ab sirf shouq nahi, balkay aalmi siyasat ka underground banking nizam hai."
    },

    plainUrdu: {
      text: "جب بڑی طاقتیں ڈالر کو بطور ہتھیار استعمال کر کے غیر ملکی ذخائر منجمد کرتی ہیں، تو بٹ کوائن اور کرپٹو نیٹ ورکس ریاستوں کے لیے بقا کا راستہ بن جاتے ہیں۔ بلاک چین اب محض شوق نہیں بلکہ عالمی سیاست کی خفیہ مالیاتی پناہ گاہ ہے۔"
    }
  },

  {
    topic: "Taiwan Annexation and the Collapse of Western Deterrence",
    category: 'CHINA_TAIWAN_PLA',

    english: {
      text: "A Chinese annexation of Taiwan wouldn't just redraw a Pacific map; it would permanently break the post-1945 American security umbrella. If Washington cannot protect the island that powers the world's computers, no treaty in Asia holds value."
    },

    romanUrdu: {
      text: "China ka Taiwan par qabza sirf naqsha nahi badlega, balkay America ki 80 saal purani security umbrella ko tor day ga. Agar America us jazeeray ko nahi bacha sakta jo poori duniya ke computers chalata hai, to Asia mein koi muahida bacha nahi."
    },

    plainUrdu: {
      text: "چین کا تائیوان پر قبضہ محض نقشہ تبدیل نہیں کرے گا، بلکہ امریکی دفاعی چھتری کا خاتمہ کر دے گا۔ اگر واشنگٹن اس جزیرے کی حفاظت نہ کر سکا جو دنیا بھر کے کمپیوٹرز چلاتا ہے، تو ایشیا میں اس کے کسی دفاعی معاہدے کی کوئی وقعت نہیں رہے گی۔"
    }
  },

  {
    topic: "PLA Electronic Warfare over the First Island Chain",
    category: 'RADARS_ELECTRONIC_WARFARE',

    english: {
      text: "The real battle for the Taiwan Strait is already being fought silently in the electromagnetic spectrum. PLA phased-array radars and airborne jammers test US carrier battle groups daily, mapping frequencies before the first missile is ever fueled."
    },

    romanUrdu: {
      text: "Taiwan Strait ki asal larrai abhi se electromagnetic spectrum mein khamoshi se lari ja rahi hai. PLA ke radars aur jammers rozana US naval ships ke frequencies scan kar rahay hain, is se pehle ke pehla missile launch ho."
    },

    plainUrdu: {
      text: "آبنائے تائیوان کی اصل جنگ الیکٹرو میگنیٹک میدان میں خاموشی سے جاری ہے۔ چینی فوج کے فیزڈ ارے ریڈارز اور جیمرز روزانہ امریکی بحری بیڑوں کی فریکوئنسیز اسکین کر رہے ہیں، قبل اس کے کہ پہلا باقاعدہ میزائل داغا جائے۔"
    }
  }
];


/* =========================================================
   CONFIGURATION
========================================================= */

let storyCounter = 0;

const MIN_CHARACTERS = 180;
const MAX_CHARACTERS = 260;

const DEFAULT_CATEGORY = 'GEOPOLITICS_TECH_DEFENSE';


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
      count.charCount >= 80 &&
      count.charCount <= 280 &&
      !count.isOverLimit
  };
}


function validateAIResponse(res, chosenTopic) {
  if (!res || typeof res !== 'object') {
    throw new Error('Invalid AI response');
  }

  if (typeof res.text !== 'string' || !res.text.trim()) {
    throw new Error('AI response contains no post text');
  }

  const entry = formatEntry(res.text);

  if (entry.isOverLimit || entry.charCount < 40) {
    throw new Error(
      `Invalid character count: ${entry.charCount} (over limit: ${entry.isOverLimit})`
    );
  }

  return {
    topic:
      typeof res.topic === 'string' && res.topic.trim()
        ? res.topic.trim()
        : chosenTopic,

    category:
      typeof res.category === 'string' && res.category.trim()
        ? res.category.trim()
        : DEFAULT_CATEGORY,

    english: entry
  };
}


/* =========================================================
   AI PROMPT
========================================================= */

function createEnglishPrompt(chosenTopic, usedTopics) {
  const avoidListStr =
    usedTopics.length > 0
      ? usedTopics.slice(0, 30).join('; ')
      : 'None';

  return `You are an expert social commentator and strategic writer for X (Twitter) who writes in simple, powerful, and natural human English.

TOPIC: "${chosenTopic}"

MISSION:
Write a single, compelling X post that prioritizes NATURAL STORYTELLING, SIMPLE ENGLISH, READABILITY, AND LOGICAL FLOW over complex vocabulary and technical terminology.

============================================================
1. WRITING STYLE
============================================================
- Use A2-level English wherever possible (simple, everyday words).
- Write in simple, natural, human-like English.
- Make every sentence connect naturally to the next.
- Present ONE central idea and develop it clearly.
- The reader must understand the entire message on the FIRST read.
- Use strong opinions, interesting comparisons, and meaningful observations.
- Make the post thought-provoking without making it unnecessarily complicated.
- Prefer short, powerful sentences over long, technical sentences.

============================================================
2. AVOID THESE PROBLEMS (CRITICAL)
============================================================
DO NOT:
- Force technical terms, military terminology, or political keywords into sentences.
- Write like an academic research paper or a news headline.
- Use complicated vocabulary just to make a post sound intelligent.
- Combine too many unrelated ideas in one post.
- Use unexplained abbreviations, figures, or technical concepts.
- Sacrifice readability to cram in more information.
- Specifically avoid forced or pretentious phrases such as:
  * "3-nanometer silicon"
  * "mathematically obsolete"
  * "semiconductor shield"
  * "algorithmic encirclement"
  * "unprecedented paradigm"
  * "multilateral hegemony"

Use technical words ONLY when they are essential to the central message, and always explain them in plain words.

============================================================
3. STYLE REFERENCES (Study their cadence, simplicity & contrast)
============================================================
Reference 1:
"Bagram was never about Afghanistan. It was always about China, Iran, and Pakistan. If US-Taliban are talking about spying on Beijing and building a proxy against Tehran, Kabul becomes a marketplace. And Pakistan pays the price for being in the middle."

Reference 2:
"Our ancestors with no degrees and limited means bought land — real assets. Today, we sell that very land to buy a piece of paper called a degree. Why fund research labs when a ring light is cheaper? A trap no generation has ever faced before."

Notice why these work:
- Easy-to-understand English.
- Natural sentence flow (one thought leads directly into the next).
- Clear comparisons (reality vs illusion).
- Simple words carrying meaningful ideas.
- A punchy final thought that stays with the reader.
(Use them as STYLE REFERENCES, not as topics to repeat).

============================================================
4. NATURAL STORY STRUCTURE
============================================================
Follow this structure naturally:
1. Opening: Start with an interesting observation, bold statement, or unexpected comparison.
2. Development: Explain the situation using simple and connected sentences.
3. Insight: Show the deeper meaning, consequence, or contradiction.
4. Ending: Finish with a memorable thought that makes the reader reflect.

============================================================
5. TOPIC FLEXIBILITY
============================================================
This bot covers geopolitics, international relations, technology, artificial intelligence, cybersecurity, education, economics, society, and other important topics.
- Maintain the same simple and natural writing style regardless of the topic.
- A post about military technology or microchips must be just as easy to read as a post about education or society.
- Do not confuse expertise with complicated language.

============================================================
6. INTERNAL QUALITY CHECK (Self-Review Before Output)
============================================================
Before returning, internally evaluate:
✓ Can an ordinary English learner understand it?
✓ Does it sound like a human expressing an interesting idea?
✓ Does every sentence connect logically?
✓ Is there one clear central message?
✓ Are technical words genuinely necessary?
✓ Does the ending leave an impression?
✓ Would a reader understand it without researching the topic?
If the answer to any important question is NO, rewrite the post simply and cleanly.

============================================================
7. LENGTH & FORMAT RULES
============================================================
- Length: Target 180 to 260 characters (must comfortably fit under 280 X characters).
- Write one complete, standalone post.
- No hashtags.
- No emojis.
- No generic AI intro phrases (never start with "In today's world...", "It is important to remember...", "Imagine a world...").
- Do NOT repeat or closely match any of these recently published topics:
${avoidListStr}

FINAL PRIORITY:
Readability > Natural Flow > Clear Meaning > Strong Insight > Vocabulary Complexity.

The goal is not to make every post sound intellectual. The goal is to make every post communicate an intelligent idea in simple, powerful English.

Return ONLY valid JSON in this exact structure:
{
  "topic": "${chosenTopic}",
  "category": "GEOPOLITICS_TECH_SOCIETY",
  "text": "Your final simple, powerful X post here"
}`;
}


/* =========================================================
   GENERATE ENGLISH POST
========================================================= */

export async function generateEnglishPost(customTopic = '') {
  const xaiKey =
    process.env.GROK_API_KEY ||
    process.env.XAI_API_KEY;

  const groqKey = process.env.GROQ_API_KEY;

  let usedTopics = [];

  try {
    usedTopics = await getAllUsedTopics(200);
  } catch (error) {
    console.warn('[Database] Could not retrieve used topics:', error.message);
  }

  const normalizedUsedTopics = usedTopics.map(
    topic => String(topic).toLowerCase().trim()
  );

  const unusedCurated = CURATED_STORY_TOPICS.filter(
    item =>
      !normalizedUsedTopics.includes(
        item.topic.toLowerCase().trim()
      )
  );

  let chosenTopic = customTopic.trim();

  if (!chosenTopic) {
    if (unusedCurated.length > 0) {
      chosenTopic =
        unusedCurated[storyCounter % unusedCurated.length].topic;
    } else {
      chosenTopic =
        CURATED_STORY_TOPICS[
          storyCounter % CURATED_STORY_TOPICS.length
        ].topic;
    }

    storyCounter++;
  }

  const prompt = createEnglishPrompt(
    chosenTopic,
    usedTopics
  );


  /* ---------------- GROK ---------------- */

  if (xaiKey) {
    try {
      const res = await callXai(prompt, 'grok-beta');

      const validated = validateAIResponse(
        res,
        chosenTopic
      );

      const isDup = await isDuplicatePost(
        validated.topic,
        validated.english.text
      );

      if (!isDup) {
        await saveGeneratedPost({
          topic: validated.topic,
          category: validated.category,
          english: validated.english,
          provider: 'xAI Grok API (Paid)'
        });

        return {
          ...validated,
          provider: 'xAI Grok API (Paid)'
        };
      }

      console.warn('[Grok] Duplicate post rejected.');

    } catch (error) {
      console.warn(
        `[Grok API] ${error.message}. Falling back to Groq...`
      );
    }
  }


  /* ---------------- GROQ ---------------- */

  if (groqKey) {
    try {
      const res = await callGroq(prompt, groqKey);

      const validated = validateAIResponse(
        res,
        chosenTopic
      );

      const isDup = await isDuplicatePost(
        validated.topic,
        validated.english.text
      );

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

      console.warn('[Groq] Duplicate post rejected.');

    } catch (error) {
      console.warn(
        `[Groq API] ${error.message}. Falling back to curated bank...`
      );
    }
  }


  /* ---------------- CURATED FALLBACK ---------------- */

  const matched =
    unusedCurated.find(
      item =>
        item.topic.toLowerCase() === chosenTopic.toLowerCase()
    ) ||
    (unusedCurated.length > 0
      ? unusedCurated[storyCounter % unusedCurated.length]
      : null) ||
    CURATED_STORY_TOPICS.find(
      item =>
        item.topic.toLowerCase() === chosenTopic.toLowerCase()
    ) ||
    CURATED_STORY_TOPICS[storyCounter % CURATED_STORY_TOPICS.length] ||
    CURATED_STORY_TOPICS[0];

  const entry = formatEntry(matched.english.text);

  await saveGeneratedPost({
    topic: matched.topic,
    category: matched.category,
    english: entry,
    romanUrdu: formatEntry(matched.romanUrdu.text),
    plainUrdu: formatEntry(matched.plainUrdu.text),
    provider: 'Curated Defense Strategy Engine'
  });

  return {
    topic: matched.topic,
    category: matched.category,
    english: entry,
    provider: 'Curated Defense Strategy Engine'
  };
}


/* =========================================================
   ROMAN URDU GENERATION
========================================================= */

export async function generateRomanUrduFromEnglish(
  englishPost,
  topic = ''
) {
  const xaiKey =
    process.env.GROK_API_KEY ||
    process.env.XAI_API_KEY;

  const groqKey = process.env.GROQ_API_KEY;

  const prompt = `Convert this English geopolitical and defense post into natural Pakistani conversational Roman Urdu.

ENGLISH POST:
"${englishPost.text}"

RULES:
- Use natural Pakistani Roman Urdu.
- Preserve the exact meaning and strategic insight.
- Use simple, familiar words.
- Keep it between 180 and 260 characters.
- Never use hashtags.
- Do not add new facts.
- Return ONLY valid JSON:

{
  "text": "Roman Urdu text here"
}`;


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
      item =>
        item.topic === topic ||
        item.english.text === englishPost.text
    ) ||
    CURATED_STORY_TOPICS[0];

  return formatEntry(found.romanUrdu.text);
}


/* =========================================================
   URDU SCRIPT GENERATION
========================================================= */

export async function generatePlainUrduFromEnglish(
  englishPost,
  topic = ''
) {
  const xaiKey =
    process.env.GROK_API_KEY ||
    process.env.XAI_API_KEY;

  const groqKey = process.env.GROQ_API_KEY;

  const prompt = `Convert this English geopolitical and defense post into clear, dignified Pakistani Urdu script (اردو).

ENGLISH POST:
"${englishPost.text}"

RULES:
- Write natural and grammatically correct Urdu.
- Preserve the original meaning and strategic insight.
- Use clear Pakistani Urdu.
- Keep it between 180 and 260 characters.
- Never use hashtags.
- Do not add new facts.
- Return ONLY valid JSON:

{
  "text": "مختصر اور جامع اردو متن یہاں تحریر کریں"
}`;


  if (xaiKey) {
    try {
      const res = await callXai(prompt, 'grok-beta');

      if (res && res.text) {
        const entry = formatEntry(res.text);
        if (!entry.isOverLimit && entry.charCount > 20) return entry;
      }

    } catch (error) {
      console.warn('[Urdu Grok]', error.message);
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
      console.warn('[Urdu Groq]', error.message);
    }
  }


  const found =
    CURATED_STORY_TOPICS.find(
      item =>
        item.topic === topic ||
        item.english.text === englishPost.text
    ) ||
    CURATED_STORY_TOPICS[0];

  return formatEntry(found.plainUrdu.text);
}


/* =========================================================
   GENERATE MULTILINGUAL POST
========================================================= */

export async function generateMultilingualPost(customTopic = '') {
  const eng = await generateEnglishPost(customTopic);

  const roman = await generateRomanUrduFromEnglish(
    eng.english,
    eng.topic
  );

  const plain = await generatePlainUrduFromEnglish(
    eng.english,
    eng.topic
  );

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
   BACKWARD COMPATIBILITY
========================================================= */

export const CURATED_A2_TOPICS = CURATED_STORY_TOPICS;


/* =========================================================
   GROQ API
========================================================= */

async function callGroq(prompt, apiKey) {
  const groq = new Groq({ apiKey });

  const model =
    process.env.AI_MODEL || 'llama-3.3-70b-versatile';

  const completion = await groq.chat.completions.create({
    model,

    messages: [
      {
        role: 'system',
        content: `You are a professional geopolitical and technology intelligence analyst.

Write concise, evidence-conscious and high-quality content for X.

Use simple A2-level English when English is requested.
Use natural language for Urdu translations.
Avoid clickbait, exaggerated claims and hashtags.
Never invent facts or statistics.
Return only valid JSON matching the requested structure.`
      },
      {
        role: 'user',
        content: prompt
      }
    ],

    response_format: {
      type: 'json_object'
    },

    temperature: 0.7
  });

  const rawJson =
    completion.choices[0]?.message?.content;

  if (!rawJson) {
    throw new Error('Groq returned an empty response.');
  }

  return JSON.parse(rawJson);
}


/* =========================================================
   xAI / GROK API
========================================================= */

async function callXai(prompt, model = 'grok-beta') {
  const apiKey =
    process.env.GROK_API_KEY ||
    process.env.XAI_API_KEY;

  if (!apiKey) {
    throw new Error('xAI API key is missing.');
  }

  const response = await fetch(
    'https://api.x.ai/v1/chat/completions',
    {
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
            content: `You are a professional geopolitical and technology intelligence analyst.

Write concise, evidence-conscious and high-quality content for X.

Use simple A2-level English when English is requested.
Use natural language for Urdu translations.
Avoid clickbait, exaggerated claims and hashtags.
Never invent facts or statistics.
Return only valid JSON matching the requested structure.`
          },

          {
            role: 'user',
            content: prompt
          }
        ],

        response_format: {
          type: 'json_object'
        },

        temperature: 0.7
      })
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `xAI API error ${response.status}: ${errorBody}`
    );
  }

  const json = await response.json();

  const content =
    json.choices?.[0]?.message?.content || '';

  if (!content) {
    throw new Error('xAI returned an empty response.');
  }

  try {
    return JSON.parse(content);

  } catch (error) {
    const match = content.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error('Invalid JSON returned by xAI.');
    }

    return JSON.parse(match[0]);
  }
}
