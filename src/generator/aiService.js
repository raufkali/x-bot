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
 * - Target Length: 350–480 characters (max 500)
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
    topic: "Taiwan and Computer Chips",
    category: 'CHINA_TAIWAN_INDO_PACIFIC',
    english: {
      text: "China wants Taiwan to become part of China, but Taiwan has its own government. America also supports Taiwan's defence. This makes the situation more serious. If China attacks Taiwan, America may also become involved. But why is Taiwan so important? Because many of the world's computer chips are made there."
    },
    romanUrdu: {
      text: "China chahta hai ke Taiwan uska hissa ban jaye, lekin Taiwan ki apni government hai. America bhi Taiwan ka saath deta hai. Yeh sab maamlat aur bhi serious ho gaye hain. Agar China ne Taiwan par hamla kiya, to America bhi aa sakta hai. Lekin Taiwan itna ahem kyun hai? Kyunke duniya ke bohot sare computer chips wahan banate hain."
    },
    plainUrdu: {
      text: "چین چاہتا ہے کہ تائیوان اس کا حصہ بن جائے، لیکن تائیوان کی اپنی حکومت ہے۔ امریکہ بھی تائیوان کا ساتھ دیتا ہے۔ یہ صورتحال اور بھی سنگین ہوتی جا رہی ہے۔ اگر چین نے تائیوان پر حملہ کیا تو امریکہ بھی شامل ہو سکتا ہے۔ لیکن تائیوان اتنا اہم کیوں ہے؟ کیونکہ دنیا کے بہت سارے کمپیوٹر چپس وہاں بنائے جاتے ہیں۔"
    }
  },
  {
    topic: "China and America's Competition",
    category: 'CHINA_TAIWAN_INDO_PACIFIC',
    english: {
      text: "China and America are competing in many areas, including AI, trade, military power and computer chips. Both countries want to become stronger and protect their interests. This competition is also affecting other countries. But a direct war between these two powers could damage the world economy. Can they compete without starting a major war?"
    },
    romanUrdu: {
      text: "China aur America AI, tijarat, foji taqat aur computer chips mein aapas mein muqabla kar rahay hain. Dono mulk aur taqatwar banna chahte hain aur apne mufadat bachana chahte hain. Yeh muqabla dusre mulkon ko bhi affect kar raha hai. Lekin in dono ke darmiyan seedhi jung poori duniya ki economy ko tabah kar sakti hai. Kya yeh bina bari jung ke muqabla kar sakte hain?"
    },
    plainUrdu: {
      text: "چین اور امریکہ AI، تجارت، فوجی طاقت اور کمپیوٹر چپس میں ایک دوسرے سے مقابلہ کر رہے ہیں۔ دونوں ملک مضبوط بننا چاہتے ہیں۔ یہ مقابلہ دوسرے ملکوں کو بھی متاثر کر رہا ہے۔ لیکن ان دونوں کے درمیان براہ راست جنگ پوری دنیا کی معیشت کو نقصان پہنچا سکتی ہے۔ کیا یہ بغیر بڑی جنگ کے مقابلہ کر سکتے ہیں؟"
    }
  },

  // Category B: Military Strategy & Intelligence
  {
    topic: "Sun Tzu and Modern War",
    category: 'MILITARY_STRATEGY_INTELLIGENCE',
    english: {
      text: "Sun Tzu was a Chinese military thinker who believed that knowing your enemy was very important. His ideas are still useful today. Modern countries collect information about each other's armies, weapons and plans. They also use computers and satellites to watch military movements. The weapons have changed, but the importance of information remains the same."
    },
    romanUrdu: {
      text: "Sun Tzu ek Chinese military expert tha jis ka aqeeda tha ke dushman ko samajhna bohot zaroori hai. Uske khayal aaj bhi kaam aate hain. Jadeed mulk ek dusre ki fauj, hathiyaron aur plans ki information ikhatta karte hain. Woh computers aur satellites bhi use karte hain. Hathiyar badal gaye hain, lekin information ki ahmiyat wahi hai."
    },
    plainUrdu: {
      text: "سن زو ایک چینی فوجی ماہر تھا جس کا یقین تھا کہ دشمن کو سمجھنا بہت ضروری ہے۔ اس کے خیالات آج بھی کام آتے ہیں۔ جدید ممالک ایک دوسرے کی فوج، ہتھیاروں اور منصوبوں کی معلومات اکٹھی کرتے ہیں۔ وہ کمپیوٹر اور سیٹلائٹ بھی استعمال کرتے ہیں۔ ہتھیار بدل گئے ہیں، لیکن معلومات کی اہمیت وہی ہے۔"
    }
  },
  {
    topic: "AI and Modern War",
    category: 'MILITARY_STRATEGY_INTELLIGENCE',
    english: {
      text: "Wars are changing because of AI. Today, armies can use drones to watch enemy movements and find possible targets. AI can also help soldiers understand what is happening on the battlefield. China and America are both investing in this technology. In the future, wars may depend not only on weapons but also on computers."
    },
    romanUrdu: {
      text: "AI ki wajah se jung ka tarika badal raha hai. Aaj faujen drones se dushman ki movements dekh sakti hain aur targets dhundh sakti hain. AI soldiers ko battlefield ki soorat e haal samajhne mein bhi madad karta hai. China aur America dono is technology mein paisa laga rahe hain. Mustaqbil ki jung sirf hathiyaron se nahi, computers se bhi lari jayegi."
    },
    plainUrdu: {
      text: "AI کی وجہ سے جنگ کا طریقہ بدل رہا ہے۔ آج فوجیں ڈرونز سے دشمن کی حرکات دیکھ سکتی ہیں اور اہداف ڈھونڈ سکتی ہیں۔ AI فوجیوں کو میدان جنگ کی صورتحال سمجھنے میں بھی مدد کرتا ہے۔ چین اور امریکہ دونوں اس ٹیکنالوجی میں سرمایہ لگا رہے ہیں۔ مستقبل کی جنگ صرف ہتھیاروں سے نہیں، کمپیوٹرز سے بھی لڑی جائے گی۔"
    }
  },

  // Category C: Iran, Israel & Middle East
  {
    topic: "Iran and the Strait of Hormuz",
    category: 'IRAN_ISRAEL_MIDDLE_EAST',
    english: {
      text: "Iran does not need a nuclear bomb to hurt the West. It just needs to close the Strait of Hormuz for one week. This sea route carries a large amount of the world's oil supply. If it closes, oil prices go up, stock markets fall and many countries start to panic. That is Iran's real power. And everyone knows it."
    },
    romanUrdu: {
      text: "Iran ko Maghrib ko nuqsan pahunchane ke liye nuclear bomb ki zaroorat nahi. Agar Iran Strait of Hormuz sirf ek hafte ke liye band kar de, to tail ki qeematein barhein gi, stock markets girengi aur bohot se mulk pareshan ho jayenge. Yahi Iran ki asli taqat hai. Aur sab ko pata hai."
    },
    plainUrdu: {
      text: "ایران کو مغرب کو نقصان پہنچانے کے لیے ایٹم بم کی ضرورت نہیں۔ اگر ایران آبنائے ہرمز صرف ایک ہفتے کے لیے بند کر دے تو تیل کی قیمتیں بڑھیں گی، اسٹاک مارکیٹیں گریں گی اور بہت سے ملک پریشان ہو جائیں گے۔ یہی ایران کی اصل طاقت ہے۔ اور سب کو پتا ہے۔"
    }
  },
  {
    topic: "China Buys Oil from Iran",
    category: 'IRAN_ISRAEL_MIDDLE_EAST',
    english: {
      text: "China buys oil from Iran, while America does not support this trade. The US has placed restrictions on Iran and wants other countries to follow them. But China continues to buy Iranian oil because it needs energy for its industries. This creates more tension between China and America. Oil is not just about money. It is also about power."
    },
    romanUrdu: {
      text: "China Iran se tail khareedta hai, jabke America is tijarat ko pasand nahi karta. America ne Iran par pabandian lagayi hain aur chahta hai ke baaki mulk bhi manen. Lekin China Iranian tail kharidta rehta hai kyunke use apni industries ke liye energy chahiye. Isse China aur America ke darmiyan tanaao badhta hai. Tail sirf paisay ka maamla nahi. Yeh taqat ka bhi sawaal hai."
    },
    plainUrdu: {
      text: "چین ایران سے تیل خریدتا ہے، جبکہ امریکہ اس تجارت کو پسند نہیں کرتا۔ امریکہ نے ایران پر پابندیاں لگائی ہیں اور چاہتا ہے کہ باقی ملک بھی مانیں۔ لیکن چین ایرانی تیل خریدتا رہتا ہے کیونکہ اسے اپنی صنعتوں کے لیے توانائی چاہیے۔ اس سے چین اور امریکہ کے درمیان تناؤ بڑھتا ہے۔ تیل صرف پیسے کا معاملہ نہیں۔ یہ طاقت کا بھی سوال ہے۔"
    }
  },

  // Category D: Global Economy & Financial Warfare
  {
    topic: "CPEC and Gwadar Port",
    category: 'GLOBAL_ECONOMY_FINANCIAL_WARFARE',
    english: {
      text: "Pakistan has an important location because it connects different parts of Asia. China is investing in the China-Pakistan Economic Corridor, also known as CPEC. Gwadar Port is an important part of this project. China wants better trade routes, while Pakistan hopes to improve its economy. This project can bring opportunities, but security and good planning are also important."
    },
    romanUrdu: {
      text: "Pakistan ki location ahem hai kyunke yeh Asia ke mukhtalif hisson ko jor-ti hai. China Pakistan mein CPEC ke zariye paisa laga raha hai. Gwadar Port is project ka ek ahem hissa hai. China behtar tijarati rasten chahta hai jabke Pakistan apni economy behtar karna chahta hai. Yeh project mauke la sakta hai, lekin security aur achi planning bhi zaruri hai."
    },
    plainUrdu: {
      text: "پاکستان کی لوکیشن اہم ہے کیونکہ یہ ایشیا کے مختلف حصوں کو جوڑتی ہے۔ چین CPEC کے ذریعے پاکستان میں سرمایہ لگا رہا ہے۔ گوادر پورٹ اس منصوبے کا ایک اہم حصہ ہے۔ چین بہتر تجارتی راستے چاہتا ہے جبکہ پاکستان اپنی معیشت بہتر کرنا چاہتا ہے۔ یہ منصوبہ مواقع لا سکتا ہے، لیکن سیکیورٹی اور اچھی منصوبہ بندی بھی ضروری ہے۔"
    }
  },
  {
    topic: "Trade Routes and Sea Routes",
    category: 'GLOBAL_ECONOMY_FINANCIAL_WARFARE',
    english: {
      text: "Most of the world's goods travel by sea. Ships carry oil, food, electronics and many other products from one country to another. If an important sea route is blocked, it can cause problems for many countries at the same time. This is why countries care so much about controlling sea routes. Trade is not just about business. It is also about power."
    },
    romanUrdu: {
      text: "Duniya ka zyada tar saaman samundar ke zariye safar karta hai. Jahaz tail, khaana, electronics aur bohot se products ek mulk se dusre lejate hain. Agar koi ahem samudri raasta band ho jaye, to ek waqt mein bohot se mulkon ko mushkilat hoti hain. Isliye mulk samudri raston par control ke liye itna ziada parwa karte hain. Tijarat sirf karobar nahi. Yeh taqat ka bhi maamla hai."
    },
    plainUrdu: {
      text: "دنیا کا زیادہ تر سامان سمندر کے ذریعے سفر کرتا ہے۔ جہاز تیل، کھانا، الیکٹرونکس اور بہت سی مصنوعات ایک ملک سے دوسرے لے جاتے ہیں۔ اگر کوئی اہم سمندری راستہ بند ہو جائے تو ایک ساتھ بہت سے ملکوں کو مشکلات ہوتی ہیں۔ اسی لیے ملک سمندری راستوں پر کنٹرول کے لیے اتنی زیادہ پرواہ کرتے ہیں۔ تجارت صرف کاروبار نہیں۔ یہ طاقت کا بھی معاملہ ہے۔"
    }
  },

  // Category E: AI, Technology & Cybersecurity
  {
    topic: "Semiconductor Chips and Global Power",
    category: 'AI_TECHNOLOGY_CYBERSECURITY',
    english: {
      text: "Why are computer chips so important? Because almost every modern device needs them. Mobile phones, cars, AI systems and military equipment all use these small chips. Taiwan makes some of the world's most advanced chips. This is one reason why China and America are both interested in the region. Technology has become a major part of global power."
    },
    romanUrdu: {
      text: "Computer chips itne ahem kyun hain? Kyunke har jadeed device inhe chahiye hoti hai. Mobile phones, gaariyan, AI systems aur foji sazaamaan sab inhi chhote chips se chaltay hain. Taiwan duniya ke sab se advanced chips mein se kuch banata hai. Yahi ek wajah hai ke China aur America dono is علاقے mein dilchaspi rakhte hain. Technology ab global taqat ka ek bara hissa ban chuki hai."
    },
    plainUrdu: {
      text: "کمپیوٹر چپس اتنی اہم کیوں ہیں؟ کیونکہ ہر جدید ڈیوائس انہیں چاہتی ہے۔ موبائل فونز، گاڑیاں، AI سسٹمز اور فوجی سازوسامان سب ان چھوٹی چپس سے چلتے ہیں۔ تائیوان دنیا کی سب سے جدید چپس میں سے کچھ بناتا ہے۔ یہی ایک وجہ ہے کہ چین اور امریکہ دونوں اس علاقے میں دلچسپی رکھتے ہیں۔ ٹیکنالوجی اب عالمی طاقت کا ایک بڑا حصہ بن چکی ہے۔"
    }
  },
  {
    topic: "Cyber Warfare",
    category: 'AI_TECHNOLOGY_CYBERSECURITY',
    english: {
      text: "A country does not always need missiles to attack another country. It can also attack its computer systems. Imagine a cyberattack that stops a country's banks or electricity supply. People may not even know who is responsible. This is why countries are spending more money to protect their computer networks. The next war may also start online."
    },
    romanUrdu: {
      text: "Kisi mulk ko dusre par hamla karne ke liye missiles ki zaroorat nahi hoti. Woh uske computer systems par bhi hamla kar sakta hai. Socho agar ek cyber attack kisi mulk ke banks ya bijli band kar de. Log shayad jan bhi na sakein ke zimmedar kaun hai. Isliye mulk apne computer networks ki hifazat par zyada paisa kharch kar rahe hain. Agli jung online bhi shuru ho sakti hai."
    },
    plainUrdu: {
      text: "کسی ملک کو دوسرے پر حملہ کرنے کے لیے میزائلوں کی ضرورت نہیں ہوتی۔ وہ اس کے کمپیوٹر سسٹمز پر بھی حملہ کر سکتا ہے۔ سوچو اگر ایک سائبر حملہ کسی ملک کے بینکس یا بجلی بند کر دے۔ لوگ شاید جان بھی نہ سکیں کہ ذمہ دار کون ہے۔ اسی لیے ملک اپنے کمپیوٹر نیٹ ورکس کی حفاظت پر زیادہ پیسہ خرچ کر رہے ہیں۔ اگلی جنگ آن لائن بھی شروع ہو سکتی ہے۔"
    }
  },

  // Category F: Civilization, History & Global Power
  {
    topic: "Bagram Air Base and US-Pakistan Relations",
    category: 'CIVILIZATION_HISTORY_GLOBAL_POWER',
    english: {
      text: "Bagram was never about Afghanistan. It was always about China, Iran, and Pakistan. If US and Taliban are now talking about spying on China, then Kabul is not neutral anymore. It is becoming a tool. And Pakistan will pay the price for being in the middle."
    },
    romanUrdu: {
      text: "Bagram kabhi Afghanistan ke baare mein tha hi nahi. Yeh hamesha China, Iran aur Pakistan ke baare mein tha. Agar America aur Taliban ab China par nazar rakhne ki baat kar rahe hain, to Kabul zyada neutral nahi raha. Yeh ek tool ban raha hai. Aur Pakistan darmiyan mein hone ki qeemat adaa karega."
    },
    plainUrdu: {
      text: "بگرام کبھی افغانستان کے بارے میں تھا ہی نہیں۔ یہ ہمیشہ چین، ایران اور پاکستان کے بارے میں تھا۔ اگر امریکہ اور طالبان اب چین پر نظر رکھنے کی بات کر رہے ہیں تو کابل زیادہ غیر جانبدار نہیں رہا۔ یہ ایک آلہ بن رہا ہے۔ اور پاکستان درمیان میں ہونے کی قیمت ادا کرے گا۔"
    }
  },
  {
    topic: "Digital Surveillance and Government Control",
    category: 'CIVILIZATION_HISTORY_GLOBAL_POWER',
    english: {
      text: "Today, our phones know a lot about us. They can collect information about our location, searches and daily activities. Governments and companies can use this information for different purposes. AI makes it even easier to study people's behaviour. This creates an important question: are we using technology, or is technology slowly controlling our lives?"
    },
    romanUrdu: {
      text: "Aaj humare phone humare baare mein bohot kuch jante hain. Woh hamari location, searches aur rozana ki activities ka data ikhatta kar sakte hain. Hukumtein aur companies is information ko mukhtalif maqasid ke liye use kar sakti hain. AI se log ki harkatein samajhna aur bhi aasan ho gaya hai. Yeh ek ahem sawaal uthata hai: kya hum technology use kar rahe hain, ya technology hamdhi zindagi par qabzu le rahi hai?"
    },
    plainUrdu: {
      text: "آج ہمارے فون ہمارے بارے میں بہت کچھ جانتے ہیں۔ وہ ہماری لوکیشن، سرچز اور روزانہ کی سرگرمیوں کا ڈیٹا اکٹھا کر سکتے ہیں۔ حکومتیں اور کمپنیاں اس معلومات کو مختلف مقاصد کے لیے استعمال کر سکتی ہیں۔ AI سے لوگوں کی حرکات سمجھنا اور بھی آسان ہو گیا ہے۔ یہ ایک اہم سوال اٹھاتا ہے: کیا ہم ٹیکنالوجی استعمال کر رہے ہیں، یا ٹیکنالوجی ہماری زندگی پر قابو لے رہی ہے؟"
    }
  }
];

let categoryRotationIndex = 0;
let storyCounter = 0;

const MIN_CHARACTERS = 350;
const MAX_CHARACTERS = 480;
const ABSOLUTE_MAX_CHARACTERS = 500;

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
    throw new Error(`AI post exceeds 500-char limit (${entry.charCount} chars)`);
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

  const categoryHint = targetCategory
    ? `The post should be about themes related to: ${targetCategory.name}.`
    : `Topics: China, Taiwan, America, Iran, AI, cyber warfare, military, oil, trade, technology or global power.`;

  return `You are writing a short social media post about international news and world politics.

TOPIC: "${chosenTopic}"

${categoryHint}

============================================================
LANGUAGE RULES — THIS IS THE MOST IMPORTANT PART
============================================================
Write in very simple English. The reader is an ordinary Pakistani person with basic English knowledge.

Use ONLY simple, everyday words. For example:
- Use "buy" not "procure"
- Use "attack" not "escalate aggression"
- Use "power" not "geopolitical leverage"
- Use "army" not "armed forces"
- Use "oil" not "petroleum resources"
- Use "fight" not "engage in hostilities"
- Use "country" not "nation-state"
- Use "chips" or "computer chips" not "semiconductors" (or explain immediately)

If you must use a technical word, explain it right away in simple English.
Example: "semiconductor chips — the small parts that run computers and phones"

DO NOT write like a university paper or a news agency report.
DO NOT use long complicated sentences.
Write like you are explaining the news to a friend.

============================================================
CONTENT STYLE
============================================================
${categoryHint}

Explain the situation simply and connect it to a bigger picture. Answer:
- What is happening?
- Why is it happening?
- How does it affect other countries or the world?

You may end with a natural thought or question that makes the reader think.

============================================================
PERFECT EXAMPLES — FOLLOW THIS EXACT STYLE
============================================================
Study how these examples work. Use the same simple language and sentence length.

Example 1 (China and Iran oil):
"China buys oil from Iran, while America does not support this trade. The US has placed restrictions on Iran and wants other countries to follow them. But China continues to buy Iranian oil because it needs energy for its industries. This creates more tension between China and America. Oil is not just about money. It is also about power."

Example 2 (Taiwan and chips):
"China wants Taiwan to become part of China, but Taiwan has its own government. America also supports Taiwan's defence. This makes the situation more serious. If China attacks Taiwan, America may also become involved. But why is Taiwan so important? Because many of the world's computer chips are made there."

Example 3 (Cyber warfare):
"A country does not always need missiles to attack another country. It can also attack its computer systems. Imagine a cyberattack that stops a country's banks or electricity supply. People may not even know who is responsible. This is why countries are spending more money to protect their computer networks. The next war may also start online."

Example 4 (AI in war):
"Wars are changing because of AI. Today, armies can use drones to watch enemy movements and find possible targets. AI can also help soldiers understand what is happening on the battlefield. China and America are both investing in this technology. In the future, wars may depend not only on weapons but also on computers."

============================================================
STRICT RULES
============================================================
- Write about ONE clear topic. Do not mix multiple separate issues.
- Keep each sentence short and easy to understand.
- 3 to 5 sentences. Around 350 to 450 characters. HARD MAXIMUM: 500 characters.
- Do NOT use hashtags.
- Do NOT use emojis.
- Do NOT start with: "In today's world", "It is important", "Imagine a world", "In the complex landscape", "In recent years".
- Do NOT use bullet points or numbered lists.
- Do NOT repeat or closely rephrase these recent topics: ${avoidListStr}

Return ONLY valid JSON in this exact format:
{
  "topic": "${chosenTopic}",
  "category": "GEOPOLITICAL_STRATEGY",
  "text": "Your complete post here"
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

  const prompt = `Translate this English post about world politics into natural Pakistani Roman Urdu.

ENGLISH POST:
"${englishPost.text}"

RULES:
- Write in simple, natural Pakistani Roman Urdu. Write like you are explaining news to a friend.
- Use everyday words that a normal Pakistani person understands.
- Keep the same meaning and simple tone as the English post.
- Keep length between 350 and 480 characters. Maximum 500 characters.
- Do NOT use hashtags.
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

  const prompt = `Translate this English post about world politics into simple, clear Pakistani Urdu script (اردو).

ENGLISH POST:
"${englishPost.text}"

RULES:
- Write in natural, easy Pakistani Urdu that an ordinary reader can understand.
- Use simple everyday Urdu words. Do not use difficult or formal words.
- Keep the same meaning and tone as the English post.
- Keep length between 350 and 480 characters. Maximum 500 characters.
- Do NOT use hashtags.
- Return ONLY valid JSON:
{
  "text": "اردو متن یہاں لکھیں"
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
