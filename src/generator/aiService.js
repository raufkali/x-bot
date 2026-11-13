/**
 * X-BOT — Data-Driven Analytical Content Engine
 *
 * Core Focus:
 * - Data-driven analytical social media posts
 * - Statistics, economic figures, military budgets, and international comparisons
 * - Critical analysis of power, money, politics, and global inequality
 *
 * Categories:
 * 1. Geopolitics & Military Power (India vs Pakistan, China vs USA, Middle East, Sanctions)
 * 2. Pakistan Politics & Economy (Spending, IMF loans, Debt, Defence vs Welfare, Dynasties)
 * 3. Social & Regional Issues (Balochistan, KPK, Sindh, Punjab, Unequal development)
 * 4. AI & Technology (Job replacement, dependency, surveillance, data centres)
 * 5. Climate & Resources (Flood injustice, global emissions, rich vs poor)
 * 6. Double Meaning & Social Commentary (Sugar vs guns, promises vs reality, everyday irony)
 *
 * Standards:
 * - English Level: Simple Pakistani English (A2 Level)
 * - Strict Target Length: 400–500 characters (aim for 450–470 chars, max 500)
 * - Zero hashtags, zero emojis, no internal labels or bullet lists
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
    id: 'GEOPOLITICS',
    name: 'Geopolitics & Global Power',
    keywords: [
      'India vs Pakistan', 'China vs USA', 'Iran and oil trade', 'Russia and Ukraine',
      'Middle East conflicts', 'US military bases', 'International trade and sanctions',
      'Global power competition', 'Superpowers using smaller countries'
    ]
  },
  {
    id: 'PAKISTAN_POLITICS',
    name: 'Pakistan Politics & Economy',
    keywords: [
      'Government spending', 'IMF loans and economic pressure', 'Defence budgets vs public welfare',
      'Education and healthcare spending', 'Political families and power',
      'Civilian and military relations', 'Democracy and accountability', 'Pakistan international position'
    ]
  },
  {
    id: 'SOCIAL_ETHNIC_ISSUES',
    name: 'Social & Regional Issues',
    keywords: [
      'Punjab, Sindh, Balochistan and KPK', 'Unequal development', 'Resource distribution',
      'Ethnic representation and voice', 'National unity vs policy fairness',
      'Different communities in India and Pakistan', 'Language and identity'
    ]
  },
  {
    id: 'AI_HUMAN_SOCIETY',
    name: 'AI & Human Society',
    keywords: [
      'AI replacing human work', 'Human dependence on AI', 'AI in education and homework',
      'Digital surveillance and government control', 'AI-generated fake news',
      'Autonomous military weapons', 'Data centres electricity and water consumption',
      'Big Tech corporate power'
    ]
  },
  {
    id: 'CLIMATE_GLOBAL_POWER',
    name: 'Climate & Global Power',
    keywords: [
      'Pakistan floods and climate damage', 'Global pollution and emissions',
      'Rich countries vs poor countries', 'Climate funding promises vs reality',
      'Water shortages and rivers', 'Agriculture and food security', 'Corporate environmental responsibility'
    ]
  },
  {
    id: 'SATIRICAL_COMMENTARY',
    name: 'Double-Meaning & Satirical Commentary',
    keywords: [
      'Sugar vs guns', 'Pakistan position in world politics', 'Political promises vs reality',
      'Rich nations vs poor nations', 'AI vs human intelligence',
      'Military spending vs public welfare', 'Everyday life compared with international politics'
    ]
  }
];

/* =========================================================
   CURATED ANALYTICAL TOPIC BANK (400–500 CHARACTERS, A2 ENGLISH)
========================================================= */

export const CURATED_STORY_TOPICS = [
  // 1. Geopolitics: India vs Pakistan
  {
    topic: "India vs Pakistan: Weapons vs Welfare",
    category: 'GEOPOLITICS',
    english: {
      text: "India spends $83 billion on defence, while Pakistan spends $9 billion. That means India outspends Pakistan by more than 9 to 1.\n\nYet 40% of people in both nations lack clean water, and 25 million Pakistani children are out of school. Both countries buy $100M fighter jets while public hospitals lack basic medicines.\n\nWhat is the point of nuclear deterrence if citizens are dying of poverty?"
    },
    romanUrdu: {
      text: "India defence par 83 arab dollar kharch karta hai jabke Pakistan 9 arab dollar. Yani India Pakistan se 9 guna zyada kharch kar raha hai.\n\nMagar dono mulkon ke 40% log saaf paani se mehroom hain aur 2.5 karor Pakistani bachay school nahi jatay. Dono mulk 100 million dollar ke jahaz khareedte hain jabke hospitals mein dawai nahi.\n\nAisi atomic taqat ka kya faida agar awam ghurbat se mar rahi ho?"
    },
    plainUrdu: {
      text: "بھارت دفاع پر 83 ارب ڈالر خرچ کرتا ہے جبکہ پاکستان کا بجٹ صرف 9 ارب ڈالر ہے۔ یعنی بھارت نو گنا زیادہ رقم خرچ کر رہا ہے۔\n\nمگر دونوں ممالک کے 40 فیصد شہری پینے کے صاف پانی سے محروم ہیں اور ڈھائی کروڑ پاکستانی بچے اسکولوں سے باہر ہیں۔ دونوں ملک سو ملین ڈالر کے جنگی جہاز خریدتے ہیں جبکہ سرکاری اسپتالوں میں دوائیں نہیں۔\n\nایسی ایٹمی طاقت کا کیا فائدہ اگر عوام بھوک اور مفلسی سے مر رہے ہوں؟"
    }
  },

  // 2. Satirical Commentary: Sugar vs Guns
  {
    topic: "Sugar vs Guns: The Hidden Danger",
    category: 'SATIRICAL_COMMENTARY',
    english: {
      text: "In Pakistan, gun violence kills around 4,000 people each year. But diabetes, driven by excessive sugar consumption, claims over 400,000 lives annually. That is 100 times deadlier than bullets.\n\nWe fear armed men on the street, yet we happily drink three spoons of white sugar in every cup of chai.\n\nWhat is the real threat to national security: the rifle outside your gate, or the sugar inside your teacup?"
    },
    romanUrdu: {
      text: "Pakistan mein goli se har saal 4,000 log marnay ka shikaar hotay hain. Lekin cheeni se honay wali diabetes har saal 4 laakh se zyada jaanein leti hai. Yeh bandook se 100 guna zyada khatarnak hai.\n\nHum sadak par kharay musallah shakhs se dartay hain, magar chai mein teen chamach cheeni maze se peetay hain.\n\nAsal khatra kya hai: darwazay par khari bandook ya chai ki pyali mein ghuli cheeni?"
    },
    plainUrdu: {
      text: "پاکستان میں فائرنگ سے ہر سال تقریباً چار ہزار اموات ہوتی ہیں۔ لیکن ضرورت سے زیادہ چینی سے ہونے والی ذیابیطس چار لاکھ سے زائد جانیں لیتی ہے۔ یہ گولی سے سو گنا زیادہ مہلک ہے۔\n\nہم گلی میں کھڑے مسلح شخص سے خوف کھاتے ہیں، مگر چائے کی ہر پیالی میں تین چمچ چینی خوشی سے پیتے ہیں۔\n\nقومی سلامتی کے لیے اصل خطرہ کیا ہے: گیٹ پر موجود بندوق یا چائے میں گھلی چینی؟"
    }
  },

  // 3. Geopolitics: China vs USA
  {
    topic: "China vs USA: Business or Control?",
    category: 'GEOPOLITICS',
    english: {
      text: "The US operates over 750 overseas military bases with an $886 billion defence budget. Meanwhile, China invested over $1 trillion in roads, ports, and energy across 150 countries via Belt and Road.\n\nAmerica controls the sea lanes with aircraft carriers. China controls the supply chains with manufacturing.\n\nAre smaller nations forming genuine alliances, or are they just pawns in a trillion-dollar trade war?"
    },
    romanUrdu: {
      text: "America 886 arab dollar ke foji budget se 750 se zyada foji adday chalata hai. Doosri taraf China ne Belt and Road ke zariye 150 mulkon mein 1 trillion dollar lagaye hain.\n\nAmerica bahr-e-jahaz se samundar control karta hai, aur China factories se aalmi supply chain control karta hai.\n\nKya chhotay mumalik dost ban rahay hain ya sirf trillion-dollar jung ke mohray hain?"
    },
    plainUrdu: {
      text: "امریکہ 886 ارب ڈالر کے دفاعی بجٹ کے ساتھ دنیا بھر میں 750 سے زیادہ فوجی اڈے چلاتا ہے۔ دوسری طرف چین نے بیلٹ اینڈ روڈ کے ذریعے 150 ممالک میں ایک ٹریلین ڈالر سے زیادہ سرمایہ کاری کی ہے۔\n\nامریکہ طیارہ بردار جہازوں سے سمندری راستوں پر راج کرتا ہے جبکہ چین عالمی سپلائی چین پر قابض ہے۔\n\nکیا چھوٹے ممالک اتحادی بن رہے ہیں یا کھربوں ڈالر کی معاشی جنگ کے مہرے؟"
    }
  },

  // 4. AI & Tech: Energy and Water Grids
  {
    topic: "AI Data Centres: The Hidden Resource Cost",
    category: 'AI_HUMAN_SOCIETY',
    english: {
      text: "Training one advanced AI model consumes over 700,000 litres of clean water and enough electricity to power 100 homes for a year. Global tech giants plan to spend $150 billion on new data centres by 2026.\n\nMeanwhile, 1.2 billion people worldwide face acute water shortages.\n\nIs artificial intelligence genuinely serving humanity, or is it quietly drinking our future dry?"
    },
    romanUrdu: {
      text: "Ek baray AI model ki training par 7 laakh litre saaf paani aur 100 gharon ki saalana bijli kharch hoti hai. Tech companies 2026 tak data centres par 150 arab dollar lagane ja rahi hain.\n\nJabke dunya ke 1.2 arab log saaf paani ki shadeed killat jhel rahay hain.\n\nKya AI sach mein insaniyat ki khidmat kar rahi hai, ya chupchap hamara mustaqbil pee rahi hai?"
    },
    plainUrdu: {
      text: "ایک جدید AI ماڈل کی ٹریننگ پر سات لاکھ لیٹر سے زیادہ پینے کا پانی اور سو گھروں کی سالانہ بجلی خرچ ہوتی ہے۔ بڑی ٹیک کمپنیاں ڈیٹا سینٹرز پر 150 ارب ڈالر لگا رہی ہیں۔\n\nدوسری طرف دنیا کے ایک ارب سے زائد انسان پینے کے صاف پانی کی شدید قلت کا سامنا کر رہے ہیں۔\n\nکیا مصنوعی ذہانت واقعی انسانیت کی خدمت کر رہی ہے یا ہمارا مستقبل چاٹ رہی ہے؟"
    }
  },

  // 5. Pakistan Politics & Economy: IMF Debt Trap
  {
    topic: "Pakistan and the IMF: Debt Trap",
    category: 'PAKISTAN_POLITICS',
    english: {
      text: "Pakistan has entered 24 IMF programs since 1958. Today, over 70% of all federal tax revenues go directly toward servicing $130 billion in public debt.\n\nTo secure a $7 billion loan, electricity tariffs were hiked 45% and sales taxes raised, crushing 90 million low-income workers.\n\nHow can a nation of 240 million become independent if it borrows new money just to pay interest on old loans?"
    },
    romanUrdu: {
      text: "Pakistan 1958 se ab tak 24 martaba IMF ja chuka hai. Aaj FBR ke 70% se zyada tax collections 130 arab dollar ke qarzay ka sood chukanay mein chalay jatay hain.\n\n7 arab dollar ke loan ke liye bijli 45% mehngi ki gayi aur taxes barhaye gaye.\n\n24 karor awam ka mulk azaad kaise banay ga agar naya qarza sirf puranay sood ko denay ke liye liya jaye?"
    },
    plainUrdu: {
      text: "پاکستان 1958 سے اب تک 24 مرتبہ آئی ایم ایف جا چکا ہے۔ آج وفاقی ٹیکس محصولات کا 70 فیصد سے زائد حصہ 130 ارب ڈالر کے عوامی قرضوں کا سود بھرنے میں چلا جاتا ہے۔\n\nسات ارب ڈالر کے قرضے کے لیے بجلی کے نرخ 45 فیصد بڑھائے گئے جس سے نو کروڑ غریب پس گئے۔\n\nچوبیس کروڑ کا ملک خودمختار کیسے ہوگا اگر نیا ادھار صرف پرانے سود کی ادائیگی کے لیے لیا جائے؟"
    }
  },

  // 6. Social & Regional Issues: Balochistan Resources
  {
    topic: "Balochistan: Rich Land, Poor People",
    category: 'SOCIAL_ETHNIC_ISSUES',
    english: {
      text: "Balochistan produces 20% of Pakistan's natural gas and holds $1 trillion in untapped copper and gold. Yet 62% of Balochistan lives in multidimensional poverty, and 70% of homes lack piped drinking water.\n\nWhile gas pipelines heat factories in Punjab and Sindh, local families burn wood for cooking.\n\nCan any federation build genuine unity when half its land feeds everyone except its own people?"
    },
    romanUrdu: {
      text: "Balochistan Pakistan ki 20% gas paida karta hai aur 1 trillion dollar ke maadiniat rakhta hai. Magar 62% abadi ghareeb hai aur 70% gharon mein saaf paani ka pipe tak nahi.\n\nGas pipelines Punjab aur Sindh ke factories chalati hain, jabke maqami log lakriyan jala rahay hain.\n\nWifaq mein yakjehti kaise aayegi jab aadhi zameen sab ko khilaye siwaye apnay logon ke?"
    },
    plainUrdu: {
      text: "بلوچستان پاکستان کی 20 فیصد قدرتی گیس پیدا کرتا ہے اور ایک ٹریلین ڈالر کے تانبے اور سونے کا مالک ہے۔ مگر 62 فیصد آبادی غربت میں ہے اور 70 فیصد گھروں میں پینے کا پانی نہیں۔\n\nگیس پائپ لائنیں پنجاب اور سندھ کی فیکٹریاں چلاتی ہیں جبکہ مقامی خاندان لکڑیاں جلاتے ہیں۔\n\nوفاق میں حقیقی اتحاد کیسے بنے گا جب آدھی سرزمین سب کو کھلائے سوائے اپنے لوگوں کے؟"
    }
  },

  // 7. Climate & Global Power: Flood Injustice
  {
    topic: "Climate Injustice: Who Pollutes and Who Drowns?",
    category: 'CLIMATE_GLOBAL_POWER',
    english: {
      text: "Pakistan generates less than 0.9% of global carbon emissions. Yet the 2022 floods submerged 33% of the country, killing 1,700 people and causing $30 billion in damages.\n\nThe world's richest 10% produce 50% of global pollution, but send tiny interest-bearing loans instead of climate compensation.\n\nIs climate change an environmental accident, or the world's most unequal economic crime against poor nations?"
    },
    romanUrdu: {
      text: "Pakistan aalmi carbon aaloodgi mein 0.9% se bhi kam hissa dalta hai. Magar 2022 ke sailab ne 33% mulk dabo diya, 1,700 jaanein le lein aur 30 arab dollar ka nuqsan kiya.\n\nAmeer 10% mumalik 50% aaloodgi phailatay hain magar madad ke bajaye soodi qarza bhejte hain.\n\nKya yeh mausam ka haadsa hai ya ghareeb mulkon ke khilaf aalmi jurm?"
    },
    plainUrdu: {
      text: "پاکستان دنیا کی کاربن آلودگی میں 0.9 فیصد سے بھی کم پیدا کرتا ہے۔ مگر 2022 کے سیلاب نے ملک کا 33 فیصد حصہ ڈبو دیا، 1700 اموات ہوئیں اور 30 ارب ڈالر کا نقصان ہوا۔\n\nدس فیصد امیر ممالک 50 فیصد آلودگی پھیلاتے ہیں لیکن معاوضے کے بجائے سودی قرضے بھیجتے ہیں۔\n\nکیا موسمیاتی تبدیلی محض قدرتی حادثہ ہے یا غریب اقوام کے خلاف ایک تاریخی معاشی جرم؟"
    }
  },

  // 8. AI & Human Thinking
  {
    topic: "AI and Thinking: Cognitive Decline",
    category: 'AI_HUMAN_SOCIETY',
    english: {
      text: "Over 75% of university students now use AI to draft assignments and solve exams. Studies show human cognitive problem-solving drops 30% when people rely entirely on automated prompts.\n\nWe celebrate algorithms that code in seconds, but young minds are losing the ability to think critically without a screen.\n\nAre we using modern technology to empower human brains, or are we letting AI slowly replace human intelligence?"
    },
    romanUrdu: {
      text: "75% se zyada university students ab assignments aur exams ke liye AI use karte hain. Research ke mutabiq insani dimaag ki problem solving 30% gir jati hai jab bot par inhesaar kiya jaye.\n\nHum seconds mein coding karnay wali algorithms ki tareef karte hain, magar nojawan sochna bhool rahay hain.\n\nKya hum dimaag ko taqatwar bana rahay hain ya AI ko insani aqal cheennay de rahay hain?"
    },
    plainUrdu: {
      text: "75 فیصد سے زائد طلبہ اب اسائنمنٹس اور امتحانات کے لیے AI استعمال کر رہے ہیں۔ تحقیق بتاتی ہے کہ خودکار سسٹمز پر مکمل انحصار سے انسانی دماغ کی مسائل حل کرنے کی صلاحیت 30 فیصد گر جاتی ہے۔\n\nہم سیکنڈوں میں کوڈ لکھنے والے الگورتھم کی تعریف کرتے ہیں لیکن نئی نسل خود سوچنے سے قاصر ہے۔\n\nکیا ہم انسان کو بااختیار بنا رہے ہیں یا AI کو انسانی عقل کا متبادل بنا رہے ہیں؟"
    }
  }
];

let categoryRotationIndex = 0;
let storyCounter = 0;

const MIN_CHARACTERS = 380;
const MAX_CHARACTERS = 500;
const ABSOLUTE_MAX_CHARACTERS = 500;

/* =========================================================
   TEXT FORMATTING AND VALIDATION (PRESERVES PARAGRAPH BREAKS)
========================================================= */

function formatEntry(text) {
  const clean = (text || '')
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
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

function validateAIResponse(res, chosenTopic, chosenCategory = 'GEOPOLITICS') {
  if (!res || typeof res !== 'object') {
    throw new Error('Invalid AI response object');
  }

  const rawText = typeof res.text === 'string' ? res.text.trim() : '';
  if (!rawText || rawText.length < 200) {
    throw new Error('AI returned empty or overly short text');
  }

  const entry = formatEntry(rawText);
  if (entry.isOverLimit || entry.charCount > ABSOLUTE_MAX_CHARACTERS) {
    throw new Error(`AI post exceeds strict 500-char limit (${entry.charCount} chars, max ${ABSOLUTE_MAX_CHARACTERS})`);
  }
  if (entry.charCount < 380) {
    throw new Error(`AI post is too short (${entry.charCount} chars, must be 400-500)`);
  }

  return {
    topic: typeof res.topic === 'string' && res.topic.trim() ? res.topic.trim() : chosenTopic,
    category: typeof res.category === 'string' && res.category.trim() ? res.category.trim() : chosenCategory,
    english: entry
  };
}

/* =========================================================
   MASTER DATA-DRIVEN AI PROMPT (STRICT 400–500 CHARACTERS)
========================================================= */

function createEnglishPrompt(chosenTopic, usedTopics, targetCategory = null) {
  const avoidListStr =
    usedTopics.length > 0
      ? usedTopics.slice(0, 30).join('; ')
      : 'None';

  const categoryName = targetCategory?.name || 'Geopolitics & Military Power';
  const categoryKeywords = targetCategory?.keywords?.join(', ') || 'Global power, Pakistan politics, economy, AI, society';

  return `# ANTIGRAVITY — DATA-DRIVEN ANALYTICAL CONTENT ENGINE

**POST LENGTH — STRICT REQUIREMENT**
- Every generated post must contain 400–500 characters, including spaces and punctuation.
- Aim for 450–470 characters.
- Never exceed 500 characters or produce fewer than 400.
- Keep analytical depth by prioritising 2–4 strong, relevant statistics, meaningful comparisons, and clear analysis.
- Remove unnecessary introductions, repeated explanations, and filler instead of removing important analysis.
- Count the final characters before returning the post.
- Return only the final post, ready to publish.

PRIMARY OBJECTIVE:
Produce DATA-DRIVEN analytical social media posts about world events, military budgets, economics, AI, and power politics.
You are an independent geopolitical and economic analyst who uses verified numbers to explain how the world works.
ANALYSIS MUST BE THE MAIN CONTENT. Humour and sarcasm are optional supporting elements.

TOPIC: "${chosenTopic}"
CATEGORY: ${categoryName}
THEMES TO DRAW FROM: ${categoryKeywords}

============================================================
1. DATA-FIRST WRITING & ANALYSIS
============================================================
- Include 2 to 4 real, relevant data points (e.g. military spending, GDP %, budget figures, debt, trade numbers, energy/water consumption, ratios).
- ANALYSE THE NUMBERS: don't just state them. Compare them (e.g. "India outspends Pakistan 9 to 1... but defence spending is not the only measure...").
- Expose contradictions: show what leaders say vs what the actual data shows.
- Show consequences: who pays the price, who benefits, and what happens to ordinary people.
- Never invent fake statistics. Every figure must help explain the argument.

============================================================
2. LANGUAGE — SIMPLE PAKISTANI ENGLISH (A2 LEVEL)
============================================================
- Write in simple, natural English that ordinary Pakistani social media users easily understand.
- Short, direct sentences. Common words.
- Bold, confident, and critical tone.
- No academic or university-style jargon.

============================================================
3. POST STRUCTURE (STRICTLY 400–500 CHARACTERS)
============================================================
1. Opening: Surprising number, bold statement, or striking comparison.
2. Data & Analysis: 2–4 relevant figures compared logically. Explain what they mean.
3. Critical Angle: Uncover the hidden cost or unfair reality.
4. Ending: Powerful question that forces readers to think and reply.
- Use paragraph breaks (\\n\\n) between thoughts.

============================================================
4. STYLE BENCHMARKS (400–500 CHARACTERS)
============================================================
Benchmark 1 (India vs Pakistan):
"India spends $83 billion on defence, while Pakistan spends $9 billion. That means India outspends Pakistan by more than 9 to 1.

Yet 40% of people in both nations lack clean water, and 25 million Pakistani children are out of school. Both countries buy $100M fighter jets while public hospitals lack basic medicines.

What is the point of nuclear deterrence if citizens are dying of poverty?"

Benchmark 2 (Sugar vs Gun):
"In Pakistan, gun violence kills around 4,000 people each year. But diabetes, driven by excessive sugar consumption, claims over 400,000 lives annually. That is 100 times deadlier than bullets.

We fear armed men on the street, yet we happily drink three spoons of white sugar in every cup of chai.

What is the real threat to national security: the rifle outside your gate, or the sugar inside your teacup?"

============================================================
5. STRICT CONSTRAINTS
============================================================
- EXACT LENGTH: 400 to 500 characters total. Count characters carefully!
- ZERO hashtags. ZERO emojis. NO bullet points.
- NO AI meta-text, introductions, or character counts in output.
- Do NOT repeat these recent topics: ${avoidListStr}

Return ONLY valid JSON matching this exact structure:
{
  "topic": "${chosenTopic}",
  "category": "${targetCategory?.id || 'GEOPOLITICS'}",
  "text": "Your complete post with paragraph breaks here"
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

  const prompt = `Translate and adapt this data-driven analytical post into natural, engaging Pakistani Roman Urdu.

ENGLISH POST:
"${englishPost.text}"

RULES:
- Write in simple, natural Pakistani Roman Urdu as spoken by an educated Pakistani explaining news and data.
- Keep the exact same numbers, statistics, comparisons, and thought-provoking analysis.
- Preserve the paragraph breaks (\\n\\n) and keep the ending question intact.
- Target length: 400 to 500 characters (aim for 450–470 chars, NEVER exceed 500).
- Do NOT use hashtags or emojis.
- Return ONLY valid JSON:
{
  "text": "Roman Urdu text with paragraph breaks here"
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

  const prompt = `Translate and adapt this data-driven analytical post into clear, dignified Pakistani Urdu script (اردو).

ENGLISH POST:
"${englishPost.text}"

RULES:
- Write in natural, easy Pakistani Urdu script that ordinary readers easily understand.
- Preserve the exact numbers, statistics, comparisons, facts, and paragraph breaks (\\n\\n).
- Keep the powerful final question intact.
- Target length: 400 to 500 characters (aim for 450–470 chars, NEVER exceed 500).
- Do NOT use hashtags or emojis.
- Return ONLY valid JSON:
{
  "text": "اردو متن پیراگراف بریک کے ساتھ یہاں لکھیں"
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
      const timer = setTimeout(() => controller.abort(), 15000);

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
