
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
    topic: "PLA Encirclement and Taiwan's Semiconductor Shield",
    category: 'CHINA_TAIWAN_SEMICONDUCTORS',

    english: {
      text: "China's PLA doesn't need to bomb Taiwan to take it; a 48-hour naval blockade does the job. When TSMC's chip foundries stop, Silicon Valley goes dark and Wall Street bleeds. The real frontline isn't beaches, it's 3-nanometer silicon."
    },

    romanUrdu: {
      text: "China ki PLA ko Taiwan par bomb phenknay ki zaroorat nahi, 48 ghantay ki samandari naakabandi kaafi hai. Jab TSMC ke chips rukenge, Silicon Valley andheri ho jayegi. Asal larrai zameen par nahi, 3-nanometer chip par hai."
    },

    plainUrdu: {
      text: "چین کی فوج کو تائیوان پر بمباری کی ضرورت نہیں، محض اڑتالیس گھنٹے کی ناکہ بندی کافی ہے۔ جونہی جدید مائیکرو چپس کی سپلائی رکے گی، سلیکان ویلی اور وال اسٹریٹ بیٹھ جائیں گی۔ اصل جنگ زمین کی نہیں، نینومیٹر چپ کی ہے۔"
    }
  },

  {
    topic: "Sun Tzu, PLA Radars and the Art of Winning Without Fighting",
    category: 'MILITARY_STRATEGY_SUNTZU',

    english: {
      text: "Sun Tzu taught that supreme excellence is subduing the enemy without fighting. China's modern PLA radars and electronic jamming over Taiwan aren't preparing for an invasion; they are making US aircraft carriers mathematically obsolete."
    },

    romanUrdu: {
      text: "Sun Tzu ka usool tha ke behtareen jeet baghair larre dushman ko jhukana hai. Taiwan ke ird gird China ke PLA radars aur electronic jamming hamlay ki tayari nahi, balkay US behri jahazon ko be-asar sabit karna hai."
    },

    plainUrdu: {
      text: "سن زو کا فلسفہ تھا کہ اصل فتح بغیر لڑے دشمن کو زیر کرنا ہے۔ تائیوان کے گرد چینی فوج کے ریڈارز اور الیکٹرانک نظام کسی حملے کی تیاری نہیں، بلکہ امریکی بحری بیڑوں کو بغیر گولی چلائے ناکارہ بنانے کی خفیہ چال ہیں۔"
    }
  },

  {
    topic: "Silicon Valley's Fatal Dependence on Asian Fabs",
    category: 'TECH_SILICON_VALLEY_CHIPS',

    english: {
      text: "Silicon Valley designs the future, but manufactures zero percent of the world's most advanced AI chips. If a single radar glitch triggers a crisis in the Taiwan Strait, the entire global AI boom evaporates in twenty-four hours."
    },

    romanUrdu: {
      text: "Silicon Valley mustaqbil ka software to banati hai, magar advanced AI chips khud nahi banati. Agar Taiwan Strait mein radar ki choti si ghalti se larrai chhid gayi, to poori duniya ka AI inqilab aik din mein ruk jayega."
    },

    plainUrdu: {
      text: "سلیکان ویلی مستقبل کے سافٹ ویئر ڈیزائن تو کرتی ہے، مگر جدید ترین چپس خود نہیں بنا سکتی۔ اگر آبنائے تائیوان میں ریڈار کی ذرا سی غلطی سے جھڑپ ہوئی تو دنیا بھر کا مصنوعی ذہانت کا انقلاب چوبیس گھنٹوں میں ٹھپ ہو جائے گا۔"
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
    topic: "The Digital Dictatorship and the Algorithmic Panopticon",
    category: 'SURVEILLANCE_DIGITAL_DICTATORSHIP',

    english: {
      text: "The 20th-century dictator needed secret police and physical wiretaps. The modern digital state needs only smartphone GPS, facial recognition radars, and programmable digital currency. Modern tyranny is no longer loud; it is algorithmic."
    },

    romanUrdu: {
      text: "Pichli sadi ke aamir ko foj aur secret police chahiye hoti thi. Aaj ki digital hakumat ko sirf mobile GPS, facial recognition radars, aur digital currency chahiye. Zulm ab shor nahi machata, wo algorithms ke peechay khamosh hai."
    },

    plainUrdu: {
      text: "پرانے دور کے آمر کو خفیہ پولیس درکار ہوتی تھی۔ اکیسویں صدی کی ڈیجیٹل آمریت کو صرف اسمارٹ فون جی پی ایس، چہرہ پہچاننے والے ریڈارز اور ڈیجیٹل کرنسی درکار ہے۔ جبر اب شور نہیں مچاتا، یہ الگورتھم کے پیچھے چھپا رہتا ہے۔"
    }
  },

  {
    topic: "Iran, the Strait of Hormuz and the $150 Oil Shock",
    category: 'ENERGY_IRAN_OIL_MARKETS',

    english: {
      text: "A single drone strike near the Strait of Hormuz can send crude oil over $150 a barrel in four hours. When tankers halt, Wall Street panics, central banks hike interest rates, and developing economies run out of food and fuel."
    },

    romanUrdu: {
      text: "Strait of Hormuz ke qareeb aik drone hamla 4 ghantay mein tail ki qeemat 150 dollar tak pohncha sakta hai. Jab oil tankers rukte hain, Wall Street par kohraam machta hai aur ghareeb mulkon mein petrol aur khana khatam ho jata hai."
    },

    plainUrdu: {
      text: "آبنائے ہرمز کے قریب ایک ڈرون حملہ چار گھنٹوں میں تیل ڈیڑھ سو ڈالرز فی بیرل تک پہنچا سکتا ہے۔ جب آئل ٹینکرز رکتے ہیں تو وال اسٹریٹ لرز اٹھتی ہے اور ترقی پذیر ممالک ایندھن اور اناج کے بحران میں ڈوب جاتے ہیں۔"
    }
  },

  {
    topic: "Cyber Warfare and the Ghost Frontline",
    category: 'CYBER_ATTACKS_CRITICAL_INFRA',

    english: {
      text: "World War III won't begin with screaming sirens or nuclear missiles. It begins with silent cyber malware turning off electricity grids, blinding defense radars, and draining bank balances across financial stock exchanges in seconds."
    },

    romanUrdu: {
      text: "Teesri aalmi jung sirens ya atom bomb se shuru nahi hogi. Ye khamosh cyber virus se shuru hogi jo bijli ke grids band karega, radars ko andha karega, aur stock exchanges ke bank accounts seconds mein saaf kar dega."
    },

    plainUrdu: {
      text: "تیسری عالمی جنگ سائرن یا میزائلوں سے شروع نہیں ہوگی۔ یہ ایک خاموش سائبر حملے سے شروع ہوگی جو بجلی کے گرڈز بند کر دے گا، ایئر ڈیفنس ریڈارز کو اندھا کرے گا اور اسٹاک ایکسچینج کے اکاؤنٹس لمحوں میں خالی کر دے گا۔"
    }
  },

  {
    topic: "Nuclear Deterrence vs Microchip Deterrence",
    category: 'GEOPOLITICS_NUCLEAR_TECH',

    english: {
      text: "Nuclear bombs prevent superpowers from invading each other's capitals. But semiconductor microchips prevent Beijing from blockading Taiwan. When mutually assured destruction shifts from atomic radiation to economic collapse, chips are the new warheads."
    },

    romanUrdu: {
      text: "Nuclear hathiyar dushman ko border paar karnay se roktay hain, magar computer chips Taiwan ki naakabandi rokti hain. Jab tabahi atom bomb se hat kar maashi maut par aa jaye, to microchips hi naye nuclear warheads hain."
    },

    plainUrdu: {
      text: "ایٹمی ہتھیار بڑی طاقتوں کو کھلے حملے سے روکتے ہیں، لیکن مائیکرو چپس تائیوان کے محاصرے سے روکتی ہیں۔ جب تباہی کا خوف ایٹم بم سے نکل کر عالمی معاشی موت بن جائے، تو نینومیٹر چپس ہی نیا ایٹمی توازن بن جاتی ہیں۔"
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

  return `You are a professional geopolitical and technology content writer for X (Twitter).

TOPIC: "${chosenTopic}"

CONTENT FOCUS:
Chinese PLA and Taiwan, semiconductor competition, military strategy, radar systems, electronic warfare, global trade routes, digital surveillance, Iran, oil markets, cyber warfare, cryptocurrency and nuclear deterrence.

WRITING RULES:

1. ENGLISH LEVEL:
- Use clear A2-level English.
- Use common, familiar words and simple sentence structures.
- Keep the language natural and professional.
- Avoid difficult vocabulary and academic wording.
- Do not make the content childish.

2. CONTENT QUALITY:
- Deliver meaningful information and a clear insight.
- Explain why the topic matters.
- Include relevant facts and strategic implications.
- Avoid generic statements.
- Do not invent statistics or present guesses as facts.
- Clearly distinguish analysis from confirmed events.

3. X POST STYLE:
- Target 180-260 characters.
- Never exceed 280 characters.
- Write one complete, standalone post.
- Start directly with the main point.
- Use 2-3 connected sentences where appropriate.
- No storytelling or unnecessary introductions.
- No clickbait or exaggerated claims.
- No hashtags.
- No unnecessary emojis.
- Do not sacrifice meaning just to meet the character target.

4. ORIGINALITY:
- Provide a fresh angle.
- Do not repeat these previously used topics:
${avoidListStr}

5. OUTPUT:
Return ONLY valid JSON in this structure:

{
  "topic": "${chosenTopic}",
  "category": "GEOPOLITICS_TECH_DEFENSE",
  "text": "Your final X post here"
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
