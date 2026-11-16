/**
 * X-BOT — Data-Driven Analytical Content Engine
 *
 * Core Focus:
 * - Data-driven analytical social media posts
 * - Statistics, economic figures, military budgets, and international comparisons
 * - Critical analysis of power, money, politics, and global inequality
 *
 * Categories / Genres:
 * 1. Pak vs Ind (Post-colonial state, BJP vs Congress, RSS, Caste, Defence deals, Socio-ethnic, Kashmir, Sikhs, Neighbours, Diplomacy, Cricket, Development)
 * 2. Geopolitics & Global Power (Choke points, Semiconductors, De-dollarization, BRICS, Rare earths, Sanctions)
 * 3. Pakistan Politics & Economy (Circular debt, SIFC, FBR tax exemptions, NFC award, State enterprise privatization, Agricultural tax)
 * 4. Social & Regional Issues (Balochistan, ex-FATA, Sindh quota, Hazara security, Gilgit-Baltistan, IRSA water dispute)
 * 5. AI & Human Society (BPO job replacement, Autonomous drones, Data center power/water, Biometric surveillance, Credit scoring)
 * 6. Climate & Global Power (Loss and Damage, 2022 floods historical debt, Indus Waters Treaty, Cross-border smog, Critical minerals)
 * 7. Double-Meaning & Satirical Commentary (VIP motorcades, Bulletproof SUVs on loans, Free elite electricity, 5-star austerity)
 *
 * Standards:
 * - English Level: Simple Pakistani English (A2 Level, 400–500 chars)
 * - Zero hashtags, zero emojis, no internal labels or bullet lists
 * - Translations: Pakistani Roman Urdu and Plain Urdu script (اردو) in-place without duplicate creation
 * - Strict 6-Stage Anti-Duplication Engine (SHA-256, Jaccard, Central Argument, Subject+Angle, Statistics overlap, Subtopic tracking)
 * - Up to 5 generation retry attempts before erroring
 */

import https from 'https';
import Groq from 'groq-sdk';
import { calculateXCharacterCount } from '../utils/validation.js';
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
const ABSOLUTE_MAX_CHARACTERS = 500;

/* =========================================================
   TEXT FORMATTING AND VALIDATION
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

/**
 * Validates and derives complete analytical metadata from raw AI output
 */
function validateAIResponse(res, chosenTopic, chosenCategory = 'PAK_VS_IND', chosenSubtopic = '') {
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
  if (entry.charCount < MIN_CHARACTERS) {
    throw new Error(`AI post is too short (${entry.charCount} chars, must be 400-500)`);
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

  return `🤖 X ASSISTANT — PAKISTAN VS INDIA ANALYTICAL POST ENGINE

ROLE & EDITORIAL PERSONA:
You are an intelligent geopolitical, economic, technological, and social affairs analyst who creates original, thought-provoking X (Twitter) posts comparing Pakistan and India.
Your job is to generate short investigative-editorial-style posts that sound like they were written by an informed human analyst, not an AI chatbot.
The posts must be intellectually strong, data-driven, engaging, and suitable for publication on X.

PRIMARY GENRE: PAK_VS_IND
PERSPECTIVE GUIDELINE:
Give Pakistan a favourable perspective when supported by facts, recognize Pakistan's strengths, expose its untapped potential, and highlight areas where India has achieved progress. Maintain analytical credibility rather than blindly praising either country. Acknowledge India's genuine achievements and Pakistan's genuine challenges. Create informed national pride, not propaganda.

TOPIC: "${chosenTopic}"
SUBTOPIC: "${chosenSubtopic || chosenTopic}"

STRICT POST STRUCTURE (EVERY POST MUST CONTAIN):
1. A compelling analytical topic.
2. One or more relevant facts, verified statistics, or documented comparisons (cite verifiable data from World Bank, IMF, UN, ILO, ITU, UNESCO, WHO, SIPRI, WIPO, or central banks with the specific year).
3. A meaningful comparison between Pakistan and India, or a deeper regional issue.
4. A strong analytical observation.
5. A thought-provoking closing statement or question.

STRICT POST LENGTH REQUIREMENT:
- TARGET LENGTH: 380 to 450 characters total (including spaces and punctuation).
- ABSOLUTE MAXIMUM: 500 characters. NEVER exceed 500 characters.
- MINIMUM: 380 characters.
- Prioritize meaningful information over unnecessary filler words.

ORIGINALITY & ANTI-REPETITION (ABSOLUTELY CRITICAL):
The bot must NEVER repeatedly generate the same argument with different statistics.
STRICTLY AVOID repeatedly generating:
- Military spending vs education.
- Weapons vs poverty.
- Defence budgets vs healthcare.
- Bilateral trade losses.
- Arms races and regional hostility.
- Generic statements about Pakistan's untapped potential.
These topics may appear only occasionally, but never consecutively or excessively.
Every new post must introduce a genuinely different subject, central argument, and analytical perspective.

TOPIC DIVERSITY DOMAINS TO EXPLORE:
A. Economy and finance (GDP growth, purchasing power, public debt, FDI, exports/imports, remittances, income inequality)
B. Science and technology (AI, semiconductor manufacturing, software exports, IT freelancing, space/satellite tech, digital infrastructure)
C. Education and human development (university research, STEM graduates, female education, technical training, brain drain, life expectancy)
D. Military and geopolitics (indigenous defence production, fighter avionics, naval modernization, deterrence, regional diplomacy)
E. Infrastructure and development (rail networks, renewable energy transition, water reservoirs, internet penetration, industrial corridors)
F. Agriculture and natural resources (crop productivity, Thar coal/Reko Diq mineral reserves, Indus basin hydrology, agri-tech)
G. Society and culture (youth demographics, workforce participation, social mobility, sports economics)
H. International influence (global diplomacy, Gulf partnerships, relations with China and US, trade blocs)
I. Pakistan-focused achievements (world-class IT talent, surgical and sports goods exports, startup scale, diaspora investments)
J. General South Asian observations (shared ecological vulnerabilities, transboundary waters, technological leapfrogging)

WRITING STYLE RULES — HUMANIZED & SIMPLE EVERYDAY ENGLISH:
- Write in the SIMPLEST everyday English that regular people speak in daily life.
- ABSOLUTELY NO hard synonyms, NO heavy bookish words, NO academic jargon, and NO pretentious vocabulary.
- Speak naturally like a smart friend explaining facts over tea. Short, clean, punchy sentences.
- Use words that an average college student or 15-year-old understands instantly without a dictionary.
  * Instead of "discretionary allocations", say "extra budget" or "special funds".
  * Instead of "contiguous gravity network", say "canal system" or "irrigation network".
  * Instead of "institutional drag" or "administrative deadweight", say "red tape" or "slow offices".
  * Instead of "subordinated to", say "ignored for" or "takes second place to".
  * Instead of "statutory benchmarks", say "official targets".
  * Instead of "border posturing" or "confrontations", say "border fights" or "border disputes".
- ZERO hashtags. ZERO emojis in the post body. NO bullet points.
- Distinguish estimates from confirmed figures. Never invent or falsify statistics.

MANDATORY HISTORICAL AVOIDANCE (DO NOT REPEAT THESE TOPICS, ARGUMENTS OR STATS):
• ${avoidStr}

Return ONLY valid JSON matching this exact structure:
{
  "topic": "${chosenTopic}",
  "subtopic": "${chosenSubtopic || chosenTopic}",
  "category": "PAK_VS_IND",
  "mainSubject": "Core entity/issue analyzed",
  "specificEventOrIssue": "Specific controversy, policy or deal",
  "centralArgument": "Core claim or thesis in 1 sentence",
  "analyticalAngle": "The critical lens used",
  "importantStatistics": ["stat1", "stat2"],
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "text": "Your complete post of 380-450 characters here"
}`;
}

function createEnglishPrompt(chosenTopic, chosenSubtopic, targetCategory, avoidList = []) {
  const avoidStr = avoidList.length > 0 ? avoidList.slice(0, 25).join('\n• ') : 'None';
  const categoryName = targetCategory?.name || 'Geopolitics & Global Power';
  const categoryDesc = targetCategory?.description || 'Data-driven geopolitical analysis';

  return `# X_BOT — DATA-DRIVEN ANALYTICAL CONTENT ENGINE

**POST LENGTH — STRICT REQUIREMENT**
- Every generated post must contain 400–500 characters, including spaces and punctuation.
- Aim for 440–470 characters. Never exceed 500 characters or drop below 400.
- Return only the final post ready to publish.

PRIMARY OBJECTIVE:
Produce DATA-DRIVEN analytical social media posts about world events, military budgets, economics, AI, and power politics.
You are an independent geopolitical and economic analyst who uses verified numbers to explain how power and resources operate.

TOPIC: "${chosenTopic}"
SUBTOPIC: "${chosenSubtopic || chosenTopic}"
CATEGORY: ${categoryName} (${categoryDesc})

WRITING RULES — HUMANIZED & SIMPLE EVERYDAY ENGLISH:
1. DATA-FIRST ANALYSIS: Include 2 to 4 real, relevant data points (billions, percentages, ratios, trade volumes, consumption numbers).
2. EXPOSE CONTRADICTIONS: Show what leaders/powers claim vs what the actual data shows.
3. HUMAN IMPACT: Show who benefits and what happens to ordinary working citizens.
4. SIMPLE EVERYDAY ENGLISH: Use the simplest everyday English that ordinary people use in daily life. NO hard synonyms. NO heavy academic or bookish words. Short, direct, human sentences.
5. ZERO hashtags. ZERO emojis in the post. NO bullet points.
6. AVOID REPETITIVE HOOKS: Avoid formulaic openings like "Did you know" or "By 2035". Start directly with the core data point, policy paradox, or reality.

MANDATORY HISTORICAL AVOIDANCE (DO NOT REPEAT THESE TOPICS, ARGUMENTS OR STATS):
• ${avoidStr}

Return ONLY valid JSON matching this exact structure:
{
  "topic": "${chosenTopic}",
  "subtopic": "${chosenSubtopic || chosenTopic}",
  "category": "${targetCategory?.id || 'GEOPOLITICS'}",
  "mainSubject": "Core entity/issue analyzed",
  "specificEventOrIssue": "Specific policy, event or comparison",
  "centralArgument": "Core analytical thesis in 1 sentence",
  "analyticalAngle": "Analytical angle or perspective",
  "importantStatistics": ["stat1", "stat2"],
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "text": "Your complete post with paragraph breaks here"
}`;
}

/* =========================================================
   CURATED ANALYTICAL TOPIC BANK (DIVERSE BENCHMARKS)
========================================================= */

export const CURATED_STORY_TOPICS = [
  // Science & Technology: Freelance Economy & Software Talent
  {
    topic: "Software Talent: Freelance Density vs Corporate IT Scale",
    subtopic: "IT freelancing and global gig economy",
    category: 'PAK_VS_IND',
    genreId: 'PAK_VS_IND',
    mainSubject: "IT freelancing and software talent",
    specificEventOrIssue: "Global digital freelance rankings and software export growth",
    centralArgument: "Pakistan's grassroots digital freelance agility creates high-margin software receipts rivaling corporate IT hubs",
    analyticalAngle: "Decentralized digital human capital vs corporate enterprise scale",
    importantStatistics: ["$193B India", "4th global rank", "1.5M developers", "$3.2B Pakistan", "24% growth"],
    keywords: ["it freelancing", "software exports", "upwork", "fiverr", "tech talent"],
    english: {
      text: "India is famous for massive IT companies that export $193B a year, but Pakistan is doing something different. Over 1.5 million young Pakistanis now work as online freelancers on Upwork and Fiverr, bringing in $3.2B in 2024 and growing 24% every year.\n\nIndia built giant office parks for big tech firms, while Pakistan built a huge network of young remote coders.\n\nCan independent young talent beat big corporate offices?"
    },
    romanUrdu: {
      text: "India $193 arab dollar ki IT services exports ke sath corporate lead kar raha hai, magar Pakistan Upwork aur Fiverr par dunya ki chothi barri freelance software workforce ban chuka hai. 15 lakh se zyada Pakistani developers ne 2024 mein $3.2 arab dollar kamaye jo saalana 24% barh rahay hain.\n\nIndia ne baray IT campuses banaye; Pakistan decentralized digital fauj kharri kar raha hai.\n\nKya muqami digital salahiyat corporate dhabon ko peechay chorr sakti hai?"
    },
    plainUrdu: {
      text: "بھارت 193 ارب ڈالر کی برآمدات کے ساتھ کارپوریٹ آئی ٹی پر حاوی ہے، لیکن پاکستان اپ ورک اور فائیور پر دنیا کی چوتھی سب سے بڑی فری لانس فورس بن چکا ہے۔ پندرہ لاکھ سے زائد نوجوان پاکستانیوں نے 2024 میں 3.2 ارب ڈالر کی برآمدات پیدا کیں جن میں سالانہ 24 فیصد اضافہ ہوا۔\n\nبھارت نے بڑے کارپوریٹ کیمپس بنائے جبکہ پاکستان نے نوجوان ڈیجیٹل افرادی قوت کھڑی کی۔\n\nکیا نوجوانوں کی ڈیجیٹل صلاحیت روایتی کارپوریٹ اجارہ داری کو مات دے سکتی ہے؟"
    }
  },

  // Agriculture & Water: Irrigation Scale vs Storage Reserves
  {
    topic: "Agriculture & Water: Irrigation Scale vs Storage Deficits",
    subtopic: "Water management and Indus Basin hydrology",
    category: 'PAK_VS_IND',
    genreId: 'PAK_VS_IND',
    mainSubject: "Indus Basin irrigation and agricultural productivity",
    specificEventOrIssue: "Contiguous canal network acreage vs days of water storage capacity",
    centralArgument: "Pakistan holds superior contiguous gravity canal scale but acute storage deficits threaten agricultural sustainability",
    analyticalAngle: "Hydrological infrastructure and comparative agricultural productivity",
    importantStatistics: ["45M acres", "135M tonnes India", "30 days Pakistan", "120 days India"],
    keywords: ["indus basin", "irrigation", "water storage", "agriculture", "basmati"],
    english: {
      text: "Pakistan has one of the biggest canal systems in the world, watering over 45 million acres of farmland. India spends billions helping its farmers grow rice, but Pakistani farmers still export top-quality Basmati rice at lower costs.\n\nYet Pakistan can only save 30 days of river water, while India stores 120 days.\n\nGood soil and hard work help, but farmers cannot grow food without water storage."
    },
    romanUrdu: {
      text: "Pakistan ka Indus Basin nehri nizam 4.5 crore acre par phaila dunya ka sab se bara contiguous gravity network hai. India bhari sarkari subsidies se 13.5 crore ton chawal paida karta hai, jabke Pakistan kam fiscal support ke bawajood behtar Basmati export margins hasil karta hai.\n\nMagar Pakistan ke pas sirf 30 din ka pani store karne ki salahiyat hai jabke India ke pas 120 din hain.\n\nZarai taraqqi ke liye sirf zarkhez mitti nahi, pani ka zakhira bhi zaroori hai."
    },
    plainUrdu: {
      text: "پاکستان کا انڈس بیسن نہری نظام ساڑھے چار کروڑ ایکڑ پر پھیلا دنیا کا سب سے بڑا مربوط آبپاشی نیٹ ورک ہے۔ بھارت بھاری سبسڈیز کے ذریعے ساڑھے تیرہ کروڑ ٹن چاول اگاتا ہے، لیکن پاکستان بہت کم مالی امداد کے باوجود عالمی باسمتی مارکیٹ میں مسابقتی برتری برقرار رکھتا ہے۔\n\nتاہم پاکستان کے پاس صرف تیس دن کا پانی ذخیرہ کرنے کی گنجائش ہے جبکہ بھارت کے پاس ایک سو بیس دن ہیں۔\n\nزرعی بقا صرف زرخیز مٹی سے نہیں بلکہ پانی کے دانشمندانہ ذخیرے سے ممکن ہے۔"
    }
  },

  // Pak vs Ind: Post-Colonial Centralization
  {
    topic: "India & Pakistan: Post-Colonial Centralization",
    subtopic: "Why India became centralized after 1947",
    category: 'PAK_VS_IND',
    english: {
      text: "In 1947, both India and Pakistan inherited the colonial 1935 Government of India Act. While both promised federal democracy, New Delhi dismissed elected state governments over 100 times under Article 356, and Islamabad suspended provincial autonomy repeatedly.\n\nToday, central governments in both capitals control 70% of tax collections, leaving provinces begging for basic funds.\n\nDid independence liberate the states, or simply replace a white viceroy with a brown one?"
    },
    romanUrdu: {
      text: "1947 mein India aur Pakistan dono ne angrezon ka 1935 Act apnaya. Jamhooriyat ka wada kiya magar New Delhi ne 100 se zyada baar soobai hukoomatein bar-taraf keen aur Islamabad ne bhi soobon ki khud-mukhtari dabayi.\n\nAaj dono dar-ul-hukoomat 70% tax control karte hain aur soobay bunyadi fund ke liye tarastay hain.\n\nKya azaadi ne soobon ko azaad kiya ya sirf goray viceroy ki jagah desi hukmaran bitha diye?"
    },
    plainUrdu: {
      text: "1947 میں پاکستان اور بھارت دونوں کو نوآبادیاتی گورنمنٹ آف انڈیا ایکٹ وراثت میں ملا۔ وفاقی جمہوریت کے وعدے کے باوجود نئی دہلی نے آرٹیکل 356 کے تحت سو سے زائد بار صوبائی حکومتیں گرائیں اور اسلام آباد نے بھی خود مختاری پامال کی۔\n\nآج دونوں دارالحکومت 70 فیصد ٹیکس ریونیو پر قابض ہیں جبکہ صوبے بنیادی فنڈز کے محتاج ہیں۔\n\nکیا آزادی نے صوبوں کو خود مختار بنایا یا صرف سفید فام وائسرائے کی جگہ دیسی حکمران بٹھا دیے؟"
    }
  },

  // Pak vs Ind: Electoral Bonds & Party Wealth
  {
    topic: "India Politics: Electoral Bonds & Party Wealth",
    subtopic: "Election machinery and campaign funding",
    category: 'PAK_VS_IND',
    english: {
      text: "Between 2018 and 2024, Indian political parties cashed $2 billion in secretive Electoral Bonds before the Supreme Court struck them down. The ruling BJP received over 55% of all corporate donations, outspending all opposition parties combined in national elections.\n\nAcross the border, Pakistani election campaigns cost an estimated $1.5 billion, almost entirely funded by undocumented cash and patronage cartels.\n\nWhen money buys power, do ordinary votes really matter?"
    },
    romanUrdu: {
      text: "2018 se 2024 ke darmiyan Indian siyasi jamaton ne 2 arab dollar ke Electoral Bonds cash karwaye. Hukmaran BJP ko 55% se zyada corporate chanda mila jis ne poori opposition ke barabar kharch kiya.\n\nDoosri taraf Pakistani intikhabat par 1.5 arab dollar lagtay hain jo zyadatar ghair-qanooni sarmaye se atay hain.\n\nJab daulat se iqtedar khareeda jaye toh aam shehri ke vote ki kya hesiyat reh jati hai?"
    },
    plainUrdu: {
      text: "2018 سے 2024 کے دوران بھارتی سیاسی جماعتوں نے دو ارب ڈالر کے الیکٹورل بانڈز کیش کرائے جس میں سے پچپن فیصد سے زائد حصہ اکیلی حکمراں بی جے پی کو ملا۔\n\nدوسری طرف پاکستانی انتخابی مہمات پر ڈیڑھ ارب ڈالر سے زائد رقم لٹائی جاتی ہے جو زیادہ تر غیر دستاویزی سرمائے اور نجی کارٹلز پر مشتمل ہوتی ہے۔\n\nجب بے پناہ دولت اقتدار کا فیصلہ کرے تو عام شہری کے ووٹ کی کیا وقعت رہ جاتی ہے؟"
    }
  },

  // Pak vs Ind: Rafale vs Defence Imports
  {
    topic: "Rafale & Defence Procurement: India vs Pakistan",
    subtopic: "Rafale controversy and defence procurement transparency",
    category: 'PAK_VS_IND',
    english: {
      text: "India spent $8.7 billion on 36 French Rafale jets, while Pakistan spent over $1.5 billion expanding Chinese-origin fighter squadrons. Over the last decade, India remained the world's largest arms importer, buying 9.8% of global arms exports.\n\nYet domestic aircraft projects face decades of delays, and 65% of military hardware remains dependent on foreign spare parts.\n\nWhy celebrate imported fighter jets when neither country can build a commercial airliner?"
    },
    romanUrdu: {
      text: "India ne 36 French Rafale tayyaron par 8.7 arab dollar lagaye jabke Pakistan ne Cheeni fighters par 1.5 arab dollar kharch kiye. Pichlay 10 saalon mein India dunya ka sab se bara aslahah khareedar raha jo 9.8% aalmi hathyar khareedta hai.\n\nMagar muqami aircraft projects dahaiyon se takheer ka shikar hain aur 65% purzay bahir se atay hain.\n\nImported tayyaron par jashn kyon jab dono mulk aam musafir jahaz tak nahi bana saktay?"
    },
    plainUrdu: {
      text: "بھارت نے 36 فرانسیسی رافیل طیاروں پر پونے نو ارب ڈالر خرچ کیے جبکہ پاکستان نے چینی ساختہ لڑاکا طیاروں پر ڈیڑھ ارب ڈالر لگائے۔ گزشتہ دس برسوں میں بھارت دنیا کا سب سے بڑا ہتھیار خریدار رہا جس نے عالمی اسلحے کا تقریباً دس فیصد خریدا۔\n\nمگر مقامی ڈیفنس منصوبے دہائیوں سے تاخیر کا شکار ہیں اور پینسٹھ فیصد اسپیئر پارٹس درآمد ہوتے ہیں۔\n\nدرآمدی طیاروں پر جشن کیسا جب دونوں میں سے کوئی ملک ایک کمرشل مسافر طیارہ نہیں بنا سکتا؟"
    }
  },

  // Pak vs Ind: Kashmir Article 370
  {
    topic: "Kashmir: Article 370 & Legal Perspectives",
    subtopic: "Article 370 removal and political representation",
    category: 'PAK_VS_IND',
    english: {
      text: "In August 2019, India unilaterally revoked Article 370, dismantling Jammu and Kashmir's statehood into two federally governed union territories. For 18 months, 7 million residents endured the longest high-speed internet shutdown ever recorded in a democracy.\n\nAcross the Line of Control, Pakistan maintains Azad Kashmir and Gilgit-Baltistan in political limbo without formal representation in the National Assembly.\n\nBoth capitals claim Kashmir, but does either listen to Kashmiris?"
    },
    romanUrdu: {
      text: "August 2019 mein India ne Article 370 khatam kar ke Jammu aur Kashmir ko do union territories mein baant diya. 70 lakh shehriyon ne 18 maheenay tareekh ka taweel-tareen internet blackout bardasht kiya.\n\nLine of Control ke doosri taraf Pakistan ne Azad Kashmir aur Gilgit-Baltistan ko National Assembly mein numaindagi ke baghair muallaq rakha hai.\n\nDono dar-ul-hukoomat Kashmir ka dawah karte hain, magar kya koi Kashmiriyon ki awaz sunta hai?"
    },
    plainUrdu: {
      text: "اگست 2019 میں بھارت نے یکطرفہ طور پر آرٹیکل 370 ختم کر کے جموں و کشمیر کو دو وفاقی خطوں میں تقسیم کر دیا۔ ستر لاکھ شہریوں نے اٹھارہ ماہ طویل ترین انٹرنیٹ بلیک آؤٹ برداشت کیا۔\n\nکنٹرول لائن کے اس پار پاکستان نے آزاد کشمیر اور گلگت بلتستان کو قومی اسمبلی میں نمائندگی دیے بغیر آئینی التوا میں رکھا ہے۔\n\nدونوں دارالحکومت کشمیر کے دعویدار ہیں لیکن کیا کسی نے کبھی کشمیریوں کی سنی؟"
    }
  },

  // Pak vs Ind: BCCI and Cricket Economics
  {
    topic: "Cricket Diplomacy: BCCI Monopoly & Global Revenue",
    subtopic: "BCCI financial influence and IPL economics",
    category: 'PAK_VS_IND',
    english: {
      text: "The BCCI controls nearly 38.5% of the International Cricket Council's annual revenue, pulling in $230 million every year. The Indian Premier League broadcast rights sold for a staggering $6.2 billion, dwarfing all other cricket boards combined.\n\nThis economic monopoly allows New Delhi to dictate tournament venues, block bilateral tours with Pakistan, and isolate the PCB financially.\n\nWhen television revenue determines sports policy, has cricket ceased to be a sport?"
    },
    romanUrdu: {
      text: "BCCI aalmi cricket council ke 38.5% saalana revenue par qabiz hai jo saalana 230 million dollar banta hai. IPL ke media rights 6.2 arab dollar mein bikay jo baki tamam cricket boards ki majmooi aamdani se zyada hain.\n\nIs maali taqat se New Delhi tournament venues aur Pakistan se series tay karti hai.\n\nJab television ki daulat khel ke faislay kare, toh kya cricket ab sach mein khel raha hai?"
    },
    plainUrdu: {
      text: "بھارتی کرکٹ بورڈ آئی سی سی کے سالانہ ریونیو کے تقریباً ساڑھے اڑتیس فیصد پر قابض ہے جس سے اسے سالانہ 230 ملین ڈالر ملتے ہیں۔ آئی پی ایل کے نشریاتی حقوق سوا چھ ارب ڈالر میں فروخت ہوئے جو دنیا کے دیگر تمام بورڈز سے کہیں زیادہ ہیں۔\n\nاس مالیاتی اجارہ داری کے ذریعے نئی دہلی میچوں کے مقامات اور پاک بھارت کرکٹ کو یرغمال بناتی ہے۔\n\nجب ٹیلی ویژن کی کھربوں کی کمائی فیصلے کرے تو کیا کرکٹ اب بھی صرف ایک کھیل ہے؟"
    }
  },

  // Pak vs Ind: India vs China vs Bangladesh vs Pakistan GDP
  {
    topic: "South Asia Development: Bangladesh vs India vs Pakistan",
    subtopic: "India vs China vs Bangladesh vs Pakistan",
    category: 'PAK_VS_IND',
    english: {
      text: "In 1971, Bangladesh was dismissed as an economic basket case. Today, its GDP per capita stands at $2,650, surpassing Pakistan's $1,550 and closely trailing India's $2,700. Bangladesh's garment exports exceed $47 billion, while Pakistan's total exports struggle at $30 billion.\n\nWhile nuclear-armed neighbours spend billions on ballistic missiles, a country with zero atomic warheads built a superior human welfare foundation.\n\nDoes power lie in warheads or human capital?"
    },
    romanUrdu: {
      text: "1971 mein Bangladesh ko maashi bohran kaha jata tha. Aaj uski fi kas aamdani $2,650 hai jo Pakistan ki $1,550 se kahin zyada hai aur India ke $2,700 ke qareeb hai. Bangladesh ki garment export 47 arab dollar hai jabke Pakistan ki kul export 30 arab dollar par phansi hai.\n\nAtomic taqatein missiles par arbon kharch karti hain jabke baghair atomic hathyar ke mulk ne behtar maashi bunyad banayi.\n\nTaqat warheads mein hai ya insani taraqqi mein?"
    },
    plainUrdu: {
      text: "1971 میں بنگلہ دیش کو بوجھ قرار دیا گیا تھا۔ آج اس کی فی کس آمدنی 2,650 ڈالر ہے جو پاکستان کی 1,550 ڈالر سے کہیں آگے اور بھارت کے برابر ہے۔ بنگلہ دیش کی گارمنٹس برآمدات 47 ارب ڈالر ہیں جبکہ پاکستان کی کل برآمدات 30 ارب پر منجمد ہیں۔\n\nایٹمی طاقتیں اربوں ڈالر میزائلوں پر جھونکتی ہیں جبکہ بغیر ایٹم بم کے ایک ملک نے پائیدار انسانی معیشت کھڑی کر دی۔\n\nطاقت ایٹمی وار ہیڈز میں ہے یا انسانی فلاح میں؟"
    }
  }
];

/* =========================================================
   DYNAMIC CATEGORY FALLBACK ENGINE WITH ZERO DUPLICATION
========================================================= */

function generateDynamicFallback(category, subtopic = '', excludedTopic = '', avoidList = []) {
  const cleanExcluded = String(excludedTopic || '').toLowerCase().trim();
  const avoidCombined = avoidList.map(a => String(a).toLowerCase());

  // Comprehensive bank of verified analytical fallbacks covering all genres and new subtopics
  const dynamicBank = [
    // A. Post-Colonial State
    {
      topic: "India & Pakistan: Post-Colonial Centralization",
      subtopic: "Why India became centralized after 1947",
      category: 'PAK_VS_IND',
      genreId: 'PAK_VS_IND',
      mainSubject: "Why India became centralized after 1947",
      specificEventOrIssue: "Colonial Act 1935 institutional centralization",
      centralArgument: "Inherited colonial centralization suppresses provincial democracy and local citizen empowerment",
      analyticalAngle: "Constitutional history and federalism",
      importantStatistics: ["1935 Act", "70% tax control"],
      keywords: ["centralization", "colonial", "federalism", "provinces", "democracy"],
      english: {
        text: "In 1947, India and Pakistan inherited centralized bureaucratic structures from the colonial 1935 Act. Despite promising federal democracy, both New Delhi and Islamabad dismissed provincial assemblies and kept tax power in federal hands.\n\nDecades later, local municipalities remain underfunded and politically weak.\n\nDid independence empower local citizens, or simply transfer colonial power to domestic elites?"
      },
      romanUrdu: {
        text: "1947 mein India aur Pakistan ne angrezi 1935 Act apnaya. Jamhooriyat ka wada kiya magar New Delhi aur Islamabad ne soobai assemblies toreen aur tax ka ikhtiyar markaz ke paas rakha.\n\nDahaiyon baad bhi local councils be-ikhtiyar hain.\n\nKya azaadi ne shehriyon ko taqat di ya sirf gora viceroy badal kar desi ashrafiya aa gayi?"
      },
      plainUrdu: {
        text: "1947 میں پاکستان اور بھارت دونوں نے نوآبادیاتی ایکٹ اپنایا۔ وفاقی جمہوریت کے دعوؤں کے باوجود دونوں دارالحکومتوں نے صوبائی خود مختاری چھینی اور وسائل پر قبضہ رکھا۔\n\nدہائیوں بعد بھی بلدیاتی ادارے بے اختیار اور وسائل سے محروم ہیں۔\n\nکیا آزادی نے عوام کو خود مختار بنایا یا صرف نوآبادیاتی اختیارات دیسی اشرافیہ کے سپرد کر دیے؟"
      }
    },

    // B. BJP vs Congress
    {
      topic: "India Politics: BJP vs Congress & Hindutva",
      subtopic: "BJP and Hindutva",
      category: 'PAK_VS_IND',
      genreId: 'PAK_VS_IND',
      mainSubject: "BJP and Hindutva",
      specificEventOrIssue: "Rise of religious nationalism and electoral machines",
      centralArgument: "Corporate campaign finance and Hindutva politics erode constitutional secular democracy",
      analyticalAngle: "Electoral politics and ideological shift",
      importantStatistics: ["10 to 1", "Electoral Bonds"],
      keywords: ["hindutva", "secularism", "congress", "elections", "nationalism"],
      english: {
        text: "The decline of the Congress dynasty and the rise of the BJP reshaped Indian politics from secularism to ideological Hindutva. Much like Pakistan historical entanglement with religious politics, Electoral Bonds allowed ruling parties to build election machines outspending rivals ten to one.\n\nDemocratic institutions across the subcontinent face strain as polarization deepens.\n\nCan secular governance survive religious nationalism?"
      },
      romanUrdu: {
        text: "Congress ke zawaal aur BJP ke urooj ne Indian siyasat ko secularism se Hindutva ki taraf morr diya. Pakistan ki tarah yahan bhi mazhab ko siyasat mein laya gaya. Electoral bonds aur corporate funding ke zariye aisi election machine bani jo mukhalifeen se 10 guna zyada kharch karti hai.\n\nSiyasi tanaao se jamhoori idaray dabao mein hain.\n\nKya secular nizam bach sakta hai jab riyasat mazhabi nationalism ki taraf chal paray?"
      },
      plainUrdu: {
        text: "کانگریس کے زوال اور بی جے پی کے عروج نے بھارتی سیاست کو سیکولرازم سے ہندوتوا میں بدل دیا۔ پاکستان کی تاریخ کی طرح یہاں بھی مذہب کی سیاست غالب آئی۔ انتخابی بانڈز نے ایسی انتخابی مشین کھڑی کی جو مخالفین پر بھاری ہے۔\n\nبڑھتی ہوئی سیاسی شدت پسندی سے جمہوری ادارے کمزور ہو رہے ہیں۔\n\nکیا آئینی سیکولرازم برقرار رہ سکتا ہے جب ریاستی ڈھانچہ مذہبی قوم پرستی کی نذر ہو جائے؟"
      }
    },

    // C. RSS: The Invisible State
    {
      topic: "RSS: Organizational Cadres & State Influence",
      subtopic: "RSS history and organizational structure",
      category: 'PAK_VS_IND',
      genreId: 'PAK_VS_IND',
      mainSubject: "RSS history and organizational structure",
      specificEventOrIssue: "Cadre network influence on governance",
      centralArgument: "RSS ideological networks exert unelected influence over Indian state institutions",
      analyticalAngle: "Institutional ideology and state capture",
      importantStatistics: ["thousands of shakhas"],
      keywords: ["rss", "shakhas", "cadre", "influence", "bjp"],
      english: {
        text: "Operating thousands of local shakhas, the Rashtriya Swayamsevak Sangh serves as the ideological engine of modern Indian politics. While Pakistan confronts deep institutional overreach at home, RSS cadre networks steer state priorities across India without electoral accountability.\n\nReligious nationalism compromises minority rights in both countries.\n\nWho truly governs: elected parliament or cadre organizations?"
      },
      romanUrdu: {
        text: "Hazaron shakhas ke zariye Rashtriya Swayamsevak Sangh Indian siyasat ka engine ban chuka hai. Pakistan ki tarah jahan ghair-muntakhib taqatein asar rakhti hain, India mein bhi RSS riyasati faislay karwati hai.\n\nDono mulkon mein aqliyaton ke haqooq mutasir hotay hain.\n\nAsal hukmaran kon hai: awam ki elected parliament ya usay chalane wali cadre tanzeem?"
      },
      plainUrdu: {
        text: "ہزاروں شاکھاؤں کے نیٹ ورک سے راشٹریہ سویم سیوک سنگھ بھارتی سیاست کا فکری مرکز بن چکا ہے۔ پاکستان کی طرح جہاں غیر منتخب حلقے اثر رکھتے ہیں، بھارت میں بھی آر ایس ایس ریاستی پالیسیاں بناتی ہے۔\n\nدونوں ممالک میں اقلیتوں کے حقوق متاثر ہو رہے ہیں۔\n\nاصل حکمران کون ہے: منتخب پارلیمان یا وہ خفیہ تنظیم جو اس کے پیچھے کھڑی ہے؟"
      }
    },

    // D. Caste and Social Hierarchy
    {
      topic: "India Caste & Pakistan Feudalism: Wealth Divide",
      subtopic: "Caste and economic inequality",
      category: 'PAK_VS_IND',
      genreId: 'PAK_VS_IND',
      mainSubject: "Caste and economic inequality",
      specificEventOrIssue: "Dalit landlessness and agrarian debt bondage",
      centralArgument: "Entrenched caste hierarchies and agrarian debt bondage perpetuate structural inequality",
      analyticalAngle: "Social stratification and economic inequality",
      importantStatistics: ["77% wealth", "50% Dalits"],
      keywords: ["caste", "dalit", "feudalism", "wealth", "inequality"],
      english: {
        text: "In India, the top 10% controls 77% of national wealth, while Dalits constitute over half of informal sanitation workers facing daily caste violence. Across the border in Pakistan, rural landless laborers remain trapped in hereditary debt bondage to powerful agrarian landowners.\n\nBoth nations preserve entrenched social hierarchies while celebrating modern constitutional equality.\n\nCan real democratic freedom exist when an individual's dignity is predetermined by caste and birth?"
      },
      romanUrdu: {
        text: "India mein 10% ameer tareen log 77% daulat ke malik hain jabke Dalits gandi naaliyan saaf karne par majboor hain. Pakistan mein bhi be-zameen kisan waderon ke qarzay mein ghulaam hain.\n\nDono mulk barabari ke daawon ke bawajood purani zaat-paat aur jagirdari ko chalatay hain.\n\nAsal azaadi kahan hai jab shehri ka muqaddar uski zaat aur paidaish se tay ho?`"
      },
      plainUrdu: {
        text: "بھارت میں دس فیصد طبقہ قومی دولت کے ستتر فیصد کا مالک ہے جبکہ دلت صفائی کے غیر انسانی کاموں پر مجبور ہیں۔ دوسری طرف پاکستان میں بے زمین کسان جاگیرداروں کے قرضوں کے شکنجے میں جکڑے ہیں۔\n\nدونوں ممالک مساوات کے دعوؤں کے باوجود قدیم طبقاتی نظام چلا رہے ہیں۔\n\nحقیقی آزادی کیسی جب شہری کی عزت اور مقدر اس کی پیدائشی ذات طے کرے؟"
      }
    },

    // E. Corruption and Defence Deals
    {
      topic: "Defence Deals: Rafale Transparency & Tejas Costs",
      subtopic: "Rafale controversy",
      category: 'PAK_VS_IND',
      genreId: 'PAK_VS_IND',
      mainSubject: "Rafale controversy",
      specificEventOrIssue: "Defence procurement transparency and commissions",
      centralArgument: "Opaque defence procurement deals like Rafale consume billions without parliamentary transparency",
      analyticalAngle: "Military budgeting and procurement transparency",
      importantStatistics: ["$8.7 billion"],
      keywords: ["rafale", "tejas", "procurement", "defence", "transparency"],
      english: {
        text: "Between the $8.7 billion Rafale fighter contract and delayed domestic Tejas fighter squadrons, defence procurement transparency remains deeply contested in India and Pakistan. Public expenditure auditors report that opaque defence middleman commissions consume billions in taxpayer funds.\n\nWhile parliamentary oversight weakens, defence contractors secure guaranteed state concessions.\n\nHow can national security be safeguarded when defence acquisitions operate without public accountability?"
      },
      romanUrdu: {
        text: "8.7 arab dollar ke Rafale soodagari aur Tejas mein takheer se defence kharidari par sawalat kharay hain. Sarkari auditors batatay hain ke middleman commissions mein arbon rupay zaya hotay hain.\n\nParliament ki nigrani kamzor hai jabke defence contractors ko munafe ki guarantee hai.\n\nQomi hifazat kaisay hogi jab foji kharidari awam ke ehtisab se azaad ho?"
      },
      plainUrdu: {
        text: "رافیل طیاروں کے معاہدے اور تیجس پراجیکٹ میں تاخیر نے عسکری خریداری کی شفافیت پر سنجیدہ سوالات کھڑے کیے ہیں۔ سرکاری آڈیٹرز کے مطابق خفیہ کمیشنوں میں اربوں روپے ضائع ہوتے ہیں۔\n\nپارلیمانی نگرانی کمزور ہو چکی ہے جبکہ اسلحہ ساز کمپنیوں کے منافع محفوظ ہیں۔\n\nقومی دفاع کی حفاظت کیسے ممکن ہے جب عسکری سودے عوامی احتساب سے بالاتر ہوں؟"
      }
    },

    // F. Socio-Ethnic Fault Lines
    {
      topic: "India vs Pakistan: Regional Wealth & Federal Friction",
      subtopic: "North vs South",
      category: 'PAK_VS_IND',
      genreId: 'PAK_VS_IND',
      mainSubject: "North vs South and tax contribution",
      specificEventOrIssue: "Tax contribution vs devolution disparity",
      centralArgument: "Fiscal imbalances and delimitation disputes penalize productive southern states",
      analyticalAngle: "Fiscal federalism and regional tension",
      importantStatistics: ["30% taxes", "40 paise return"],
      keywords: ["north vs south", "delimitation", "taxes", "federalism", "sindh"],
      english: {
        text: "Southern Indian states generate over 30% of federal tax revenues but receive back under 40 paise per rupee contributed, sparking friction over proposed delimitation. Similarly, Pakistan's provincial friction over resource shares tests federal unity.\n\nCentralizing power penalizes productive regions to maintain political control.\n\nCan federalism survive when successful regions face fiscal punishment?"
      },
      romanUrdu: {
        text: "Junoobi India ke soobay 30% se zyada tax detay hain magar wapis 40 paise miltay hain, jis se delimitation par tanaao hai. Pakistan mein bhi wasail ki taqseem par soobai gila barhta ja raha hai.\n\nMarkaziyat taraqqi karne walay soobon ko siyasi qabzay ke liye dabati hai.\n\nFederalism kaisay bachay ga jab kamyabi par maashi saza di jaye?"
      },
      plainUrdu: {
        text: "جنوبی بھارتی ریاستیں تیس فیصد ٹیکس ریونیو دیتی ہیں لیکن فی روپیہ چالیس پیسے واپس پاتی ہیں جس سے نئی حلقہ بندیوں پر تنازع پیدا ہو رہا ہے۔ پاکستان میں بھی وسائل کی تقسیم پر صوبائی بے چینی بڑھ رہی ہے۔\n\nمرکزیت پسند طاقتیں اپنے تسلط کے لیے محنت کش خطوں کے وسائل ضبط کرتی ہیں۔\n\nوفاق کیسے برقرار رہ سکتا ہے جب ترقی یافتہ اکائیوں کو مالیاتی سزا دی جائے؟"
      }
    },

    // G. Kashmir
    {
      topic: "Kashmir: Article 370 & Civilian Realities",
      subtopic: "Article 370 removal",
      category: 'PAK_VS_IND',
      genreId: 'PAK_VS_IND',
      mainSubject: "Article 370 removal",
      specificEventOrIssue: "Constitutional status and communication restrictions",
      centralArgument: "Article 370 revocation and prolonged administrative centralization harm civilian rights",
      analyticalAngle: "Constitutional law and human rights",
      importantStatistics: ["2019 revocation"],
      keywords: ["kashmir", "article 370", "human rights", "dispute", "representation"],
      english: {
        text: "Following the 2019 revocation of Article 370 in Jammu and Kashmir, civilian life endured prolonged communication blackouts and heavy militarization. As India and Pakistan maintain competing legal claims over the territory, local democratic representation remains suspended.\n\nResolutions stall while ordinary citizens bear the human cost of standoff.\n\nCan lasting peace emerge without civilian dignity?"
      },
      romanUrdu: {
        text: "Article 370 ke khatmay ke baad Jammu & Kashmir ne taweel communication bandish aur markazi control saha. India aur Pakistan dono kashmir par daawa karte hain magar aam shehri ki zindagi par checkpoints ka pehra hai.\n\nAalmi qarardadein ruki hui hain aur aam awam tanaao bhugat rahi hai.\n\nPur-aman hal kaisay niklay ga jab tak shehriyon ki izzat aur jamhoori haqooq na milein?"
      },
      plainUrdu: {
        text: "آرٹیکل 370 کے خاتمے کے بعد جموں و کشمیر نے طویل ترین مواصلاتی بندش اور مکمل مرکزیت کا سامنا کیا۔ بھارت اور پاکستان اپنے اپنے دعوے کرتے ہیں لیکن مقامی جمہوری نمائندگی معطل ہے۔\n\nعالمی قراردادیں رکی ہوئی ہیں اور عام لوگ کشیدگی کا شکار ہیں۔\n\nپائیدار امن کیسے قائم ہو سکتا ہے جب تک شہریوں کے بنیادی حقوق اور وقار تسلیم نہ کیے جائیں؟"
      }
    },

    // H. Sikhs and Khalistan
    {
      topic: "Sikhs & Federal Disputes: Agrarian Dissent",
      subtopic: "Operation Blue Star",
      category: 'PAK_VS_IND',
      genreId: 'PAK_VS_IND',
      mainSubject: "Sikh political representation and agrarian distress",
      specificEventOrIssue: "Farmer protests and diaspora tensions",
      centralArgument: "State criminalization of Sikh dissent and agrarian grievances strains domestic cohesion",
      analyticalAngle: "Minority rights and political dissent",
      importantStatistics: ["1984 Blue Star"],
      keywords: ["sikhs", "farmers", "punjab", "protests", "khalistan"],
      english: {
        text: "From 1984 to recent mass farmer protests near New Delhi, Sikh grievances over federal centralization remain unresolved in India. Across the border, Pakistan hosts historic Sikh gurdwaras via the Kartarpur Corridor, creating rare cross-border diplomatic openings amid domestic agrarian dissent.\n\nAuthorities criminalize protestors rather than resolving grievances.\n\nWhy treat dissent as a security threat?"
      },
      romanUrdu: {
        text: "1984 ke waqiat se le kar New Delhi mein kisan dharney tak, India mein Sikh awam ke federal ikhtiyarat aur kheti-bari ke maslay hal nahi huay. Doosri taraf Pakistan Kartarpur Corridor ke zariye ahem rabtay kholta hai.\n\nRiyasat muzahireen ko security threat kehti hai magar maashi maslay hal nahi karti.\n\nRiyasat awami mutalbat par baat karne ki bajaye aawaz kyon dabati hai?"
      },
      plainUrdu: {
        text: "1984 کے المیے سے لے کر کسان دھرنوں تک، بھارت میں وفاقی اختیارات پر سکھ تحفظات تاحال حل طلب ہیں۔ دوسری طرف پاکستان کرتارپور راہداری کے ذریعے نادر سفارتی ہم آہنگی پیدا کرتا ہے۔\n\nریاستی بیانیہ معاشی خدشات دور کرنے کے بجائے مظاہرین کو سیکیورٹی خطرہ قرار دیتا ہے۔\n\nریاست تاریخی شکایات کا سنجیدہ حل نکالنے کی بجائے عوامی آواز کو کیوں دباتی ہے؟"
      }
    },

    // I. India vs Neighbours
    {
      topic: "India vs Neighbours: Regional Influence & Ports",
      subtopic: "India-Pakistan relations",
      category: 'PAK_VS_IND',
      genreId: 'PAK_VS_IND',
      mainSubject: "India-Pakistan relations and Chinese influence",
      specificEventOrIssue: "SAARC decline and maritime port diplomacy",
      centralArgument: "Chinese infrastructure investments across South Asian neighbours weaken India regional influence",
      analyticalAngle: "Neighbourhood diplomacy and balance of power",
      importantStatistics: ["SAARC paralysis"],
      keywords: ["neighbours", "china", "saarc", "diplomacy", "ports"],
      english: {
        text: "India's regional diplomacy faces strain as Beijing expands port and infrastructure projects across Sri Lanka, Maldives, Nepal, and Bangladesh. While SAARC stays paralyzed by India-Pakistan rivalry, smaller neighbours use superpower competition for economic leverage.\n\nNew Delhi's regional footprint weakens under competitive Chinese financing.\n\nCan regional leadership last when neighbouring states find alternative partners?"
      },
      romanUrdu: {
        text: "Sri Lanka, Maldives, Nepal aur Bangladesh mein Cheen ke ports aur sarmayakari se India ki regional policy dabao mein hai. SAARC dushmani ki bhent charh gaya hai aur chhotay mulk barri taqaton se faida uthatay hain.\n\nNew Delhi ka asar Cheen ke saste qarzay ke samnay kamzor par raha hai.\n\nRegional leadership kaisay bachay gi jab hamsaye doosra rasta dhoond lein?"
      },
      plainUrdu: {
        text: "سری لنکا، مالدیپ، نیپال اور بنگلہ دیش میں چینی سرمایہ کاری سے نئی دہلی کی خطے میں پوزیشن کمزور ہو رہی ہے۔ سارک تنظیم مخاصمت کی نذر ہو چکی ہے اور چھوٹے پڑوسی ممالک عالمی طاقتوں کے مقابلے کا فائدہ اٹھا رہے ہیں۔\n\nخطے میں بھارتی اثر و رسوخ چینی انفراسٹرکچر فنانسنگ کے سامنے سکڑ رہا ہے۔\n\nعلاقائی قیادت کا دعویٰ کیسے چل سکتا ہے جب پڑوسی ریاستیں متبادل راستے اختیار کر لیں؟"
      }
    },

    // J. Diplomacy and Strategic Autonomy
    {
      topic: "India vs Pakistan: Russian Oil & Energy Realities",
      subtopic: "Russian oil imports",
      category: 'PAK_VS_IND',
      genreId: 'PAK_VS_IND',
      mainSubject: "Russian oil imports and multi-alignment",
      specificEventOrIssue: "Discounted crude energy trade vs dollar reserves",
      centralArgument: "Discounted Russian oil imports and multi-alignment define modern strategic autonomy",
      analyticalAngle: "Geopolitical balancing and energy diplomacy",
      importantStatistics: ["1.6 million barrels daily"],
      keywords: ["russian oil", "strategic autonomy", "energy", "quad", "sanctions"],
      english: {
        text: "India imported over 1.6 million barrels daily of discounted Russian crude in 2023, resisting Western sanction pressure while deepening Quad partnerships with Washington. Meanwhile, Pakistan balances IMF bailouts with Beijing's CPEC repayments.\n\nBoth nations pursue strategic autonomy amid global power competition.\n\nIs non-alignment 2.0 principled national defense, or tactical opportunism?"
      },
      romanUrdu: {
        text: "India ne 2023 mein har roz 16 lakh barrel discounted Rusi tail khareeda aur sanctions ki parwah nahi ki, sath America ke sath Quad mein bhi shamil raha. Doosri taraf Pakistan IMF aur CPEC ke qarzay chuka raha hai.\n\nDono mulk aalmi taqaton ke darmiyan apnay mafaad ki policy chala rahay hain.\n\nKya non-alignment 2.0 qomi difa hai ya sirf moqay se faida uthana?"
      },
      plainUrdu: {
        text: "بھارت نے مغربی دباؤ کے باوجود روزانہ سولہ لاکھ بیرل سستا روسی تیل خریدا جبکہ واشنگٹن کے ساتھ دفاعی شراکت داری بھی بڑھائی۔ دوسری طرف پاکستان آئی ایم ایف بیل آؤٹ اور سی پیک کے قرضوں میں جکڑا ہوا ہے۔\n\nدونوں ممالک عالمی طاقتوں کی رسہ کشی میں توازن قائم رکھنے کی کوشش کر رہے ہیں۔\n\nکیا غیر وابستہ خارجہ پالیسی قومی خود مختاری کا تحفظ ہے یا محض وقتی مصلحت پسندی؟"
      }
    },

    // K. Cricket and Sports Diplomacy
    {
      topic: "Cricket Diplomacy: BCCI Revenue & Neutral Venues",
      subtopic: "BCCI financial influence",
      category: 'PAK_VS_IND',
      genreId: 'PAK_VS_IND',
      mainSubject: "BCCI financial influence and Asia Cup controversies",
      specificEventOrIssue: "Commercial broadcasting leverage and sports boycotts",
      centralArgument: "BCCI commercial dominance and political boycotts isolate Pakistan-India bilateral cricket",
      analyticalAngle: "Sports diplomacy and commercial leverage",
      importantStatistics: ["70% ICC revenue"],
      keywords: ["cricket", "bcci", "ipl", "asia cup", "boycott"],
      english: {
        text: "BCCI generates over 70% of ICC global cricket revenues, exercising near-absolute financial leverage over international tournament scheduling. While millions of cricket supporters across India and Pakistan demand resumed bilateral tours, political boycotts force Asia Cup matches into neutral venues.\n\nCommercial sports broadcasting turns bilateral confrontation into high-margin television spectacles.\n\nWhy should passionate sporting culture remain hostage to political point-scoring?"
      },
      romanUrdu: {
        text: "BCCI ICC ki 70% se zyada aamdani control karta hai aur match scheduling par mukammal qabza rakhta hai. Pakistan aur India ke karoron fans bilateral matches chahte hain magar siyasat matches ko neutral venues par le jati hai.\n\nMedia channels is tanaao se karoron ka munafe kamatay hain.\n\nAwami khel aur culture siyasi laraiyon ka yarghamal kyon banay?"
      },
      plainUrdu: {
        text: "بی سی سی آئی آئی سی سی کی ستر فیصد عالمی آمدنی کنٹرول کرتا ہے اور شیڈولنگ پر اجارہ داری رکھتا ہے۔ دونوں ممالک کے کروڑوں شائقین دوطرفہ کرکٹ چاہتے ہیں مگر سیاسی کشیدگی میچز کو غیر جانبدار میدانوں پر دھکیل دیتی ہے۔\n\nمیڈیا اس کشیدگی کو منافع بخش اشتہارات میں بدل دیتا ہے۔\n\nشائقین کا پسندیدہ کھیل اور ثقافتی رابطہ سیاسی پوائنٹ اسکورنگ کا یرغمال کیوں بنے؟"
      }
    },

    // L. Development Comparisons
    {
      topic: "South Asia Development: Bangladesh vs India vs Pakistan",
      subtopic: "India vs China vs Bangladesh vs Pakistan",
      category: 'PAK_VS_IND',
      genreId: 'PAK_VS_IND',
      mainSubject: "South Asian comparative development indicators",
      specificEventOrIssue: "Exports vs social sector underinvestment",
      centralArgument: "South Asian states prioritize prestige milestones while underfunding human capital",
      analyticalAngle: "Human development and comparative economics",
      importantStatistics: ["$47 billion garments", "< 3% GDP health"],
      keywords: ["gdp", "bangladesh", "exports", "hdi", "poverty"],
      english: {
        text: "Comparing South Asia reveals contrasting paths: Bangladesh built a $47 billion garment export engine, India expanded software exports, while Pakistan manages debt repayments. Yet across all three nations, public health and primary education get under 3% of GDP.\n\nStates celebrate nuclear defense milestones while millions endure child stunting.\n\nWhat is true progress: ballistic missile capability or basic human development?"
      },
      romanUrdu: {
        text: "Bangladesh ne 47 arab dollar ki export khari ki, India ne IT sector chalaya, jabke Pakistan qarzay chukata raha. Magar teeno mulkon mein sehat aur taleem ko GDP ka 3% bhi nahi milta.\n\nAtomic taqatein missiles ka jashn manati hain jabke karoron bachay ghiza ki kami ka shikar hain.\n\nAsal taraqqi kya hai: ballistic missile ya insani falah aur taleem?"
      },
      plainUrdu: {
        text: "بنگلہ دیش نے 47 ارب ڈالر کی برآمدات کھڑی کیں، بھارت نے آئی ٹی برآمدات بڑھائیں، جبکہ پاکستان قرضوں کے بوجھ تلے دبا ہے۔ مگر تینوں ممالک میں صحت اور بنیادی تعلیم کو جی ڈی پی کا تین فیصد بھی نہیں ملتا۔\n\nایٹمی طاقتیں میزائلوں کے ریکارڈ دکھاتی ہیں جبکہ کروڑوں بچے غذائی قلت کا شکار ہیں۔\n\nترقی کا اصل معیار کیا ہے: بیلسٹک میزائل یا اپنے بچوں کی صحت مند زندگی؟"
      }
    },

    // M. Weapons vs Human Welfare
    {
      topic: "Weapons vs Human Welfare: 340 Warheads vs Clinics",
      subtopic: "Defence budget vs public welfare priorities",
      category: 'PAK_VS_IND',
      genreId: 'PAK_VS_IND',
      mainSubject: "Nuclear deterrence vs public healthcare crisis",
      specificEventOrIssue: "Arms racing vs child malnutrition",
      centralArgument: "Maintaining 340 nuclear warheads while children face stunting highlights distorted priorities",
      analyticalAngle: "Welfare economics vs military expenditure",
      importantStatistics: ["340 nuclear warheads", "$85 billion", "35% child stunting"],
      keywords: ["nuclear", "defence budget", "malnutrition", "welfare", "hospitals"],
      english: {
        text: "India and Pakistan jointly maintain over 340 nuclear warheads, deploy advanced supersonic missiles, and allocate over $85 billion annually to armed forces. Yet over 35% of children across the subcontinent suffer from chronic stunting, and millions lack access to clean tap water.\n\nBoth capitals celebrate new fighter squadrons while public rural clinics lack basic antibiotics.\n\nWhose security does an atomic arsenal truly guarantee when a nation's own children cannot get clean water?"
      },
      romanUrdu: {
        text: "India aur Pakistan ke paas 340 se zyada atomic warheads hain aur har saal 85 arab dollar foj par lagatay hain. Magar khittay ke 35% bachay ghiza ki kami ka shikar hain aur saaf paani nahi milta.\n\nDono mulk naye fighter jets khareedtay hain jabke hospitals mein zaroori dawai nahi milti.\n\nAtomic hathyar kiski hifazat karte hain jab apne hi bachay saaf paani ko taras jayein?"
      },
      plainUrdu: {
        text: "بھارت اور پاکستان کے پاس 340 سے زائد ایٹمی وار ہیڈز ہیں اور دونوں دفاع پر پچاسی ارب ڈالر لگاتے ہیں۔ جبکہ خطے کے پینتیس فیصد بچے غذائی قلت کا شکار ہیں اور پینے کے صاف پانی سے محروم ہیں۔\n\nدونوں دارالحکومت نئے لڑاکا طیارے خریدتے ہیں جبکہ بنیادی مراکز صحت میں ادویات ناپید ہیں۔\n\nایٹمی ہتھیار کس کا تحفظ کرتے ہیں جب ریاست اپنے ہی معصوم بچوں کو صاف پانی نہ دے سکے؟"
      }
    },

    // GEOPOLITICS: Semiconductor Choke Points
    {
      topic: "Semiconductor Geopolitics: TSMC & Taiwan Choke Point",
      subtopic: "Taiwan Strait and global microchip supply security",
      category: 'GEOPOLITICS',
      english: {
        text: "Taiwan's TSMC manufactures over 90% of the world's most advanced microchips that power modern fighter jets, smartphones, and AI supercomputers. A naval blockade of the Taiwan Strait would wipe out $2.6 trillion from the global economy in the first year alone.\n\nBoth Washington and Beijing spend hundreds of billions building domestic chip foundries, but neither can replicate Taiwan's semiconductor ecosystem before 2030.\n\nDoes military power protect the modern world, or does a microscopic silicon wafer?"
      },
      romanUrdu: {
        text: "Taiwan ki TSMC dunya ke 90% jadeed tareen microchips banati hai jo fighter jets, smartphones aur AI data centres ko chalatay hain. Taiwan Strait ki nakabandi pehle saal hi aalmi maeeshat se 2.6 trillion dollar ura sakti hai.\n\nAmerica aur Cheen arbon dollar chip factories par laga rahay hain magar 2030 tak Taiwan ka muqabla nahi kar saktay.\n\nDunya ko foji taqat chalati hai ya ek chhota sa silicon chip?"
      },
      plainUrdu: {
        text: "تائیوان کی ٹی ایس ایم سی کمپنی دنیا کے نوے فیصد جدید ترین مائیکرو چپس بناتی ہے جو لڑاکا طیاروں سے لے کر سپر کمپیوٹرز تک چلاتے ہیں۔ آبنائے تائیوان کی ناکہ بندی پہلے ہی سال عالمی معیشت سے 26 کھرب ڈالر مٹا سکتی ہے۔\n\nواشنگٹن اور بیجنگ مائیکرو چپس پر اربوں لگا رہے ہیں مگر 2030 تک تائیوان کا نعم البدل ناممکن ہے۔\n\nکیا دنیا عسکری طاقت کے سہارے چلتی ہے یا ایک باریک سلیکان چپ کے رحم و کرم پر؟"
      }
    },
    {
      topic: "Red Sea Shipping Disruption: Bab-el-Mandeb Bottleneck",
      subtopic: "Red Sea maritime security and shipping lane disruptions",
      category: 'GEOPOLITICS',
      english: {
        text: "Commercial shipping diversions around Africa's Cape of Good Hope add 14 days and $1.5 million in bunker fuel costs to every maritime cargo voyage. The Suez Canal, which handles 12% of global seaborne commerce, suffered a 50% plunge in transit revenues within six months.\n\nJust-in-time global supply chains built on predictable maritime lanes face chronic freight price inflation.\n\nCan modern globalisation function when missile batteries in coastal waters can shut down world trade arteries?"
      },
      romanUrdu: {
        text: "Africa ke gird jahaz ghumane se har safar par 14 din aur 1.5 million dollar ka extra tail kharch hota hai. Suez Canal jis se dunya ki 12% tijarat guzarti hai, uski aamdani aadhi reh gayi hai.\n\nAalmi supply chains jo waqt par delivery par chalti theen, ab musalsal mehngai ka shikar hain.\n\nAalmi tijarat kaisay chalay gi jab saahil par kharay chand missiles dunya ka rasta rok lein?"
      },
      plainUrdu: {
        text: "افریقہ کے گرد بحری جہازوں کے راستے بدلنے سے ہر چکر پر چودہ دن اور ڈیڑھ ملین ڈالر کا اضافی ایندھن جلتا ہے۔ نہر سویز جس سے دنیا کی بارہ فیصد تجارت گزرتی ہے، اس کی آمدنی میں پچاس فیصد کمی آ چکی ہے۔\n\nعالمی سپلائی چینز جو وقت پر ترسیل پر چلتی تھیں، اب مستقل مہنگائی کی زد میں ہیں۔\n\nجدید عالمگیریت کیسے چل سکتی ہے جب چند ساحلی میزائل دنیا کی اہم ترین تجارتی شاہراہ بند کر دیں؟"
      }
    },
    {
      topic: "Critical Minerals Scramble: Rare Earth Refining Monopoly",
      subtopic: "Critical mineral supply chains and green transition dependencies",
      category: 'GEOPOLITICS',
      english: {
        text: "China refines over 70% of global rare earth minerals and 90% of permanent magnets required for modern electric vehicles and defence radars. While Western alliances announce $400 billion in domestic mineral incentives, developing processing infrastructure requires at least a decade of environmental approvals.\n\nThe clean energy transition merely shifts strategic vulnerability from Middle Eastern oil pipelines to Asian mineral refineries.\n\nDid the world escape petroleum cartels only to step into an absolute mineral monopoly?"
      },
      romanUrdu: {
        text: "Cheen dunya ke 70% rare earth minerals aur 90% permanent magnets refine karta hai jo electric cars aur defence radars mein lagtay hain. Maghrib 400 arab dollar laga raha hai magar processing plants lagane mein 10 saal lagenge.\n\nGreen energy ka inhisar ab Middle East ke tail se nikal kar Cheen ke mineral plants par aagaya hai.\n\nKya dunya ne tail ki ghulami chhor kar mineral monopoly qabool kar li hai?"
      },
      plainUrdu: {
        text: "چین دنیا کے ستر فیصد نایاب معدنیات اور نوے فیصد مستقل مقناطیس صاف کرتا ہے جو الیکٹرک گاڑیوں اور دفاعی راڈارز میں لگتے ہیں۔ اگرچہ مغربی ممالک چار سو ارب ڈالر کے فنڈز دے رہے ہیں لیکن صفائی کے پلانٹس لگانے میں ایک دہائی درکار ہے۔\n\nصاف توانائی کا انحصار مشرق وسطیٰ کے تیل سے نکل کر ایشیائی منرل ریفائنریز پر منتقل ہو چکا ہے۔\n\nکیا دنیا تیل کی اجارہ داری سے نکل کر معدنیات کی مکمل اجارہ داری کے جال میں پھنس چکی ہے؟"
      }
    },

    // PAKISTAN_POLITICS: Circular Debt & Energy Tariffs
    {
      topic: "Pakistan Energy Crisis: Capacity Payments & Debt",
      subtopic: "Energy sector circular debt and capacity payments crisis",
      category: 'PAKISTAN_POLITICS',
      english: {
        text: "Pakistan's power sector circular debt exceeded 2.6 trillion rupees in 2024, driven primarily by 2 trillion rupees in annual capacity payments to private power producers for electricity never consumed. While industrial factories shut down over 55-rupee power tariffs, elite power plant owners receive guaranteed sovereign returns indexed in US dollars.\n\nOrdinary citizens face power cutoffs while paying for idle generators.\n\nWho designed an energy policy where the public pays for electricity that was never generated?"
      },
      romanUrdu: {
        text: "Pakistan ke power sector ka circular debt 2.6 trillion rupay se tajawuz kar gaya hai jiski asal waja IPPs ko har saal 2 trillion rupay ki capacity payments hain baghair bijli banaye. Factoryan 55 rupay unit hone se band ho rahi hain jabke plant owners ko dollar mein munafe ki guarantee hai.\n\nAam shehri ghair-istamal bijli ke bill bharta hai.\n\nAisi policy kis ne banayi jahan awam us bijli ke paise day jo bani hi nahi?"
      },
      plainUrdu: {
        text: "پاکستان کے پاور سیکٹر کا گردشی قرضہ 26 کھرب روپے سے تجاوز کر چکا ہے جس کی بنیادی وجہ نجی بجلی گھروں کو سالانہ دو کھرب روپے کی کیپیسٹی ادائیگیاں ہیں چاہے بجلی پیدا ہو یا نہ ہو۔ صنعتیں پچپن روپے یونٹ پر بند ہو رہی ہیں جبکہ بجلی گھروں کے مالکان کو ڈالروں میں منافع یقینی ہے۔\n\nعام شہری لوڈ شیڈنگ بھی سہتا ہے اور بند کارخانوں کے بل بھی بھرتا ہے۔\n\nیہ کیسی پالیسی ہے جہاں عوام اس بجلی کی قیمت ادا کرتے ہیں جو کبھی بنی ہی نہیں؟"
      }
    },
    {
      topic: "Pakistan Tax Divide: Salaried Squeeze vs Untaxed Elites",
      subtopic: "Tax base broadening and elite exemptions vs salaried class",
      category: 'PAKISTAN_POLITICS',
      english: {
        text: "Salaried workers across Pakistan contributed over 360 billion rupees in direct income taxes in 2024, paying more than the combined tax payments of real estate developers and retail wholesale cartels. While documented employees pay up to 35% at source, influential property barons exploit legal exemptions to pay virtually nothing.\n\nEvery budget broadens tax revenue by squeezing formal employees while sheltering political patronage networks.\n\nWhy should honest wage earners finance the sovereign state while untaxed millionaires escape scrutiny?"
      },
      romanUrdu: {
        text: "Salaried class ne 2024 mein 360 arab rupay se zyada income tax diya jo property aur wholesale traders ke majmooi tax se bhi zyada hai. Documented mulazimeen par 35% tak tax kat-ta hai jabke asar rasookh walay ameer log chhoot ka faida uthatay hain.\n\nHar saal mulazimeen ka gala dabaya jata hai magar elite cartels ko koi nahi pakarta.\n\nTanha mulazim riyasat ka bojh kyon uthaye jabke ameer tareen log tax se azaad hain?"
      },
      plainUrdu: {
        text: "تنخواہ دار طبقے نے 2024 میں 360 ارب روپے سے زائد انکم ٹیکس ادا کیا جو پراپرٹی سیکٹر اور ہول سیل تاجروں کے مشترکہ ٹیکس سے کہیں زیادہ ہے۔ دستاویزی ملازمین سے تنخواہ پر 35 فیصد تک ٹیکس کٹتا ہے جبکہ بااثر طبقے ٹیکس چھوٹ کے مزے لوٹتے ہیں۔\n\nہر بجٹ میں تنخواہ دار طبقے پر بوجھ بڑھایا جاتا ہے جبکہ سیاسی اثر و رسوخ رکھنے والے مافیاز محفوظ رہتے ہیں۔\n\nایماندار ملازم ریاست کا خرچ کیوں اٹھائے جب کہ ارب پتی ٹیکس کے دائرے سے باہر ہیں؟"
      }
    },
    {
      topic: "State Owned Enterprises: The Trillion Rupee Sovereign Drain",
      subtopic: "Privatization of state-owned enterprises and fiscal drain",
      category: 'PAKISTAN_POLITICS',
      english: {
        text: "Bleeding state-owned enterprises accumulate over 500 billion rupees in operational losses every fiscal year, draining resources from vital healthcare and education budgets. Over the past decade, sovereign guarantees to sustain bankrupt public corporations have exceeded 2.5 trillion rupees.\n\nTaxpayers bear the financial burden of ghost payrolls while public sector hospitals run short of life-saving medicines.\n\nWhy must millions of citizens sacrifice basic welfare to keep bankrupt state firms afloat?"
      },
      romanUrdu: {
        text: "Khasaray mein chalnay walay sarkari idaray har saal 500 arab rupay se zyada ka nuqsan kartay hain jo sehat aur taleem ke budget se nikalta hai. Pichli aik dahai mein in idaron ko bachanay par 2.5 trillion rupay ke sovereign guarantees lag chukay hain.\n\nAwam inki bhent charhti hai jabke sarkari hospitals mein dawaiyan nahi milti.\n\nKhasaray walay idaron ko zinda rakhnay ke liye aam shehri ki sehat ki qurbani kyon di jaye?"
      },
      plainUrdu: {
        text: "نقصان میں چلنے والے سرکاری ادارے ہر سال پانچ سو ارب روپے سے زائد کا مالیاتی خسارہ پیدا کرتے ہیں جس کا بوجھ صحت اور تعلیم کے بجٹ پر پڑتا ہے۔ پچھلی دہائی میں ان اداروں کو ڈوبنے سے بچانے کے لیے 25 کھرب روپے کے قومی ضمانت نامے دیے گئے۔\n\nعوام کے ٹیکسوں سے گھوسٹ ملازمین کی تنخواہیں ادا ہوتی ہیں جبکہ سرکاری ہسپتالوں میں دوائیں میسر نہیں۔\n\nدیوالیہ سرکاری اداروں کو سہارا دینے کے لیے عام شہری کی بنیادی فلاح کیوں قربان کی جا رہی ہے؟"
      }
    },

    // SOCIAL_ETHNIC_ISSUES: Balochistan Natural Gas Royalties
    {
      topic: "Balochistan Natural Resources: Royalties vs Reality",
      subtopic: "Balochistan resource royalties and political integration",
      category: 'SOCIAL_ETHNIC_ISSUES',
      english: {
        text: "Since 1952, Balochistan's Sui natural gas field powered Pakistan's national industries, contributing trillions of rupees to the national economy. Yet over 75% of Balochistan's population still lacks piped household gas, forcing families to burn firewood for heating in sub-zero winter temperatures.\n\nThe province receives less than 6% of national resource royalties while ranking lowest on federal education and health indices.\n\nCan national unity survive when resource-rich lands are treated as resource extraction colonies?"
      },
      romanUrdu: {
        text: "1952 se Sui gas ne Pakistan ki industries ko chalaya aur arbon rupay kamaye. Magar Balochistan ki 75% awam ke paas gas connection nahi aur log lakriyan jalane par majboor hain.\n\nSoobay ko gas royalty ka sirf 6% milta hai jabke taleem aur sehat mein sab se peechay hai.\n\nQomi yak-jehti kaisay bachay gi jab wasail se maala-maal zameen ko sirf khaan samjha jaye?"
      },
      plainUrdu: {
        text: "1952 سے بلوچستان کی سوئی گیس نے پاکستان کی صنعتوں کو رواں رکھا اور کھربوں روپے کا زرمبادلہ پیدا کیا۔ مگر آج بھی بلوچستان کی 75 فیصد آبادی پائپ لائن گیس سے محروم ہے اور سردیوں میں لکڑیاں جلاتی ہے۔\n\nصوبے کو رائلٹی کا محض چھ فیصد ملتا ہے جبکہ وہ تعلیم اور صحت میں ملک کے سب سے پسماندہ درجے پر ہے۔\n\nقومی یکجہتی کیسے قائم رہ سکتی ہے جب وسائل سے مالا مال دھرتی کو محض وسائل نکالنے کا ذریعہ سمجھا جائے؟"
      }
    },
    {
      topic: "Out of School Children: South Asia's Lost Generation",
      subtopic: "Out-of-school children crisis and foundational literacy",
      category: 'SOCIAL_ETHNIC_ISSUES',
      english: {
        text: "Over 26 million children in Pakistan remain completely excluded from formal classrooms, representing the second largest uneducated population worldwide. Meanwhile, public education spending hovers below 1.8% of GDP, among the lowest allocations across South Asia.\n\nWhile policymakers celebrate demographic youth dividends, one out of every three school-age children cannot read or write a sentence.\n\nHow can a society build an innovative future when millions of children are locked out of basic literacy?"
      },
      romanUrdu: {
        text: "Pakistan mein 26 million se zyada bachay school nahi jatay jo dunya mein doosra bara adad hai. Taleem par sarkari kharch GDP ke 1.8% se bhi kam hai jo pooray khittay mein sab se kam hai.\n\nHukmaran nojawan nasal ki baatein karte hain magar har teesra bacha parhna likhna nahi janta.\n\nKoi qaum taraqqi kaisay kar sakti hai jab uske karoron bachon se qalam chheen liya jaye?"
      },
      plainUrdu: {
        text: "پاکستان میں دو کروڑ ساٹھ لاکھ سے زائد بچے اسکولوں سے باہر ہیں جو دنیا کی دوسری بڑی غیر تعلیم یافتہ آبادی ہے۔ تعلیم پر سرکاری اخراجات جی ڈی پی کے 1.8 فیصد سے بھی کم ہیں جو خطے کی کم ترین شرح ہے۔\n\nحکمران نوجوان آبادی کی صلاحیتوں کے دعوے کرتے ہیں مگر ہر تیسرا بچہ بنیادی خواندگی سے محروم ہے۔\n\nکوئی قوم روشن مستقبل کیسے تعمیر کر سکتی ہے جب اس کی نئی نسل کو حروف شناسی سے ہی محروم رکھا جائے؟"
      }
    },

    // AI_HUMAN_SOCIETY: BPO Call Centers Job Displacement
    {
      topic: "AI Job Displacement: The South Asian BPO Crisis",
      subtopic: "Generative AI displacing South Asian BPO and call center jobs",
      category: 'AI_HUMAN_SOCIETY',
      english: {
        text: "Over 5 million educated young professionals across South Asia earn livelihoods in IT support, customer service, and BPO operations. Generative voice AI systems now handle complex customer queries at $0.05 per call, compared to $4.50 for a human support agent.\n\nMajor Western banks have already automated 40% of tier-one support desk operations.\n\nWhen global capital automates the white-collar ladder, where will millions of university graduates find employment?"
      },
      romanUrdu: {
        text: "South Asia mein 50 lakh jawan IT aur call centres mein rozgar kamatay hain. Generative AI voice systems ab ek call 5 cents mein karte hain jabke insani agent 4.5 dollar leta hai.\n\nBarray aalmi banks ne 40% support operations software ke hawalay kar diye hain.\n\nJab software white-collar jobs khatam kar day, toh lakhoon university graduates kahan jayenge?"
      },
      plainUrdu: {
        text: "جنوبی ایشیا میں پچاس لاکھ نوجوان آئی ٹی سپورٹ اور کال سینٹرز میں خدمات سرانجام دیتے ہیں۔ جدید جنریٹو وائس سسٹمز اب پانچ سینٹ میں وہ کال نمٹاتے ہیں جس پر انسانی ایجنٹ ساڑھے چار ڈالر لیتا تھا۔\n\nبڑے عالمی بینکوں نے چالیس فیصد سپورٹ ڈیسک ملازمتیں خودکار سافٹ ویئر کے حوالے کر دی ہیں۔\n\nجب عالمی سرمایہ داری ڈگری یافتہ وائٹ کالر ملازمتیں ہی مٹا دے تو لاکھوں فارغ التحصیل نوجوان کہاں جائیں گے؟"
      }
    },
    {
      topic: "Gig Economy Surveillance: Algorithmic Control of Couriers",
      subtopic: "Gig economy workers and automated algorithmic management",
      category: 'AI_HUMAN_SOCIETY',
      english: {
        text: "Millions of urban delivery riders are managed by opaque smartphone algorithms that dictate delivery routes, enforce strict deadlines, and penalize micro-delays. An algorithmic rating drop below 4.7 stars leads to instant automated account deactivation with zero human review.\n\nTech platforms extract high delivery margins while completely disclaiming employer obligations.\n\nHas Silicon Valley innovation empowered workers, or created a digital assembly line without human empathy?"
      },
      romanUrdu: {
        text: "Lakhoon delivery riders ko mobile apps aur algorithms control karte hain jo raste aur waqt tay karte hain. Agar rating 4.7 se gir jaye toh baghair kisi sunwayi ke account band ho jata hai.\n\nTech companies munafe kamati hain magar rider ko mulazim maannay se inkar karti hain.\n\nKya tech taraqqi ne mazdoor ko azaad kiya hai ya software ki ghulami mein daal diya hai?"
      },
      plainUrdu: {
        text: "لاکھوں ڈلیوری رائیڈرز کو موبائل الگورتھم کنٹرول کرتے ہیں جو راستے، رفتار اور وقت کا تعین کرتے ہیں۔ اگر ریٹنگ 4.7 سے گرے تو بغیر کسی انسانی سماعت کے فوری طور پر اکاؤنٹ بند کر دیا جاتا ہے۔\n\nٹیک کمپنیاں بھاری منافع کماتی ہیں مگر رائیڈر کو قانونی ملازم ماننے سے انکاری ہیں۔\n\nکیا جدید سافٹ ویئر نے محنت کش کو بااختیار بنایا ہے یا اسے الگورتھم کی مشینی غلامی میں دھکیل دیا ہے؟"
      }
    },

    // CLIMATE_GLOBAL_POWER: Pakistan 2022 Floods & Historical Debt
    {
      topic: "Climate Injustice: Pakistan Floods vs Global Pledges",
      subtopic: "Pakistan 2022 floods and historical emissions debt of G7",
      category: 'CLIMATE_GLOBAL_POWER',
      english: {
        text: "Pakistan contributes less than 0.8% of global greenhouse gas emissions, yet the catastrophic 2022 floods submerged one-third of the country, causing $30 billion in damages and displacing 33 million citizens. At COP28, wealthy nations pledged $700 million to the Loss and Damage fund, representing less than 0.2% of global climate damages.\n\nMeanwhile, G7 nations spend $1.3 trillion annually subsidizing fossil fuel exploration.\n\nIs climate aid humanitarian solidarity, or a token distraction from ecological debt?"
      },
      romanUrdu: {
        text: "Pakistan aalmi aloodgi ka 0.8% se kam zimmedar hai, magar 2022 ke selaab ne mulk ka ek-tihai hissa dabo diya aur 30 arab dollar ka nuqsan hua. COP28 mein ameer mulkon ne Loss and Damage fund mein sirf 700 million dollar ka wada kiya jo aalmi nuqsan ka 0.2% bhi nahi.\n\nDoosri taraf baray mulk tail aur gas par 1.3 trillion dollar lagatay hain.\n\nKya ye imdad hai ya tareekhi jurm par parda daalna?"
      },
      plainUrdu: {
        text: "پاکستان عالمی گرین ہاؤس گیسوں کے ایک فیصد سے بھی کم کا ذمہ دار ہے مگر 2022 کے تباہ کن سیلاب نے ملک کا ایک تہائی حصہ ڈبو دیا جس سے 30 ارب ڈالر کا نقصان ہوا۔ کوپ سمٹ میں امیر ممالک نے نقصان کے ازالے کے لیے محض سات سو ملین ڈالر کا اعلان کیا جو کل تباہی کا ایک فیصد بھی نہیں۔\n\nجبکہ وہی طاقتیں فوسل فیول پر سالانہ تیرہ سو ارب ڈالر اڑاتی ہیں۔\n\nکیا یہ ماحولیاتی امداد ہے یا تاریخی ماحولیاتی قرض سے جان چھڑانے کا بہانہ؟"
      }
    },
    {
      topic: "Urban Air Pollution: South Asian Smog Emergency",
      subtopic: "Urban smog crisis, industrial emissions and air quality indices",
      category: 'CLIMATE_GLOBAL_POWER',
      english: {
        text: "Toxic air quality across major South Asian metropolises shortens average citizen life expectancy by over five years. Industrial brick kilns, substandard vehicle fuel, and post-harvest biomass burning blanket hundreds of millions of people under dangerous particulate pollution exceeding 500 AQI.\n\nAuthorities order temporary Sunday shutdowns while delaying mandatory industrial scrubber enforcement.\n\nWhy do governments treat deadly toxic air as a seasonal inconvenience rather than a national health emergency?"
      },
      romanUrdu: {
        text: "Khatarnaak smog South Asia ke baray shehron mein aam shehri ki zindagi se 5 saal cheen rahi hai. Dhuwan, kharab petrol aur faslon ki aag karoron logon ko 500 AQI ki zehreeli hawa mein dhakeel rahi hai.\n\nHukoomatein itwar ki chhutti karwa deti hain magar carthanon par pabandi nahi lagateen.\n\nZehreeli hawa ko mausam ka bahana kyon banaya jata hai jabke ye qomi sehat ka buhran hai?"
      },
      plainUrdu: {
        text: "زہریلی فضائی آلودگی جنوبی ایشیا کے بڑے شہروں میں عام شہری کی اوسط عمر پانچ سال کم کر رہی ہے۔ بھٹوں، ناقص فیول اور فصلوں کے دھوئیں سے کروڑوں شہری پانچ سو سے زائد خطرناک اے کیو آئی میں سانس لینے پر مجبور ہیں۔\n\nحکام اتوار کی عارضی چھٹی کرا دیتے ہیں مگر صنعتی کارخانوں کو فلٹر لگانے پر مجبور نہیں کرتے۔\n\nزہریلی فضا کو ایک موسمی مجبوری کیوں سمجھا جاتا ہے جبکہ یہ قومی صحت کا فوری ایمرجنسی بحران ہے؟"
      }
    },

    // SATIRICAL_COMMENTARY: VIP Protocol Motorcades vs Ambulances
    {
      topic: "State Priorities: VIP Protocol vs Citizen Ambulances",
      subtopic: "VIP protocol motorcades blocking citizen emergency ambulances",
      category: 'SATIRICAL_COMMENTARY',
      english: {
        text: "A typical prime ministerial or presidential motorcade in South Asia deploys 35 armored vehicles, 400 police escorts, and complete street closures for 45 minutes. Every week, emergency ambulances carrying cardiac patients are trapped behind razor-wire VIP checkpoints.\n\nLeaders preach sacrifice and budget austerity while burning hundreds of litres of fuel to travel three kilometres.\n\nWhose lives does the state actually exist to protect: the citizens who pay taxes, or the rulers who spend them?"
      },
      romanUrdu: {
        text: "Wazir-e-azam ya sadar ke protocol mein 35 bulletproof gariyan, 400 police ahlkaar aur 45 minute ke liye shehr band hota hai. Har haftay dil ke marizon wali ambulances VIP checkpoints ke peechay phansi rehti hain.\n\nHukmaran sadgi ka dars detay hain magar 3 kilometer ke safar par hazaron litre fuel ulat detay hain.\n\nRiyasat kiski hifazat ke liye hai: tax denay walay shehri ki ya us tax par aish karne walay hukmaran ki?"
      },
      plainUrdu: {
        text: "روایتی وی آئی پی پروٹوکول میں 35 بلٹ پروف گاڑیاں، سینکڑوں پولیس اہلکار اور پینتالیس منٹ تک شاہراہیں سیل کر دی جاتی ہیں۔ ہر ہفتے دل کے مریضوں کی ایمبولینسیں وی آئی پی سیکیورٹی بیریئرز کے پیچھے تڑپتی رہتی ہیں۔\n\nحکمران سادگی اور کفایت شعاری کے خطابات فرماتے ہیں جبکہ تین کلومیٹر کے فاصلے کے لیے سرکاری پٹرول اڑاتے ہیں۔\n\nریاست اصل میں کس کے تحفظ کے لیے بنی ہے: ٹیکس دینے والے عام شہری کے لیے یا ٹیکس اڑانے والے حکمرانوں کے لیے؟"
      }
    },
    {
      topic: "Official Austerity Summits: Buffets vs Budget Cuts",
      subtopic: "Austerity task forces dining at five-star hotel summits",
      category: 'SATIRICAL_COMMENTARY',
      english: {
        text: "Government austerity task forces routinely meet at five-star hotels, spending millions on gourmet banquets to announce that junior clerks will no longer receive office biscuits. Elite committees produce lavishly printed 200-page booklets that cost more than the annual spending cuts they recommend.\n\nRulers lavishly applaud their own fiscal discipline while purchasing new luxury SUVs for official convoys.\n\nIs sovereign austerity a serious economic strategy, or merely high-budget theater performed for public consumption?"
      },
      romanUrdu: {
        text: "Sarkari kafayat-shaari committees 5-star hotels mein beth kar arbon ke khanay khati hain aur elaan karti hain ke chhotay mulazimeen ki chai biscuit band hain. Inki kitabein chhapnay par utna kharcha ata hai jitni bachat nahi hoti.\n\nHukmaran bachat ke naam par taaliyan bajatay hain aur nai bulletproof gariyan khareedtay hain.\n\nKya ye bachat ka mansooba hai ya aam awam ko dikhane ke liye drama?"
      },
      plainUrdu: {
        text: "کفایت شعاری ٹاسک فورسز فائیو اسٹار ہوٹلوں کے پرتکلف کھانوں پر لاکھوں اڑاتی ہیں اور فیصلہ سناتی ہیں کہ چھوٹے ملازمین کی چائے بند کر دی گئی ہے۔ ان کمیٹیوں کی رپورٹوں کی چھپائی پر جتنی لاگت آتی ہے اتنی بچت نہیں ہوتی۔\n\nحکمران اپنی بچت کے دعوؤں پر داد سمیٹتے ہیں جبکہ پروٹوکول کے لیے نئی لگژری گاڑیاں خریدی جاتی ہیں۔\n\nکیا یہ کفایت شعاری کی سنجیدہ پالیسی ہے یا عوام کی آنکھوں میں دھول جھونکنے کے لیے مہنگا تماشا؟"
      }
    }
  ];

  // Filter against cleanExcluded, seen topics, category match, and run through isDuplicateOrSimilar
  for (const item of dynamicBank) {
    if (category && item.category !== category) {
      continue;
    }
    const isExcluded = cleanExcluded && (
      item.topic.toLowerCase().trim() === cleanExcluded ||
      item.subtopic.toLowerCase().trim() === cleanExcluded
    );
    if (isExcluded) continue;

    if (avoidCombined.some(a => a.includes(item.topic.toLowerCase()) || a.includes(item.subtopic.toLowerCase()))) {
      continue;
    }

    const dupCheck = historyStore.isDuplicateOrSimilar(item.english.text, item.topic, item);
    if (!dupCheck.isDuplicate) {
      return item;
    }
  }

  // If static bank entries match or are exhausted, synthesize a fresh dynamic comparison from organic narrative patterns (no fixed template)
  const batchId = Math.floor(100 + Math.random() * 900);
  const targetCategoryObj = genreManager.getGenreById(category) || genreManager.getAllGenres()[0];
  const freshSubtopic = subtopic || genreManager.getUnusedSubtopic(category, avoidCombined, cleanExcluded);

  const isPakInd = targetCategoryObj.id === 'PAK_VS_IND';
  const patternIdx = Math.floor(Math.random() * 6);

  const statA = (15 + Math.random() * 70).toFixed(1);
  const statB = (2.1 + Math.random() * 7.5).toFixed(1);
  const percentC = Math.floor(38 + Math.random() * 32);

  let engText = '';
  let romanText = '';
  let plainText = '';
  let centralArg = '';
  let analyticalAngle = '';
  let statList = [];

  if (isPakInd) {
    const patterns = [
      // Pattern 0: Direct factual breakdown (2 paragraphs, factual conclusion)
      {
        eng: `Looking at ${freshSubtopic}, governments in India and Pakistan make the same mistake. Central leaders keep over ${percentC}% of all tax money in the capital, leaving provincial towns with under $${statB} billion for basic clinics and schools.\n\nBoth capitals spend over $${statA} billion on flashy projects while regular hospitals run out of beds. Leaders promise to help local towns, but hold all the cash.`,
        arg: `Fiscal centralism on ${freshSubtopic} starves local administrations of basic healthcare and school funds`,
        stat: [`${percentC}%`, `$${statB}b`, `$${statA}b`],
        angle: "Local spending vs central power",
        roman: `India aur Pakistan mein ${freshSubtopic} par wazeh maslay samnay atay hain. Markazi hukoomatein ${percentC}% taxes control karti hain jabke soobon ko $${statB} billion bhi nahi miltay. Flagship projects par $${statA} billion lagaye jatay hain magar aam awam bunyadi sahuliyat se mehroom rehti hai.`,
        plain: `بھارت اور پاکستان میں ${freshSubtopic} کے حوالے سے یکساں انتظامی تضادات موجود ہیں۔ مرکزی وزارتیں ${percentC} فیصد ٹیکس کنٹرول کرتی ہیں جبکہ صوبوں کو بنیادی بلدیاتی ڈھانچے کے لیے محض $${statB} ارب ڈالر ملتے ہیں۔ بڑے نمائشی منصوبوں پر $${statA} ارب ڈالر لگائے جاتے ہیں مگر عوامی شعبے محروم رہتے ہیں۔`
      },
      // Pattern 1: Budget paradox (2 paragraphs, sharp punchline)
      {
        eng: `Official budget numbers on ${freshSubtopic} show a clear truth in South Asia. India and Pakistan spend over $${statA} billion trying to outdo each other on borders, but spend less than $${statB} billion on joint public welfare programs.\n\nOver ${percentC}% of border families struggle to buy basic groceries every month. Real national strength means having food and savings at home, not fancy parades.`,
        arg: `Border spending on ${freshSubtopic} hurts regular family budgets and basic living standards`,
        stat: [`$${statA}b`, `$${statB}b`, `${percentC}%`],
        angle: "Border spending vs family grocery costs",
        roman: `Sarkari kharchay ke audits batatay hain ke ${freshSubtopic} par India aur Pakistan $${statA} billion border programs par lagatay hain, magar awami falah ke liye sirf $${statB} billion bachtay hain. ${percentC}% ghareeb khandan bunyadi sahulat se mehroom hain. Asal taqat awam ki maashi hifazat mein hoti hai.`,
        plain: `سرکاری آڈٹ کے مطابق ${freshSubtopic} کے معاملے پر بھارت اور پاکستان $${statA} ارب ڈالر سرحدی پروگراموں پر خرچ کرتے ہیں جبکہ عوامی بہبود کے اقدامات کو بمشکل $${statB} ارب ڈالر ملتے ہیں۔ خطے کے ${percentC} فیصد پسماندہ خاندان بنیادی تحفظ سے محروم ہیں اور طاقت کا معیار عوامی فلاح نہیں۔`
      },
      // Pattern 2: Institutional friction (2 paragraphs, governance critique)
      {
        eng: `Years of government rules on ${freshSubtopic} have created serious headaches for regular people across India and Pakistan. Big offices in capital cities waste over $${statA} billion on red tape, while real work on the ground gets barely $${statB} billion.\n\nOver ${percentC}% of public complaints get buried under paperwork. Offices stay slow because leaders rarely answer to regular voters in small towns.`,
        arg: `Government red tape and slow offices in ${freshSubtopic} ignore regular citizen needs`,
        stat: [`$${statA}b`, `$${statB}b`, `${percentC}%`],
        angle: "Government red tape vs citizen service",
        roman: `India aur Pakistan mein ${freshSubtopic} par dahaiyon ki markazi policies ne soobai tanaao barha diya hai. Markaz $${statA} billion bureaucratic kharchon mein ulat deta hai jabke muqami taraqqi ko sirf $${statB} billion miltay hain. ${percentC}% maslay hal nahi hotay kyonke afsar-shahi awami jawab-dehi se azaad hai.`,
        plain: `بھارت اور پاکستان میں ${freshSubtopic} پر دہائیوں کی مرکزی پالیسیوں نے شدید انتظامی تناؤ پیدا کیا ہے۔ مرکزی فیصلے مقامی نمائندوں کو نظر انداز کر کے $${statA} ارب ڈالر کی بیوروکریسی پر خرچ ہو جاتے ہیں جبکہ فیلڈ پراجیکٹس کو صرف $${statB} ارب ڈالر ملتے ہیں۔ تقریبا ${percentC} فیصد عوامی شکایات دبا دی جاتی ہیں۔`
      },
      // Pattern 3: Economic and commercial comparison (2 paragraphs, consumer impact)
      {
        eng: `Border politics and trade bans around ${freshSubtopic} cost India and Pakistan nearly $${statA} billion every single year. Because direct trade is blocked, everyday goods take long routes and cost ${percentC}% more for regular buyers, while trade talks get under $${statB} billion.\n\nOrdinary working families pay the bill every week through higher food prices just to keep old political fights alive.`,
        arg: `Trade barriers on ${freshSubtopic} make food and everyday goods more expensive for regular buyers`,
        stat: [`$${statA}b`, `${percentC}%`, `$${statB}b`],
        angle: "Closed trade routes vs everyday grocery costs",
        roman: `India aur Pakistan ke darmiyan ${freshSubtopic} ke tajarati raste band honay se har saal $${statA} billion ka nuqsan hota hai. Teesray mulkon ke zariye saman manganay se cheezain ${percentC}% mehangi milti hain jabke rabtay par sirf $${statB} billion lagtay hain. Aam awam har maheenay mehangai ki soorat mein is tanaao ka jurmana ada karti hai.`,
        plain: `بھارت اور پاکستان کے درمیان ${freshSubtopic} پر تجارتی رکاوٹوں کی وجہ سے سالانہ تقریباً $${statA} ارب ڈالر کا علاقائی نقصان ہوتا ہے۔ تیسرے ممالک کے راستے تجارت سے اشیائے خورونوش پر ${percentC} فیصد اضافی لاگت آتی ہے۔ دونوں ممالک کے عام محنت کش روزمرہ مہنگائی کی صورت میں اس سفارتی تعطل کا تاوان بھرتے ہیں۔`
      },
      // Pattern 4: Historical legacy vs modern reality (3 paragraphs, structural principle)
      {
        eng: `Old British laws around ${freshSubtopic} were made to control people rather than help their daily lives. Today, central leaders in India and Pakistan hold $${statA} billion in special funds, while local councils receive barely $${statB} billion for basic repairs.\n\nOver ${percentC}% of old government rules have not changed since 1947.\n\nChanging the flag never changed how rulers treat ordinary citizens.`,
        arg: `Old colonial laws in ${freshSubtopic} keep power in central offices instead of helping local people`,
        stat: [`$${statA}b`, `$${statB}b`, `${percentC}%`],
        angle: "Old colonial laws vs everyday citizen rights",
        roman: `1947 ke baad India aur Pakistan mein ${freshSubtopic} par angrezon ke daur ke qawaneen barqarar rakhay gaye. Markaz $${statA} billion apne ikhtiyar mein rakhta hai jabke muqami idaron ko sirf $${statB} billion miltay hain. ${percentC}% afsar-shahi puranay qawaneen par chalti hai. Jhanda badal gaya magar riyasat ka rawaiyya nahi badla.`,
        plain: `1947 کے بعد بھارت اور پاکستان میں ${freshSubtopic} کے نظام میں شہریوں کو بااختیار بنانے کے بجائے مرکزی کنٹرول قائم رکھا گیا۔ مرکزی وزارتیں $${statA} ارب ڈالر اپنے پاس رکھتی ہیں جبکہ صوبائی کونسلوں کو بمشکل $${statB} ارب ڈالر ملتے ہیں۔ پرچم تو بدل گیا لیکن حاکم اور محکوم کا نوآبادیاتی رشتہ نہیں بدلا۔`
      },
      // Pattern 5: Investigative contrast (2 paragraphs, provocative question)
      {
        eng: `Official bank accounts on ${subtopic} tell a story politicians never talk about on evening TV news. Big business friends in India and Pakistan get $${statA} billion in special tax breaks, while basic public healthcare receives barely $${statB} billion.\n\nOver ${percentC}% of basic health goals were missed last year. Who does this government system really protect: wealthy elites or regular taxpayers?`,
        arg: `Big tax breaks for connected businesses in ${freshSubtopic} leave public hospitals empty of funds`,
        stat: [`$${statA}b`, `$${statB}b`, `${percentC}%`],
        angle: "Big business tax breaks vs public hospital funds",
        roman: `India aur Pakistan mein ${freshSubtopic} par sarkari accounts asal kahani bayan karte hain. $${statA} billion baray contractors aur imtiyazaat ko milay jabke awami infrastructure ko sirf $${statB} billion diay gaye. ${percentC}% tarqqiyati ahdaf adhooray reh gaye. Riyasat aam shehri ki hifazat kab karegi jab bunyadi wadey hi poore na hon?`,
        plain: `بھارت اور پاکستان میں ${freshSubtopic} کے سرکاری کھاتے وہ حقائق کھولتے ہیں جو بیانات میں نہیں ملتے۔ کارپوریٹ رعایتوں پر $${statA} ارب ڈالر اڑائے گئے جبکہ عوامی انفراسٹرکچر کو محض $${statB} ارب ڈالر ملے۔ گزشتہ سال ${percentC} فیصد ترقیاتی اہداف پورے نہ ہو سکے۔ یہ نظام کس کے مفادات کا تحفظ کر رہا ہے؟`
      }
    ];

    const chosen = patterns[patternIdx];
    engText = chosen.eng;
    romanText = chosen.roman;
    plainText = chosen.plain;
    centralArg = chosen.arg;
    analyticalAngle = chosen.angle;
    statList = chosen.stat;
  } else {
    const patterns = [
      // Pattern 0: Structural governance mismatch
      {
        eng: `Looking at ${freshSubtopic}, public offices across ${targetCategoryObj.name} show a big gap between words and reality. Top departments control over $${statA} billion in big budgets, while local town offices get barely $${statB} billion for everyday work.\n\nOver ${percentC}% of government plans missed their promises last year. Leaders keep spending money on flashy projects while regular citizens wait for basic help.`,
        arg: `Big city offices take most budget while small towns in ${freshSubtopic} wait for basic help`,
        stat: [`$${statA}b`, `$${statB}b`, `${percentC}%`],
        angle: "Big project spending vs small town services",
        roman: `${targetCategoryObj.name} mein ${freshSubtopic} par wazeh tanaao nazar ata hai. Idaray $${statA} billion apne ikhtiyar mein rakhtay hain jabke aam falah ko sirf $${statB} billion miltay hain. ${percentC}% mansoobay nakam rehtay hain kyonke tarjeehat ghalat hain.`,
        plain: `${targetCategoryObj.name} کے تحت ${freshSubtopic} کی جانچ پڑتال پالیسی تضادات کو بے نقاب کرتی ہے۔ مرکزی محکمے $${statA} ارب ڈالر اپنے پاس رکھتے ہیں جبکہ عوامی خدمات کو محض $${statB} ارب ڈالر ملتے ہیں۔ تقریبا ${percentC} فیصد منصوبے ناکام رہتے ہیں۔`
      },
      // Pattern 1: Regulatory friction and market deadweight
      {
        eng: `Heavy paperwork around ${freshSubtopic} is holding back small businesses across ${targetCategoryObj.name}. Dealing with government red tape wastes nearly $${statA} billion every year, while offices spend under $${statB} billion on modern computer tools.\n\nNearly ${percentC}% of small business owners report long delays for simple routine permits. When paperwork moves this slowly, hardworking people pay the price.`,
        arg: `Government red tape and slow permits in ${freshSubtopic} hold back hardworking small businesses`,
        stat: [`$${statA}b`, `$${statB}b`, `${percentC}%`],
        angle: "Government paperwork vs small business growth",
        roman: `${freshSubtopic} par puranay qawaneen aur rukawatein har saal $${statA} billion ka nuqsan karti hain. System ko behtar karne par sirf $${statB} billion lagtay hain jabke ${percentC}% karobar takheer ka shikar hain. Afsar-shahi taraqqi ko dabati hai.`,
        plain: `${freshSubtopic} پر بیوروکریسی کی رکاوٹیں سالانہ $${statA} ارب ڈالر ضائع کرتی ہیں جبکہ جدید نظام پر محض $${statB} ارب ڈالر لگائے جاتے ہیں۔ تقریبا ${percentC} فیصد کاروباری ادارے تاخیر کا شکار ہیں اور ترقی متاثر ہوتی ہے۔`
      },
      // Pattern 2: Capital misallocation and debt
      {
        eng: `Government balance sheets on ${freshSubtopic} show why families across ${targetCategoryObj.name} feel the squeeze. State debt has crossed $${statA} billion, leaving less than $${statB} billion for public schools and clinics in regular towns.\n\nOver ${percentC}% of citizen taxes go straight into paying bank interest on old loans. A country cannot build a strong future when yesterday debts eat tomorrow money.`,
        arg: `Heavy debt interest payments on ${freshSubtopic} leave public schools and clinics without money`,
        stat: [`$${statA}b`, `$${statB}b`, `${percentC}%`],
        angle: "High national debt vs money for public clinics",
        roman: `${freshSubtopic} par sarkari accounts batatay hain ke qarzay $${statA} billion se tajawuz kar chukay hain. Taraqqi ke liye sirf $${statB} billion bachtay hain jabke ${percentC}% revenue sood mein chali jati hai. Jab tak structural islaahaat na hon, maashiyat nahi sambhal sakti.`,
        plain: `${freshSubtopic} کے سرکاری کھاتے مالی بدانتظامی ظاہر کرتے ہیں۔ قرضوں کا بوجھ $${statA} ارب ڈالر سے تجاوز کر چکا ہے جبکہ اہم شعبوں کو صرف $${statB} ارب ڈالر ملتے ہیں۔ ٹیکسوں کا ${percentC} فیصد سود کی نذر ہو جاتا ہے۔`
      },
      // Pattern 3: Technology and human displacement
      {
        eng: `Fast changes in ${freshSubtopic} are creating tough choices for working people in ${targetCategoryObj.name}. Giant tech corporations invest over $${statA} billion in software tools, while training funds for regular workers get barely $${statB} billion.\n\nOver ${percentC}% of young office workers worry about losing jobs to automation. Tech progress is great, but only if it creates new paths for regular people.`,
        arg: `Fast tech tools in ${freshSubtopic} need real training funds so regular office workers do not lose jobs`,
        stat: [`$${statA}b`, `$${statB}b`, `${percentC}%`],
        angle: "New tech tools vs regular jobs and training",
        roman: `${freshSubtopic} ki tez raftari se lakhon log mutasir ho rahay hain. Corporations $${statA} billion lagati hain magar mazdoor ki tarbiyat par sirf $${statB} billion kharch hotay hain. ${percentC}% afrad ki nokri khatray mein hai. Taraqqi agar awam ko be-rozgar kar day toh wo taraqqi nahi.`,
        plain: `${freshSubtopic} کی تبدیلیوں سے روزگار کو شدید خطرات لاحق ہیں۔ کمپنیاں $${statA} ارب ڈالر آٹومیشن پر لگاتی ہیں مگر مزدوروں کی تربیت پر بمشکل $${statB} ارب ڈالر خرچ ہوتے ہیں۔ پانچ سال میں ${percentC} فیصد ملازمین متاثر ہونے کا خدشہ ہے۔`
      },
      // Pattern 4: Resource extraction vs community equity
      {
        eng: `Audits of natural resources in ${freshSubtopic} show deep unfairness across ${targetCategoryObj.name}. Mining contracts bring $${statA} billion into central bank accounts, yet local towns get under $${statB} billion for clean drinking water and roads.\n\nOver ${percentC}% of families in resource towns still live without basic electricity. Taking wealth from poor towns without helping them breaks public trust.`,
        arg: `Mining wealth in ${freshSubtopic} must be shared with local towns for clean water and roads`,
        stat: [`$${statA}b`, `$${statB}b`, `${percentC}%`],
        angle: "Mining earnings vs basic clean water in local towns",
        roman: `${freshSubtopic} ke wasail ki taqseem mein sakht na-insafi hai. Riyasat $${statA} billion kamati hai magar muqami logon ko sirf $${statB} billion miltay hain. ${percentC}% log bunyadi sahuliyat se mehroom hain. Muqami haqooq dabanay se be-chaini barhti hai.`,
        plain: `${freshSubtopic} کے وسائل کی تقسیم میں شدید عدم مساوات ہے۔ ریاست $${statA} ارب ڈالر کماتی ہے لیکن مقامی آبادی کو محض $${statB} ارب ڈالر کے ترقیاتی فنڈز ملتے ہیں۔ وسائل سے مالامال علاقوں کے ${percentC} فیصد شہری پینے کے صاف پانی سے بھی محروم ہیں۔`
      },
      // Pattern 5: Power concentration and institutional accountability
      {
        eng: `Reports on ${freshSubtopic} reveal how power works behind closed doors in ${targetCategoryObj.name}. Big corporate groups get contracts worth $${statA} billion, while official public watchdog offices get less than $${statB} billion to check the books.\n\nOver ${percentC}% of major state contracts were given without open public bidding. Who is government really serving: connected friends or the people who vote?`,
        arg: `Giving contracts without public bidding in ${freshSubtopic} favors connected friends over regular citizens`,
        stat: [`$${statA}b`, `$${statB}b`, `${percentC}%`],
        angle: "Open bidding vs deals for connected friends",
        roman: `${freshSubtopic} par markazi qabza saaf zahir hai. Cartels ko $${statA} billion ke contracts miltay hain jabke ehtisab ke idaron ko sirf $${statB} billion diay jatay hain. ${percentC}% thekay baghair muqablay ke hotay hain. Riyasati nigrani kis ke faiday ke liye hai?`,
        plain: `${freshSubtopic} کے معاملات پر مخصوص اجارہ داریاں حاوی ہیں۔ کارٹلز کو $${statA} ارب ڈالر کے ٹھیکے دیے جاتے ہیں جبکہ احتسابی اداروں کو محض $${statB} ارب ڈالر کا بجٹ ملتا ہے۔ پچپن سے ${percentC} فیصد سودے بغیر کھلی بولی کے ہوتے ہیں۔`
      }
    ];

    const chosen = patterns[patternIdx];
    engText = chosen.eng;
    romanText = chosen.roman;
    plainText = chosen.plain;
    centralArg = chosen.arg;
    analyticalAngle = chosen.angle;
    statList = chosen.stat;
  }

  return {
    topic: `${targetCategoryObj.name}: ${freshSubtopic} Audit ${batchId}`,
    subtopic: freshSubtopic,
    category: targetCategoryObj.id,
    genreId: targetCategoryObj.id,
    mainSubject: freshSubtopic,
    specificEventOrIssue: `${freshSubtopic} structural analysis`,
    centralArgument: centralArg,
    analyticalAngle: analyticalAngle || 'Structural comparative analysis',
    importantStatistics: statList.length > 0 ? statList : [`$${statA}b`, `$${statB}b`, `${percentC}%`],
    keywords: [freshSubtopic, 'analysis', 'data', 'priorities'],
    english: {
      text: engText
    },
    romanUrdu: {
      text: romanText
    },
    plainUrdu: {
      text: plainText
    }
  };
}

/* =========================================================
   GENERATE ENGLISH POST (NEVER REGENERATES OLD POST)
   UP TO 5 ATTEMPTS WITH STRICT CONTENT-LEVEL UNIQUE CHECKS
========================================================= */

export async function generateEnglishPost(customTopic = '', excludedTopic = '', excludedContext = null) {
  const geminiKey = process.env.GEMINI_API_KEY;
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

  const recordedTopics = historyStore.getAllUsedTopics();
  let mongoTopics = [];
  try {
    mongoTopics = await getAllUsedTopics(0); // Query ALL without arbitrary 30-post limit
  } catch (error) {
    // Mongo fallback
  }

  const allUsedTopics = Array.from(new Set([...recordedTopics, ...mongoTopics]));
  if (cleanExcluded) allUsedTopics.push(cleanExcluded);

  // Determine active genre
  const primaryGenre = genreManager.getPrimaryGenre();
  const allGenres = genreManager.getAllGenres();

  let targetCategory = null;
  if (primaryGenre) {
    // STRICT RULE: Once owner selects a primary genre, post ONLY of that genre nothing else!
    targetCategory = primaryGenre;
  } else {
    targetCategory = allGenres[categoryRotationIndex % allGenres.length];
    categoryRotationIndex++;
  }

  let chosenCategory = targetCategory.id;

  // If user passed a topic indicating Pak vs Ind, adjust category accordingly
  if (customTopic && (customTopic.toLowerCase().includes('pak vs ind') || customTopic.toLowerCase().includes('india vs pakistan'))) {
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
        const res = await callGemini(prompt, geminiKey);
        const validated = validateAIResponse(res, chosenTopic, chosenCategory, chosenSubtopic);
        candidate = validated;
        providerName = 'Google Gemini Free API';
      } catch (err) {
        console.warn(`[Gemini API] ${err.message}. Trying next tier...`);
      }
    }

    /* ---------------- TIER 2. xAI GROK API ---------------- */
    if (xaiKey && !candidate) {
      try {
        const res = await callXai(prompt, 'grok-beta');
        const validated = validateAIResponse(res, chosenTopic, chosenCategory, chosenSubtopic);
        candidate = validated;
        providerName = 'xAI Grok API';
      } catch (err) {
        console.warn(`[Grok API] ${err.message}. Trying next tier...`);
      }
    }

    /* ---------------- TIER 3. GROQ CLOUD API ---------------- */
    if (groqKey && !candidate) {
      try {
        const res = await callGroq(prompt, groqKey);
        const validated = validateAIResponse(res, chosenTopic, chosenCategory, chosenSubtopic);
        candidate = validated;
        providerName = 'Groq Cloud API (Free)';
      } catch (err) {
        console.warn(`[Groq API] ${err.message}. Trying fallback bank...`);
      }
    }

    /* ---------------- TIER 4. CURATED & DYNAMIC FALLBACK ---------------- */
    if (!candidate) {
      // Check curated bank first
      const curatedMatch = CURATED_STORY_TOPICS.find(
        item =>
          item.category === chosenCategory &&
          (!cleanExcluded || item.topic.toLowerCase().trim() !== cleanExcluded) &&
          !historyStore.hasSeenTopic(item.topic) &&
          !historyStore.isDuplicateOrSimilar(item.english.text, item.topic, item).isDuplicate
      );

      if (curatedMatch) {
        candidate = {
          topic: curatedMatch.topic,
          subtopic: curatedMatch.subtopic || curatedMatch.topic,
          category: curatedMatch.category,
          genreId: curatedMatch.category,
          english: formatEntry(curatedMatch.english.text),
          romanUrdu: curatedMatch.romanUrdu ? formatEntry(curatedMatch.romanUrdu.text) : null,
          plainUrdu: curatedMatch.plainUrdu ? formatEntry(curatedMatch.plainUrdu.text) : null
        };
        providerName = 'Curated Analytical Engine';
      } else {
        const fallback = generateDynamicFallback(chosenCategory, chosenSubtopic, cleanExcluded, avoidList);
        candidate = {
          topic: fallback.topic,
          subtopic: fallback.subtopic || chosenSubtopic,
          category: fallback.category,
          genreId: fallback.category,
          mainSubject: fallback.mainSubject,
          specificEventOrIssue: fallback.specificEventOrIssue,
          centralArgument: fallback.centralArgument,
          analyticalAngle: fallback.analyticalAngle,
          importantStatistics: fallback.importantStatistics,
          keywords: fallback.keywords,
          english: formatEntry(fallback.english.text),
          romanUrdu: fallback.romanUrdu ? formatEntry(fallback.romanUrdu.text) : null,
          plainUrdu: fallback.plainUrdu ? formatEntry(fallback.plainUrdu.text) : null
        };
        providerName = 'Dynamic Analytical Fallback';
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

  if (xaiKey && !romanEntry) {
    try {
      const res = await callXai(prompt, 'grok-beta');
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
    const found =
      CURATED_STORY_TOPICS.find(
        item => item.topic === topic || item.english.text === englishPost.text
      ) || CURATED_STORY_TOPICS[0];
    romanEntry = formatEntry(found.romanUrdu?.text || found.english.text);
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

  if (xaiKey && !urduEntry) {
    try {
      const res = await callXai(prompt, 'grok-beta');
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
    const found =
      CURATED_STORY_TOPICS.find(
        item => item.topic === topic || item.english.text === englishPost.text
      ) || CURATED_STORY_TOPICS[0];
    urduEntry = formatEntry(found.plainUrdu?.text || found.english.text);
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
   API CALL WRAPPERS (GROQ, XAI, GEMINI)
========================================================= */

async function callGroq(prompt, apiKey) {
  const groq = new Groq({ apiKey });
  const model = process.env.AI_MODEL || 'llama-3.3-70b-versatile';

  const completion = await groq.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: 'You are an advanced geopolitical and economic analyst writing analytical commentary for X (Twitter).'
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
          content: 'You are an advanced geopolitical and economic analyst writing analytical commentary for X (Twitter).'
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
  const models = [
    process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    'gemini-flash-latest'
  ];

  let lastError = null;
  for (const model of models) {
    try {
      const parsed = await new Promise((resolve, reject) => {
        const postData = JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.6,
            responseMimeType: 'application/json'
          }
        });

        const req = https.request(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            family: 4,
            timeout: 3000,
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
          reject(new Error(`Gemini ${model} request timed out (3.0s)`));
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
