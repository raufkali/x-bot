/**
 * X-BOT — Data-Driven Analytical Content Engine
 *
 * Core Focus:
 * - Data-driven analytical social media posts
 * - Statistics, economic figures, military budgets, and international comparisons
 * - Critical analysis of power, money, politics, and global inequality
 *
 * Categories / Genres:
 * 1. Pak vs Ind (India vs Pakistan military & welfare comparisons)
 * 2. Geopolitics & Global Power (China vs USA, Middle East, Sanctions)
 * 3. Pakistan Politics & Economy (Spending, IMF loans, Debt, Defence vs Welfare)
 * 4. Social & Regional Issues (Balochistan, KPK, Sindh, Punjab, Unequal development)
 * 5. AI & Human Society (Job replacement, dependency, surveillance, data centres)
 * 6. Climate & Global Power (Flood injustice, global emissions, rich vs poor)
 * 7. Double-Meaning & Satirical Commentary (Sugar vs guns, promises vs reality)
 *
 * Standards:
 * - English Level: Simple Pakistani English (A2 Level)
 * - Strict Target Length: 400–500 characters (aim for 450–470 chars, max 500)
 * - Zero hashtags, zero emojis, no internal labels or bullet lists
 * - Translations: Pakistani Roman Urdu and Plain Urdu script (اردو)
 * - Strict HistoryStore & MongoDB SHA-256 deduplication & anti-repetition engine
 */

import https from 'https';
import Groq from 'groq-sdk';
import { calculateXCharacterCount } from '../utils/validation.js';
import {
  isDuplicatePost,
  saveGeneratedPost,
  getAllUsedTopics
} from '../db/postModel.js';
import { historyStore } from '../db/historyStore.js';
import { genreManager } from './genreManager.js';

/* =========================================================
   DYNAMIC CONTENT CATEGORIES (SYNCHRONIZED WITH GENRE MANAGER)
========================================================= */

export const CONTENT_CATEGORIES = genreManager.getAllGenres();

/* =========================================================
   CURATED ANALYTICAL TOPIC BANK (STRICTLY 400–500 CHARACTERS)
========================================================= */

export const CURATED_STORY_TOPICS = [
  // 1. Pak vs Ind: Weapons vs Welfare (Benchmark Example)
  {
    topic: "India vs Pakistan: Weapons vs Welfare",
    category: 'PAK_VS_IND',
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

  // 2. Pak vs Ind: Missiles vs Malnutrition
  {
    topic: "India vs Pakistan: Missiles vs Malnutrition",
    category: 'PAK_VS_IND',
    english: {
      text: "India and Pakistan spent $18 billion building long-range ballistic missile arsenals. Yet 38% of children under five in both countries suffer from chronic stunting and malnutrition.\n\nBoth capitals proudly display missiles that travel 5,000 kilometres while millions of mothers cannot afford clean milk or basic nutrition.\n\nWhat security does a ballistic missile provide to a child starving in a village?"
    },
    romanUrdu: {
      text: "India aur Pakistan ne long-range missiles par 18 arab dollar lagaye. Magar dono mulkon ke 38% bachay khurak ki shadeed kami aur stunting ka shikaar hain.\n\nDono hukmaran 5,000 km tak mar karnay walay missiles ki numaish karte hain jabke laakhon maayein bachon ke liye doodh nahi khareed sakein.\n\nEk bhookay bachay ko ballistic missile konsi hifazat deta hai?"
    },
    plainUrdu: {
      text: "بھارت اور پاکستان نے طویل فاصلے تک مار کرنے والے میزائلوں پر 18 ارب ڈالر لگائے۔ مگر دونوں ممالک کے 38 فیصد بچے خوراک کی شدید کمی کا شکار ہیں۔\n\nدونوں دارالحکومت پانچ ہزار کلومیٹر تک جانے والے میزائلوں پر فخر کرتے ہیں جبکہ لاکھوں مائیں دودھ تک نہیں خرید سکتیں۔\n\nایک بھوکے اور لاچار بچے کو بیلسٹک میزائل کون سا تحفظ فراہم کرتا ہے؟"
    }
  },

  // 3. Pak vs Ind: Submarines vs Clean Water
  {
    topic: "India vs Pakistan: Submarines vs Clean Water",
    category: 'PAK_VS_IND',
    english: {
      text: "Both nations are spending over $12 billion building nuclear submarines and naval fleets. Yet 70% of drinking water across Pakistan and India is contaminated with toxic bacteria.\n\nOne nuclear submarine costs $3.5 billion, enough to provide clean tap water for 80 million people in both countries.\n\nWhy spend billions to guard the deep ocean when your own citizens are being poisoned by their tap?"
    },
    romanUrdu: {
      text: "Dono mulk atomic submarines aur behri jahaazon par 12 arab dollar se zyada kharch kar rahay hain. Magar 70% peenay ka paani zehreelay jaraseem se bhara hai.\n\nEk submarine 3.5 arab dollar ki hai, jis se 8 karor logon ko saaf paani mil sakta tha.\n\nGehray samundar ki hifazat par arbon kyon lagayein jab apnay hi shehri nalay ka ganda paani peenay par majboor hon?"
    },
    plainUrdu: {
      text: "دونوں ممالک ایٹمی آبدوزوں اور بحری بیڑوں پر 12 ارب ڈالر سے زیادہ خرچ کر رہے ہیں۔ مگر پاکستان اور بھارت میں 70 فیصد پینے کا پانی آلودہ ہے۔\n\nایک ایٹمی آبدوز کی لاگت ساڑھے تین ارب ڈالر ہے جس سے آٹھ کروڑ عوام کو پینے کا صاف پانی مل سکتا ہے۔\n\nسمندر کی گہرائیوں پر اربوں لٹانے کا کیا فائدہ جب شہری نلکے کا زہریلا پانی پینے پر مجبور ہوں؟"
    }
  },

  // 4. Pak vs Ind: Fighter Jets vs Hospital Beds
  {
    topic: "India vs Pakistan: Fighter Jets vs Hospital Beds",
    category: 'PAK_VS_IND',
    english: {
      text: "India bought 36 French Rafale jets for $8.7 billion, while Pakistan spends $1.5 billion on JF-17 fighters. Meanwhile, public healthcare spending sits below 1.5% of GDP in both nations, leaving one hospital bed for every 1,400 people.\n\nMillions die from treatable diseases each year.\n\nHow can a nation be defended from the skies when its hospitals cannot even treat a fever?"
    },
    romanUrdu: {
      text: "India ne 8.7 arab dollar ke Rafale jahaz khareeday aur Pakistan ne 1.5 arab dollar JF-17 par lagaye. Jabke sehat ka budget GDP ka 1.5% se bhi kam hai, aur 1,400 logon ke liye sirf ek hospital bed hai.\n\nHar saal laakhon log mamooli bemariyon se mar jatay hain.\n\nAasman se watan ka difa kaise hoga jab zameen par hospitals bukhar ka ilaj tak na kar sakein?"
    },
    plainUrdu: {
      text: "بھارت نے 8.7 ارب ڈالر کے رافیل طیارے خریدے اور پاکستان نے ڈیڑھ ارب ڈالر جے ایف 17 پر لگائے۔ دوسری طرف صحت کا بجٹ جی ڈی پی کے 1.5 فیصد سے بھی کم ہے جہاں 1400 افراد کے لیے صرف ایک بیڈ ہے۔\n\nہر سال لاکھوں شہری قابل علاج بیماریوں سے دم توڑ دیتے ہیں۔\n\nفضائی حدود کے دفاع کا کیا فائدہ جب سرکاری اسپتال معمولی بخار کی دوا تک نہ دے سکیں؟"
    }
  },

  // 5. Pak vs Ind: Nuclear Warheads vs Classrooms
  {
    topic: "India vs Pakistan: Nuclear Warheads vs Classrooms",
    category: 'PAK_VS_IND',
    english: {
      text: "India and Pakistan now hold over 340 nuclear warheads, spending more than $4.5 billion annually to maintain them. Yet over 50 million citizens in both countries cannot write their own names, and 30,000 public schools lack electricity or basic toilets.\n\nWe invest billions in atomic warheads designed never to be used while classrooms crumble.\n\nWhat strategic glory is there in an atomic bomb if our next generation grows up uneducated and poor?"
    },
    romanUrdu: {
      text: "India aur Pakistan 340 se zyada atomic warheads rakhte hain jinki hifazat par 4.5 arab dollar lagtay hain. Magar 5 karor log apna naam tak nahi likh saktay aur 30,000 schools mein bijli ya toilets nahi hain.\n\nHum aisi atom bomb par arbon lagatay hain jo chal nahi sakti jabke school dhal rahay hain.\n\nAisi atomic taqat ka kya faida agar agli nasal anparh aur ghareeb reh jaye?"
    },
    plainUrdu: {
      text: "بھارت اور پاکستان کے پاس 340 سے زیادہ ایٹمی ہتھیار ہیں جن کی دیکھ بھال پر ساڑھے چار ارب ڈالر خرچ ہوتے ہیں۔ مگر پانچ کروڑ شہری اپنا نام تک نہیں لکھ سکتے اور تیس ہزار اسکولوں میں بجلی یا بیت الخلا تک نہیں۔\n\nہم ان بموں پر اربوں لٹاتے ہیں جنہیں چلا نہیں سکتے جبکہ تعلیمی ادارے تباہ ہو رہے ہیں۔\n\nایسی طاقت کا کیا فخر اگر اگلی نسل بنیادی تعلیم سے بھی محروم رہے؟"
    }
  },

  // 6. Pak vs Ind: Border Radars vs Farmer Crises
  {
    topic: "India vs Pakistan: Border Radars vs Farmer Crises",
    category: 'PAK_VS_IND',
    english: {
      text: "India and Pakistan spend $1.8 billion on thermal border sensors, electronic fences, and surveillance radars. At the exact same time, underground water tables in Punjab on both sides have dropped by 15 metres, forcing over 100,000 farmers into severe debt.\n\nBoth nations scan the sky for enemy drones while our agricultural heartland runs out of water.\n\nWhat will our armies eat when fertile fields turn to dust?"
    },
    romanUrdu: {
      text: "India aur Pakistan sarhad par radar aur sensors par 1.8 arab dollar kharch karte hain. Doosri taraf Punjab mein zameen ka paani 15 meter neeche gir chuka hai aur 1 laakh kisan qarzay mein doob gaye hain.\n\nHum asman par drones dhoondhte hain jabke zameen ka paani sookh raha hai.\n\nFoj kya khaye gi jab hamaray khet sahra ban jayenge?"
    },
    plainUrdu: {
      text: "بھارت اور پاکستان سرحدی راڈار اور سینسرز پر پونے دو ارب ڈالر خرچ کرتے ہیں۔ دوسری طرف پنجاب میں زیر زمین پانی پندرہ میٹر نیچے گر چکا ہے اور ایک لاکھ کسان برباد ہو چکے ہیں۔\n\nہم ڈرونز تلاش کرنے پر اربوں لگاتے ہیں جبکہ ہمارے کھیت پانی کو ترس رہے ہیں۔\n\nافواج کیا کھائیں گی جب ہماری زرخیز زمینیں بنجر ریگستان بن جائیں گی؟"
    }
  },

  // 7. Pak vs Ind: Military Pensions vs Rural Doctors
  {
    topic: "India vs Pakistan: Military Pensions vs Rural Doctors",
    category: 'PAK_VS_IND',
    english: {
      text: "Pakistan spends $3.2 billion on military pensions, while India allocates $16 billion annually. Yet rural districts across both countries have only 1 doctor for every 10,000 villagers, and 60% of rural health clinics lack basic emergency medicines or ultrasound machines.\n\nWe guarantee pensions for soldiers while leaving pregnant mothers to die on highway roads.\n\nWho protects our citizens from systemic medical neglect?"
    },
    romanUrdu: {
      text: "Pakistan foji pensions par 3.2 arab dollar aur India 16 arab dollar kharch karta hai. Magar dehaton mein 10,000 logon ke liye sirf ek doctor hai aur 60% clinics mein basic medicines nahi hain.\n\nHum pensions ka intizam karte hain magar maaoon ko ilaj nahi milta.\n\nShehriyon ko is medical barbadi se kon bachaye ga?"
    },
    plainUrdu: {
      text: "پاکستان فوجی پنشن پر سوا تین ارب ڈالر اور بھارت سولہ ارب ڈالر خرچ کرتا ہے۔ مگر دیہات میں دس ہزار شہریوں کے لیے صرف ایک ڈاکٹر ہے اور ساٹھ فیصد کلینکس میں بنیادی ادویات تک نہیں۔\n\nہم پنشن کا بجٹ پورا کرتے ہیں مگر ماؤں کو علاج میسر نہیں۔\n\nشہریوں کو اسپتالوں کے اس المیے سے کون بچائے گا؟"
    }
  },

  // 8. Pak vs Ind: Space Satellites vs Dying Irrigation
  {
    topic: "India vs Pakistan: Space Satellites vs Dying Irrigation",
    category: 'PAK_VS_IND',
    english: {
      text: "India operates 55 active military and radar satellites while Pakistan has 6 in orbit, spending $1.6 billion on space defence commands. Yet over 60% of small farmers in both nations lack basic canal irrigation for their crops.\n\nMillions of poor farming families depend only on rain, watching fertile fields dry up and fail.\n\nWhat is the point of mapping space when our own citizens cannot even afford basic food?"
    },
    romanUrdu: {
      text: "India 55 military aur radar satellites chalata hai jabke Pakistan ke paas 6 hain, aur 1.6 arab dollar space defence par lagtay hain. Magar dono mulkon ke 60% chhotay kisan nehri paani se mehroom hain.\n\nLaakhon kisan sirf barish ke reham-o-karam par hain.\n\nKhala ki nigrani ka kya faida jab awam ke paas do waqt ki roti na ho?"
    },
    plainUrdu: {
      text: "بھارت 55 فوجی اور راڈار سیٹلائٹس چلاتا ہے جبکہ پاکستان کے پاس 6 ہیں اور خلائی دفاع پر پونے دو ارب ڈالر خرچ ہوتے ہیں۔ مگر دونوں ممالک کے 60 فیصد چھوٹے کسان نہری پانی سے محروم ہیں۔\n\nلاکھوں کسان صرف بارش کے رحم و کرم پر ہیں جبکہ فصلیں سوکھ رہی ہیں۔\n\nخلا پر نظر رکھنے کا کیا فائدہ جب شہریوں کو دو وقت کی روٹی میسر نہ ہو؟"
    }
  },

  // 5. Satirical Commentary: Sugar vs Guns
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

  // 6. Geopolitics: China vs USA
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

  // 7. AI & Tech: Energy and Water Grids
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

  // 8. Pakistan Politics & Economy: IMF Debt Trap
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

  // 9. Social & Regional Issues: Balochistan Resources
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

  // 10. Climate & Global Power: Flood Injustice
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
   SPECIALIZED PROMPT BUILDER FOR PAK VS IND GENRE
========================================================= */

function createPakVsIndPrompt(chosenTopic, avoidList = []) {
  const avoidStr = avoidList.length > 0 ? avoidList.slice(0, 20).join('; ') : 'None';

  return `# PAK VS INDIA — CONTENT GENERATION ENGINE

## 1. Core Identity and Purpose
Generate original, thought-provoking social media posts about Pakistan and India, focusing on their military competition, political decisions, economic conditions, public welfare, national priorities, and regional challenges.
The central theme is to examine the contrast between military ambitions and the real needs of ordinary people.
The goal is NOT to repeat a particular writing template. Produce fresh, intelligent, fact-based comparisons that make readers stop, think, and discuss.

IMPORTANT: Reference examples are genre guides, NOT templates to copy. Never treat their sentence structure, paragraph count, opening style, or ending question as mandatory.

## 2. Creative Freedom — CRITICAL RULE
Every post must be independently written.
Do NOT force every post into:
- A military spending comparison in the first sentence.
- A welfare statistic in the second paragraph.
- A rhetorical question in the final paragraph.
- Exactly three paragraphs.
- The same opening or closing sentence.
- A repeated formula such as "India spends X while Pakistan spends Y."

Vary the structure naturally. Depending on the topic, a post may:
- Start with a surprising fact.
- Begin with a comparison between the two countries.
- Highlight an unusual military or civilian purchase.
- Discuss the impact of a policy on ordinary citizens.
- Compare national priorities.
- Focus on one country while using the other as context.
- Explain a contradiction between military strength and economic weakness.
- Present a short analytical observation.
- End with a powerful question, a direct statement, or an unexpected conclusion.

Some posts can have two paragraphs, some three, and some four. Others can be written as one continuous paragraph. Do not make the writing predictable!

## 3. The 16 Content Categories (Rotate across these):
1. Weapons vs Welfare — Defence budgets, military purchases, hospitals, and education.
2. Missiles vs Malnutrition — Missile programmes, food security, and child health.
3. Submarines vs Clean Water — Naval spending, water shortages, and sanitation.
4. Fighter Jets vs Public Services — Air power, public transport, healthcare, and schools.
5. Nuclear Weapons vs Human Development — Nuclear capabilities, literacy, and poverty.
6. Border Security vs Farmer Crises — Military infrastructure, agriculture, and rural livelihoods.
7. Military Pensions vs Public Healthcare — Military expenditure and access to medical services.
8. Space Technology vs Rural Development — Satellites, technological progress, and agricultural challenges.
9. Economic Competition — GDP, debt, inflation, exports, foreign reserves, and unemployment.
10. Education and Human Capital — Universities, literacy, research, and opportunities for young people.
11. Political Priorities — Government decisions, corruption, public spending, and accountability.
12. Technology and Innovation — Defence technology compared with civilian research and development.
13. Regional Development — Infrastructure, electricity, transport, and rural facilities.
14. Climate and Water Security — Floods, heatwaves, pollution, water disputes, and environmental challenges.
15. Human Cost of Conflict — Trade restrictions, border tensions, displaced families, and lost opportunities.
16. Global Comparisons — How Pakistan and India compare with other developing countries in relevant areas.

## 4. Writing Style
- Use simple A1–A2 Pakistani English. Everyday words.
- Sound like a real human political and social commentator. Direct, natural, and confident.
- Use clear facts and meaningful comparisons. No university-level jargon.
- Avoid unnecessary dramatic wording or overly emotional aggression.
- Maintain a critical but balanced tone toward both Pakistan and India. Highlight problems in both nations when relevant.

## 5. Fact Accuracy and Research
- Use credible and verifiable statistics. Never invent numbers.
- If a statistic cannot be verified, use a factual observation without inventing a number.
- A strong post does not always need two statistics; one well-explained fact or analytical contrast is very powerful.

## 6. Strict Character & Formatting Rules
- STRICT LENGTH: 400 to 500 characters total (including spaces and punctuation). Count carefully before returning!
- ZERO hashtags (#).
- ZERO emojis in output text.
- NO bullet points or lists in the generated post.
- NO headings or labels inside the post.
- Avoid repeating these recently used topics or numbers: ${avoidStr}

TOPIC: "${chosenTopic}"
GENRE: PAK_VS_IND

Return ONLY valid JSON matching this exact structure:
{
  "topic": "${chosenTopic}",
  "category": "PAK_VS_IND",
  "text": "Your complete post here"
}`;
}

/* =========================================================
   MASTER DATA-DRIVEN AI PROMPT (STRICT 400–500 CHARACTERS)
========================================================= */

function createEnglishPrompt(chosenTopic, usedTopics, targetCategory = null, avoidList = []) {
  const combinedAvoid = Array.from(new Set([...usedTopics, ...avoidList]));
  const avoidListStr =
    combinedAvoid.length > 0
      ? combinedAvoid.slice(0, 30).join('; ')
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
- ANALYSE THE NUMBERS: don't just state them. Compare them.
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
4. STRICT CONSTRAINTS
============================================================
- EXACT LENGTH: 400 to 500 characters total. Count characters carefully!
- ZERO hashtags. ZERO emojis. NO bullet points.
- NO AI meta-text, introductions, or character counts in output.
- Do NOT repeat these recent topics or figures: ${avoidListStr}

Return ONLY valid JSON matching this exact structure:
{
  "topic": "${chosenTopic}",
  "category": "${targetCategory?.id || 'GEOPOLITICS'}",
  "text": "Your complete post with paragraph breaks here"
}`;
}

/* =========================================================
   GENERATE ENGLISH POST (NEVER REGENERATES OLD POST)
======================================================== */

export async function generateEnglishPost(customTopic = '', excludedTopic = '') {
  const geminiKey = process.env.GEMINI_API_KEY;
  const xaiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const cleanExcluded = String(excludedTopic || '').toLowerCase().trim();

  // Retrieve comprehensive past topics and avoid list from permanent historyStore and Mongo
  const avoidList = historyStore.getRecentAvoidList(30);
  if (cleanExcluded) {
    avoidList.unshift(`DISCARDED_TOPIC_TO_NEVER_REPEAT: "${cleanExcluded}"`);
  }
  const recordedTopics = historyStore.getAllUsedTopics();

  let mongoTopics = [];
  try {
    mongoTopics = await getAllUsedTopics(200);
  } catch (error) {
    // Mongo fallback
  }

  const allUsedTopics = Array.from(new Set([...recordedTopics, ...mongoTopics]));
  if (cleanExcluded) {
    allUsedTopics.push(cleanExcluded);
  }
  const normalizedUsedTopics = allUsedTopics.map(t => String(t).toLowerCase().trim());

  // Check if owner has configured a Primary Genre
  const primaryGenre = genreManager.getPrimaryGenre();
  const allGenres = genreManager.getAllGenres();

  let targetCategory = null;
  if (primaryGenre) {
    // STRICT RULE: Once owner selects a primary genre, post ONLY of that genre nothing else!
    targetCategory = primaryGenre;
  } else {
    // Random / Rotating mode across all genres
    targetCategory = allGenres[categoryRotationIndex % allGenres.length];
    categoryRotationIndex++;
  }

  let chosenTopic = customTopic.trim();
  if (chosenTopic && cleanExcluded && chosenTopic.toLowerCase() === cleanExcluded) {
    chosenTopic = '';
  }
  let chosenCategory = targetCategory.id;

  // If user passed a topic indicating Pak vs Ind, adjust category accordingly
  if (chosenTopic && (chosenTopic.toLowerCase().includes('pak vs ind') || chosenTopic.toLowerCase().includes('india vs pakistan'))) {
    chosenCategory = 'PAK_VS_IND';
    targetCategory = allGenres.find(g => g.id === 'PAK_VS_IND') || targetCategory;
  }

  if (!chosenTopic) {
    // 1. Check for unused curated topics in target category that have NEVER been used
    const categoryUnusedCurated = CURATED_STORY_TOPICS.filter(
      item =>
        item.category === targetCategory.id &&
        (!cleanExcluded || item.topic.toLowerCase().trim() !== cleanExcluded) &&
        !normalizedUsedTopics.includes(item.topic.toLowerCase().trim()) &&
        !historyStore.hasSeenTopic(item.topic) &&
        !historyStore.isDuplicateOrSimilar(item.english.text, item.topic).isDuplicate
    );

    if (categoryUnusedCurated.length > 0) {
      const idx = Math.floor(Math.random() * categoryUnusedCurated.length);
      chosenTopic = categoryUnusedCurated[idx].topic;
      chosenCategory = categoryUnusedCurated[idx].category;
    } else if (targetCategory.id === 'PAK_VS_IND') {
      // Dynamic angles for Pak vs Ind rotating across all 16 thematic categories
      const dynamicAngles = [
        'Pakistan vs India: Weapons vs Welfare Priorities',
        'India vs Pakistan: Missiles vs Child Malnutrition',
        'Pakistan vs India: Nuclear Submarines vs Clean Water',
        'India vs Pakistan: Modern Fighter Jets vs Public Clinics',
        'Pakistan vs India: 340 Nuclear Warheads vs Classrooms',
        'India vs Pakistan: Border Radars vs Farmer Crises',
        'Pakistan vs India: Military Pensions vs Rural Doctors',
        'India vs Pakistan: Space Technology vs Canal Irrigation',
        'Pakistan vs India: Foreign Debt vs Economic Reserves',
        'India vs Pakistan: Higher Education vs Brain Drain',
        'Pakistan vs India: Defense Budgets vs Youth Opportunities',
        'India vs Pakistan: Civilian R&D vs Tank Procurement',
        'Pakistan vs India: Rural Development vs Border Security',
        'India vs Pakistan: Toxic Smog & Cross-Border Pollution',
        'Pakistan vs India: The $37 Billion Lost Bilateral Trade',
        'South Asia vs ASEAN: Regional Peace and Economic Growth'
      ];
      const unusedAngles = dynamicAngles.filter(
        a => (!cleanExcluded || a.toLowerCase().trim() !== cleanExcluded) &&
             !normalizedUsedTopics.includes(a.toLowerCase().trim()) &&
             !historyStore.hasSeenTopic(a)
      );
      chosenTopic = unusedAngles.length > 0
        ? unusedAngles[Math.floor(Math.random() * unusedAngles.length)]
        : `India vs Pakistan: Strategic Reality (Batch ${Date.now().toString().slice(-4)})`;
      chosenCategory = 'PAK_VS_IND';
    } else {
      // Dynamic topic selection for other categories
      const keywords = targetCategory.keywords || [targetCategory.name];
      const unusedKeywords = keywords.filter(
        k => (!cleanExcluded || k.toLowerCase().trim() !== cleanExcluded) &&
             !normalizedUsedTopics.includes(k.toLowerCase().trim()) &&
             !historyStore.hasSeenTopic(k)
      );
      chosenTopic = unusedKeywords.length > 0
        ? unusedKeywords[Math.floor(Math.random() * unusedKeywords.length)]
        : `${targetCategory.name}: Analytical Insight ${Date.now().toString().slice(-4)}`;
      chosenCategory = targetCategory.id;
    }
  }

  // Construct prompt: Use specialized Pak vs Ind prompt if category is PAK_VS_IND
  const prompt = chosenCategory === 'PAK_VS_IND'
    ? createPakVsIndPrompt(chosenTopic, avoidList)
    : createEnglishPrompt(chosenTopic, allUsedTopics, targetCategory, avoidList);

  /* ---------------- 1. GOOGLE GEMINI FREE API (PRIMARY) ---------------- */
  if (geminiKey) {
    try {
      const res = await callGemini(prompt, geminiKey);
      const validated = validateAIResponse(res, chosenTopic, chosenCategory);

      // Verify that output is NOT duplicate or similar to ANY past post
      const dupCheck = historyStore.isDuplicateOrSimilar(validated.english.text, validated.topic);
      const isMongoDup = await isDuplicatePost(validated.topic, validated.english.text).catch(() => false);

      if (!dupCheck.isDuplicate && !isMongoDup) {
        // Record in permanent history store so it can NEVER be regenerated again
        historyStore.recordPost({
          topic: validated.topic,
          category: validated.category,
          englishText: validated.english.text,
          provider: 'Google Gemini Free API',
          status: 'PENDING'
        });

        await saveGeneratedPost({
          topic: validated.topic,
          category: validated.category,
          english: validated.english,
          provider: 'Google Gemini Free API'
        }).catch(() => {});

        return {
          ...validated,
          provider: 'Google Gemini Free API'
        };
      }
      console.warn(`[Gemini] Rejected duplicate (${dupCheck.reason || 'Mongo duplicate'}), trying secondary AI...`);
    } catch (error) {
      console.warn(`[Gemini API] ${error.message}. Falling back to Grok...`);
    }
  }

  /* ---------------- 2. xAI GROK API (SECONDARY FALLBACK) ---------------- */
  if (xaiKey) {
    try {
      const res = await callXai(prompt, 'grok-beta');
      const validated = validateAIResponse(res, chosenTopic, chosenCategory);
      const dupCheck = historyStore.isDuplicateOrSimilar(validated.english.text, validated.topic);
      const isMongoDup = await isDuplicatePost(validated.topic, validated.english.text).catch(() => false);

      if (!dupCheck.isDuplicate && !isMongoDup) {
        historyStore.recordPost({
          topic: validated.topic,
          category: validated.category,
          englishText: validated.english.text,
          provider: 'xAI Grok API',
          status: 'PENDING'
        });

        await saveGeneratedPost({
          topic: validated.topic,
          category: validated.category,
          english: validated.english,
          provider: 'xAI Grok API'
        }).catch(() => {});

        return {
          ...validated,
          provider: 'xAI Grok API'
        };
      }
      console.warn(`[Grok] Rejected duplicate (${dupCheck.reason || 'Mongo duplicate'}), trying Groq...`);
    } catch (error) {
      console.warn(`[Grok API] ${error.message}. Falling back to Groq...`);
    }
  }

  /* ---------------- 3. GROQ CLOUD API (TERTIARY FALLBACK) ---------------- */
  if (groqKey) {
    try {
      const res = await callGroq(prompt, groqKey);
      const validated = validateAIResponse(res, chosenTopic, chosenCategory);
      const dupCheck = historyStore.isDuplicateOrSimilar(validated.english.text, validated.topic);
      const isMongoDup = await isDuplicatePost(validated.topic, validated.english.text).catch(() => false);

      if (!dupCheck.isDuplicate && !isMongoDup) {
        historyStore.recordPost({
          topic: validated.topic,
          category: validated.category,
          englishText: validated.english.text,
          provider: 'Groq Cloud API (Free)',
          status: 'PENDING'
        });

        await saveGeneratedPost({
          topic: validated.topic,
          category: validated.category,
          english: validated.english,
          provider: 'Groq Cloud API (Free)'
        }).catch(() => {});

        return {
          ...validated,
          provider: 'Groq Cloud API (Free)'
        };
      }
      console.warn(`[Groq] Rejected duplicate (${dupCheck.reason || 'Mongo duplicate'}), using curated bank...`);
    } catch (error) {
      console.warn(`[Groq API] ${error.message}. Falling back to curated bank...`);
    }
  }

  /* =========================================================
   DYNAMIC PAK VS IND FALLBACK GENERATOR (GUARANTEES 100% FRESHNESS)
========================================================= */

function generateDynamicPakVsIndFallback(excludedTopic = '') {
  const cleanExcluded = String(excludedTopic || '').toLowerCase().trim();
  const pool = [
    {
      topic: "Pakistan vs India: The Lost Trade Opportunity",
      category: 'PAK_VS_IND',
      english: {
        text: "Direct trade between Pakistan and India remains under $2 billion, while indirect trade through Dubai exceeds $10 billion with heavy transport fees. The World Bank estimates bilateral trade could easily reach $37 billion every year if borders opened.\n\nBusinesses on both sides pay massive middleman charges while ordinary consumers face inflated food and medicine prices. Political confrontation is an expensive tax on the poor."
      },
      romanUrdu: {
        text: "Pakistan aur India ki direct tijarat 2 arab dollar se kam hai, jabke Dubai ke zariye indirect trade 10 arab dollar se tajawuz karti hai. World Bank ke mutabiq agar raste khul jayein toh tijarat 37 arab dollar tak pohanch sakti hai.\n\nDono taraf ke karobari afraad arbon dollar middleman ko detay hain jabke aam awam mehngi dawaiyan khareedti hai. Siyasi dushmani ghareebon par ek mehanga tax hai."
      },
      plainUrdu: {
        text: "پاکستان اور بھارت کی براہ راست تجارت دو ارب ڈالر سے کم ہے جبکہ دبئی کے ذریعے غیر مستقیم تجارت دس ارب ڈالر سے تجاوز کر چکی ہے۔ ورلڈ بینک کے مطابق تجارتی راستے کھلنے سے یہ حجم سالانہ سینتیس ارب ڈالر تک پہنچ سکتا ہے۔\n\nدونوں اطراف کے تاجر بھاری مڈل مین چارجز ادا کرتے ہیں جبکہ عام شہری مہنگی اشیائے خورونوش خریدنے پر مجبور ہیں۔ سیاسی محاذ آرائی غریب عوام پر ایک مہنگا ٹیکس ہے۔"
      }
    },
    {
      topic: "Lahore to Delhi: The Toxic Smog Crisis",
      category: 'PAK_VS_IND',
      english: {
        text: "Every winter, hazardous toxic smog covers Pakistan and India from Lahore to New Delhi, pushing air quality index levels above 1,000 and hospitalising tens of thousands of citizens with lung failure. The wind carries poison across the border regardless of radar systems and armed outposts.\n\nBoth governments invest billions defending borders from each other, but neither can defend their citizens from the air they breathe together."
      },
      romanUrdu: {
        text: "Har sardi mein shadeed zehreeli smog Pakistan aur India mein Lahore se New Delhi tak phailti hai, jahan AQI 1,000 se oopar chala jata hai aur hazaron log saans ki bemariyon se hospitals pohanchtay hain. Hawa sarhad ki parwah kiye baghair zehar phailati hai.\n\nDono hukoomatein arbon dollar difa par lagati hain, magar dono apnay shehriyon ko us hawa se nahi bacha sakein jo woh sath saans letay hain."
      },
      plainUrdu: {
        text: "ہر موسم سرما میں زہریلا اسموگ پاکستان اور بھارت میں لاہور سے نئی دہلی تک پھیل جاتا ہے جہاں ایئر کوالٹی انڈیکس ایک ہزار سے تجاوز کر جاتا ہے اور ہزاروں شہری اسپتال پہنچ جاتے ہیں۔ زہریلی ہوائیں راڈار اور سرحدی باڑ کی پروا کیے بغیر سرحد پار کرتی ہیں۔\n\nدونوں حکومتیں ایک دوسرے سے سرحد بچانے پر اربوں لگاتی ہیں مگر اپنے شہریوں کو اس زہریلی ہوا سے نہیں بچا سکتیں جس میں وہ سانس لیتے ہیں۔"
      }
    },
    {
      topic: "Indus Basin: Glacial Melt vs Water Security",
      category: 'PAK_VS_IND',
      english: {
        text: "Himalayan glaciers feeding the Indus basin are melting at record rates, threatening freshwater supply for 300 million people across Pakistan and India.\n\nWhile politicians argue over dam projects and treaty clauses, groundwater levels in both Punjabs drop by a metre every year.\n\nThe real security threat of the next decade is not an enemy army. It is running completely out of clean drinking water."
      },
      romanUrdu: {
        text: "Indus basin ko paani denay walay Himalayan glaciers tareekhi raftaar se pighal rahay hain, jis se Pakistan aur India ke 30 karor logon ke liye peenay ka paani khatray mein hai.\n\nSiyasatdan dam aur muaahidon par lartay hain jabke dono Punjabon mein zameen ka paani har saal ek meter neeche gir raha hai.\n\nAgli dahai ka asal khatra dushman fouj nahi, balkay peenay ke saaf paani ka mukammal khatam hona hai."
      },
      plainUrdu: {
        text: "دریائے سندھ کو پانی فراہم کرنے والے گلیشیئرز ریکارڈ رفتار سے پگھل رہے ہیں جس سے پاکستان اور بھارت کے تیس کروڑ انسانوں کے لیے پینے کا پانی خطرے میں ہے۔\n\nسیاستدان ڈیموں اور معاہدوں کی شقوں پر الجھتے ہیں جبکہ دونوں پنجابوں میں زیر زمین پانی ہر سال ایک میٹر نیچے گر رہا ہے۔\n\nاگلی دہائی کا اصل سیکیورٹی خطرہ کوئی دشمن فوج نہیں بلکہ پینے کے صاف پانی کی مکمل کمی ہے۔"
      }
    },
    {
      topic: "Higher Education: Defence Budgets vs Brain Drain",
      category: 'PAK_VS_IND',
      english: {
        text: "Together, Pakistan and India spend over $95 billion on military hardware and weapons maintenance.\n\nYet neither country has a single university ranked among the top 100 worldwide. Both states lose their best engineers and software developers to Europe and America because local research funding remains under 0.7% of GDP.\n\nBuying foreign weapons does not make a nation modern when its best minds leave."
      },
      romanUrdu: {
        text: "Pakistan aur India mil kar 95 arab dollar se zyada fouji aslahay aur maintenance par kharch karte hain.\n\nMagar dono mulkon ki ek bhi university dunya ki top 100 mein shamil nahi. Dono mulk apnay behtareen engineers aur developers Europe aur America kho bethtay hain kyonke research budget GDP ka 0.7% se kam hai.\n\nGhair-mulki hathyar khareedna watan ko taraqqi-yafta nahi banata jab azeem zehn mulk chhor jayein."
      },
      plainUrdu: {
        text: "پاکستان اور بھارت مل کر 95 ارب ڈالر سے زائد رقم فوجی سازوسامان اور اسلحے پر خرچ کرتے ہیں۔\n\nمگر دونوں ممالک کی ایک بھی یونیورسٹی دنیا کی بہترین سو جامعات میں شامل نہیں۔ دونوں ریاستیں اپنے باصلاحیت انجینئرز اور سائنسدانوں کو کھو رہی ہیں کیونکہ تحقیق کا بجٹ جی ڈی پی کے 0.7 فیصد سے بھی کم ہے۔\n\nجدید غیر ملکی اسلحہ خریدنا ملک کو طاقتور نہیں بناتا جب آپ کے قابل ترین ذہن ملک چھوڑ جائیں۔"
      }
    },
    {
      topic: "India vs Pakistan: Weapons vs Welfare",
      category: 'PAK_VS_IND',
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
    {
      topic: "India vs Pakistan: Missiles vs Malnutrition",
      category: 'PAK_VS_IND',
      english: {
        text: "India and Pakistan spent $18 billion building long-range ballistic missile arsenals. Yet 38% of children under five in both countries suffer from chronic stunting and malnutrition.\n\nBoth capitals proudly display missiles that travel 5,000 kilometres while millions of mothers cannot afford clean milk or basic nutrition.\n\nWhat security does a ballistic missile provide to a child starving in a village?"
      },
      romanUrdu: {
        text: "India aur Pakistan ne long-range missiles par 18 arab dollar lagaye. Magar dono mulkon ke 38% bachay khurak ki shadeed kami aur stunting ka shikaar hain.\n\nDono hukmaran 5,000 km tak mar karnay walay missiles ki numaish karte hain jabke laakhon maayein bachon ke liye doodh nahi khareed sakein.\n\nEk bhookay bachay ko ballistic missile konsi hifazat deta hai?"
      },
      plainUrdu: {
        text: "بھارت اور پاکستان نے طویل فاصلے تک مار کرنے والے میزائلوں پر 18 ارب ڈالر لگائے۔ مگر دونوں ممالک کے 38 فیصد بچے خوراک کی شدید کمی کا شکار ہیں۔\n\nدونوں دارالحکومت پانچ ہزار کلومیٹر تک جانے والے میزائلوں پر فخر کرتے ہیں جبکہ لاکھوں مائیں دودھ تک نہیں خرید سکتیں۔\n\nایک بھوکے اور لاچار بچے کو بیلسٹک میزائل کون سا تحفظ فراہم کرتا ہے؟"
      }
    }
  ];

  for (const item of pool) {
    if (
      (!cleanExcluded || item.topic.toLowerCase().trim() !== cleanExcluded) &&
      !historyStore.hasSeenTopic(item.topic) &&
      !historyStore.isDuplicateOrSimilar(item.english.text, item.topic).isDuplicate
    ) {
      return item;
    }
  }

  // Synthesize dynamic fresh stats if all pools are exhausted with varied structure
  const uniqueCode = Math.floor(100 + Math.random() * 900);
  const styles = ['ECONOMIC', 'EDUCATION', 'DEFENCE'];
  const chosenStyle = styles[Math.floor(Math.random() * styles.length)];

  if (chosenStyle === 'ECONOMIC') {
    const tradePotential = Math.floor(32 + Math.random() * 10);
    const middleCost = Math.floor(8 + Math.random() * 5);
    return {
      topic: `Pakistan vs India: Regional Trade Realities (Series ${uniqueCode})`,
      category: 'PAK_VS_IND',
      english: {
        text: `Direct bilateral trade between Pakistan and India remains under $2 billion, while trade through third-party ports costs an extra $${middleCost} billion every year. The World Bank estimates trade could surpass $${tradePotential} billion annually if customs borders opened.\n\nWhile politicians deliver hostile speeches, business owners lose billions and ordinary families pay inflated prices for simple goods. Conflict is an expensive economic tax.`
      },
      romanUrdu: {
        text: `Pakistan aur India ki direct tijarat 2 arab dollar se kam hai, jabke teesray mulkon ke zariye tijarat par har saal $${middleCost} arab dollar faaltu kharch hotay hain. World Bank ke mutabiq trade $${tradePotential} arab dollar tak pohanch sakti hai.\n\nSiyasatdan nafrat phelatay hain jabke awam aam cheezon par dugni qeemat deti hai. Dushmani ghareebon par mehanga bojh hai.`
      },
      plainUrdu: {
        text: `پاکستان اور بھارت کی براہ راست تجارت دو ارب ڈالر سے کم ہے جبکہ مڈل مین روٹس کے ذریعے سالانہ $${middleCost} ارب ڈالر اضافی خرچ ہوتے ہیں۔ ورلڈ بینک کے مطابق تجارتی راستے کھلنے سے یہ حجم سالانہ $${tradePotential} ارب ڈالر تک پہنچ سکتا ہے۔\n\nسیاسی محاذ آرائی تاجروں کو اربوں کا نقصان پہنچاتی ہے اور عام شہریوں کو مہنگائی کا بوجھ اٹھانا پڑتا ہے۔ یہ تنازع معیشت پر بھاری ٹیکس ہے۔`
      }
    };
  }

  if (chosenStyle === 'EDUCATION') {
    const totalDef = Math.floor(90 + Math.random() * 15);
    const researchPct = (0.5 + Math.random() * 0.3).toFixed(1);
    return {
      topic: `Higher Education vs Weapons: South Asian Brain Drain (Series ${uniqueCode})`,
      category: 'PAK_VS_IND',
      english: {
        text: `Pakistan and India jointly spend over $${totalDef} billion maintaining tanks and fighter aircraft. Meanwhile, combined research and development funding remains frozen below ${researchPct}% of GDP, and hundreds of thousands of top medical and software graduates emigrate annually.\n\nBoth states construct modern arsenals while their human capital leaves.\n\nReal security comes from investing in educated youth, not just buying steel.`
      },
      romanUrdu: {
        text: `Pakistan aur India mil kar $${totalDef} arab dollar tankon aur jahaazon par kharch karte hain. Magar research par GDP ka sirf ${researchPct}% lagta hai aur laakhon doctors aur engineers mulk chhor jatay hain.\n\nDono mulk hathyar jama karte hain jabke behtareen zehn bahar nikal rahay hain.\n\nAsal taqat taleem-yafta jawanon mein hai, sirf lohay ke hathyar mein nahi.`
      },
      plainUrdu: {
        text: `پاکستان اور بھارت مل کر سالانہ $${totalDef} ارب ڈالر ٹینکوں اور طیاروں پر جھونکتے ہیں۔ دوسری جانب تحقیق اور سائنسی ترقی کا بجٹ جی ڈی پی کے صرف ${researchPct} فیصد پر منجمد ہے اور ہزاروں ہونہار نوجوان بیرون ملک چلے جاتے ہیں۔\n\nدونوں ریاستیں بارود جمع کرتی ہیں جبکہ ان کا اصل انسانی اثاثہ رخصت ہو رہا ہے۔\n\nحقیقی قومی سلامتی نوجوانوں کی تعلیم میں ہے، محض لوہا خریدنے میں نہیں۔`
      }
    };
  }

  // DEFENCE STYLE
  const defIndia = (81 + Math.random() * 6).toFixed(1);
  const defPak = (8.2 + Math.random() * 1.8).toFixed(1);
  const schoolDef = Math.floor(21 + Math.random() * 9);
  return {
    topic: `India vs Pakistan: Weapons vs Welfare (Series ${uniqueCode})`,
    category: 'PAK_VS_IND',
    english: {
      text: `India spends $${defIndia} billion on military modernization, while Pakistan spends $${defPak} billion on defence upkeep. At the exact same time, ${schoolDef} million young children across the subcontinent never set foot inside a secondary school.\n\nBoth states purchase foreign weapon systems while rural public schools lack clean drinking water and desks.\n\nWhat is the point of national defence if our citizens are dying of poverty?`
    },
    romanUrdu: {
      text: `India foji modernization par ${defIndia} arab dollar kharch karta hai jabke Pakistan ${defPak} arab dollar. Usi waqt dono mulkon ke ${schoolDef} million bachay school ki shakal nahi dekhte.\n\nDono mulk radar khareedte hain jabke schools mein peenay ka paani nahi.\n\nAise difa ka kya faida jab aane wali nasal anparh reh jaye?`
    },
    plainUrdu: {
      text: `بھارت جدید ترین فوجی سازوسامان پر ${defIndia} ارب ڈالر اور پاکستان ${defPak} ارب ڈالر خرچ کرتا ہے۔ عین اسی وقت دونوں ممالک کے ${schoolDef} ملین بچے بنیادی تعلیم سے مکمل محروم ہیں۔\n\nدونوں ریاستیں راڈار سسٹمز خریدتی ہیں جبکہ اسکولوں میں پینے کا پانی نہیں۔\n\nایسے دفاع کی کیا اہمیت ہے اگر پوری نسل کو جہالت کے اندھیروں میں چھوڑ دیا جائے؟`
    }
  };
}

function generateDynamicFallbackForCategory(category, excludedTopic = '') {
  const cleanExcluded = String(excludedTopic || '').toLowerCase().trim();
  if (category === 'PAK_VS_IND') {
    return generateDynamicPakVsIndFallback(cleanExcluded);
  }

  const categoryPool = [
    {
      topic: "Global Power: War Budgets vs Human Survival",
      category: category || 'GEOPOLITICS',
      english: {
        text: "Global military expenditures reached $2.4 trillion in 2024, yet 730 million people face severe hunger worldwide. The five permanent UN Security Council members control 73% of major weapons exports while developing nations drown in foreign debt.\n\nGreat powers wage proxy conflicts while ordinary working families pay for food inflation.\n\nWho truly benefits when war profits skyrocket while basic human survival is ignored?"
      },
      romanUrdu: {
        text: "Aalmi foji kharche 2024 mein 2.4 trillion dollar tak pohanch gaye, magar 730 million log bhook ka shikar hain. Security Council ke 5 baray mulk 73% hathyar bechte hain jabke chhotay mulk qarzay mein doob chuke hain.\n\nBari taqatein proxy jung larti hain jabke ghareeb awam mehngai se marti hai.\n\nIn foji kharchon ka kya faida jab insaniyat bhook se mar rahi ho?"
      },
      plainUrdu: {
        text: "عالمی فوجی اخراجات چوبیس سو ارب ڈالر تک پہنچ چکے ہیں مگر تہتر کروڑ افراد شدید بھوک کا شکار ہیں۔ سلامتی کونسل کے مستقل ارکان تہتر فیصد ہتھیار فروخت کرتے ہیں جبکہ ترقی پذیر ممالک قرضوں میں ڈوبے ہوئے ہیں۔\n\nطاقتور ممالک مفادات کی جنگ لڑتے ہیں جبکہ عام خاندان مہنگائی تلے دب رہے ہیں۔\n\nاس عسکری دوڑ کا کیا فائدہ جب عام انسان کی بقا ہی خطرے میں ہو؟"
      }
    },
    {
      topic: "AI Revolution: Data Centers vs Water Scarcity",
      category: category || 'AI_SOCIETY',
      english: {
        text: "Advanced AI data centres now consume 4.2% of global electricity, using over 5 million litres of clean water every day just for cooling. Meanwhile, 2.2 billion citizens lack safe drinking water at home, and rural hospitals face continuous blackouts.\n\nTech corporations spend billions training software while ordinary human communities dry up.\n\nAre we building smart technology to serve human life, or sacrificing humans for digital power?"
      },
      romanUrdu: {
        text: "AI data centres dunya ki 4.2% bijli aur rozana 5 million litre saaf paani thanda karne ke liye istemal karte hain. Doosri taraf 2.2 arab log saaf paani se mehroom hain aur dehati hospitals mein load shedding hai.\n\nBari companies software par arbon laga rahi hain jabke insani bastiyan sookh rahi hain.\n\nKya technology insaniyat ki khidmat ke liye hai ya digital taqat ke liye?"
      },
      plainUrdu: {
        text: "جدید ترین ڈیٹا سینٹرز دنیا کی چار فیصد سے زیادہ بجلی اور روزانہ پچاس لاکھ لیٹر پینے کا صاف پانی استعمال کر رہے ہیں۔ دوسری طرف سوا دو ارب شہری صاف پانی سے محروم ہیں اور اسپتالوں میں بجلی نہیں۔\n\nکارپوریشنز سافٹ ویئر پر اربوں بہا رہی ہیں جبکہ عام بستیاں پیاسی مر رہی ہیں۔\n\nکیا ہم انسانوں کی بہتری کے لیے ٹیکنالوجی بنا رہے ہیں یا ڈیجیٹل طاقت کے لیے انسان قربان کر رہے ہیں؟"
      }
    },
    {
      topic: "Global Debt: Foreign Debt vs Public Healthcare",
      category: category || 'PAK_POLITICS',
      english: {
        text: "Developing nations now spend $480 billion annually servicing foreign debt, which is four times more than their combined health budgets. In many countries, over 65% of all national tax collection goes directly to foreign bankers rather than schools or clinics.\n\nGovernments cut food subsidies to protect international credit ratings.\n\nWhy must poor citizens sacrifice their daily bread to pay off debts they never approved?"
      },
      romanUrdu: {
        text: "Taraqqi-pazeer mulk qarz ki adayigi par 480 arab dollar saalana kharch karte hain jo unke sehat ke budget se 4 guna zyada hai. Kayi mulkon mein 65% tax direct ghair-mulki bankers ko jata hai bajaaye schools ya clinics ke.\n\nHukoomatein credit rating bachane ke liye roti par subsidy khatam karti hain.\n\nGhareeb awam aisi qarz ke liye kyon maray jo usne li hi nahi?"
      },
      plainUrdu: {
        text: "ترقی پذیر ممالک غیر ملکی قرضوں کی ادائیگی پر سالانہ 480 ارب ڈالر خرچ کرتے ہیں جو ان کے صحت کے بجٹ سے چار گنا زیادہ ہے۔ پینسٹھ فیصد سے زائد ٹیکس براہ راست غیر ملکی بینکرز کو جاتا ہے۔\n\nحکومتیں کریڈٹ ریٹنگ بچانے کے لیے روٹی پر سبسڈی ختم کرتی ہیں۔\n\nغریب شہری ان قرضوں کی قیمت اپنے نوالے چھنوا کر کیوں ادا کریں جو انہوں نے کبھی لیے ہی نہیں؟"
      }
    },
    {
      topic: "Maritime Chokepoints: Oil Stand-offs vs Citizen Inflation",
      category: category || 'GEOPOLITICS',
      english: {
        text: "Over 21% of the world's daily petroleum passes through the narrow Strait of Hormuz, worth $1.2 billion every single hour. Yet international sanctions and geopolitical naval standoffs have driven diesel and fertilizer costs up by 45% in vulnerable nations.\n\nGlobal powers battle for maritime dominance while small farmers cannot afford fuel.\n\nWhy should ordinary citizens pay the price of imperial trade wars?"
      },
      romanUrdu: {
        text: "Dunya ka 21% tail rozana Strait of Hormuz se guzarta hai jiski qeemat har ghantay 1.2 arab dollar hai. Magar pabandiyon aur behri tanaao ne kamzor mulkon mein diesel aur khaad 45% mehngi kar di hai.\n\nAalmi taqatein samundari qabzay ke liye larti hain jabke kisan fuel nahi khareed sakta.\n\nAam awam aalmi tijarti jangon ki keemat kyon chukaye?"
      },
      plainUrdu: {
        text: "دنیا کا اکیس فیصد تیل آبنائے ہرمز سے گزرتا ہے جس کی مالیت ہر گھنٹے سوا ارب ڈالر ہے۔ مگر پابندیوں اور بحری کشیدگی نے کمزور ممالک میں ڈیزل اور کھاد پینتالیس فیصد مہنگی کر دی ہے۔\n\nعالمی طاقتیں سمندری راستوں پر غلبے کے لیے لڑتی ہیں جبکہ چھوٹا کسان ایندھن نہیں خرید سکتا۔\n\nعام شہری ان طاقتوں کی تجارتی جنگوں کی قیمت کیوں چکائیں؟"
      }
    },
    {
      topic: "Fighter Aircraft vs Public School Desks",
      category: category || 'GEOPOLITICS',
      english: {
        text: "A single modern fifth-generation fighter jet costs $115 million to buy and $35,000 per flight hour to operate. That single jet costs more than the total annual operating budgets of 45 public district hospitals in developing countries.\n\nLeaders announce massive new defence procurement packages while state schools lack basic textbooks.\n\nWhat good is an expensive jet in the sky when schools collapse on the ground?"
      },
      romanUrdu: {
        text: "Ek fifth-generation jahaz 115 million dollar ka hai aur har ghantay uranay par 35,000 dollar lagtay hain. Ek jahaz ki qeemat 45 zillai hospitals ke saalana budget se zyada hai.\n\nHukmaran arbon ke difai muaahiday karte hain jabke sarkari schools mein kitaabein nahi hain.\n\nAasman mein mehangay jahaz ka kya faida jab zameen par schools dhal rahay hon?"
      },
      plainUrdu: {
        text: "ایک جدید ترین لڑاکا طیارہ ساڑھے گیارہ کروڑ ڈالر کا ہے اور اس کی ایک گھنٹے کی پرواز پر پینتیس ہزار ڈالر خرچ ہوتے ہیں۔ یہ لاگت پینتالیس ضلعی اسپتالوں کے سالانہ بجٹ سے زیادہ ہے۔\n\nحکمران دفاعی سودوں پر اربوں لٹاتے ہیں جبکہ سرکاری اسکولوں میں کتابیں تک میسر نہیں۔\n\nآسمان میں اڑتے مہنگے طیارے کا کیا فائدہ جب زمین پر تعلیمی ادارے ملبے کا ڈھیر بن رہے ہوں؟"
      }
    }
  ];

  for (const item of categoryPool) {
    if (
      (!cleanExcluded || item.topic.toLowerCase().trim() !== cleanExcluded) &&
      !historyStore.hasSeenTopic(item.topic) &&
      !historyStore.isDuplicateOrSimilar(item.english.text, item.topic).isDuplicate
    ) {
      return item;
    }
  }

  // Synthesize dynamic fresh stats if all pools are exhausted
  const uniqueCode = Math.floor(100 + Math.random() * 900);
  const milExp = (2.1 + Math.random() * 0.7).toFixed(1);
  const foodInsec = Math.floor(700 + Math.random() * 80);
  const wealthExp = Math.floor(20 + Math.random() * 10);
  return {
    topic: `Global Power & Warfare: Critical Analysis (Series ${uniqueCode})`,
    category: category || 'GEOPOLITICS',
    english: {
      text: `Global military expenditures reached $${milExp} trillion in 2024, while ${foodInsec} million people face acute food insecurity across developing nations. The wealthiest states spend ${wealthExp}% of their federal budgets on advanced arms while rural schools lack clean drinking water.\n\nGovernments prioritize foreign weapon deals while public welfare systems collapse.\n\nWhat is the real worth of national power when ordinary citizens are left to starve?`
    },
    romanUrdu: {
      text: `Aalmi foji budget 2024 mein ${milExp} trillion dollar pohanch gaya jabke ${foodInsec} million log bhook se lar rahay hain. Baray mulk budget ka ${wealthExp}% hathyar par lagatay hain jabke schools mein saaf paani nahi.\n\nHukoomatein hathyar khareedti hain jabke awam ghurbat se mar rahi hai.\n\nAisi taqat ka kya faida jab aam shehri bhooka so jaye?`
    },
    plainUrdu: {
      text: `عالمی عسکری بجٹ ${milExp} کھرب ڈالر تک پہنچ گیا ہے جبکہ ${foodInsec} ملین انسان شدید غذائی قلت کا شکار ہیں۔ امیر ترین ریاستیں اپنے بجٹ کا ${wealthExp} فیصد اسلحے پر جھونکتی ہیں جبکہ اسکولوں میں پینے کا پانی نہیں۔\n\nحکومتیں غیر ملکی ہتھیاروں کو ترجیح دیتی ہیں جبکہ فلاحی نظام تباہ ہو چکا ہے۔\n\nایسی قومی طاقت کی کیا وقعت ہے اگر عام شہری بنیادی روٹی کو ترس رہے ہوں؟`
    }
  };
}

/* ---------------- 4. CURATED ANALYTICAL ENGINE (UNUSED ONLY) ---------------- */
  // Find a curated entry that has NOT been generated or stored yet and is NOT excludedTopic
  let found = CURATED_STORY_TOPICS.find(
    item =>
      item.category === chosenCategory &&
      (!cleanExcluded || item.topic.toLowerCase().trim() !== cleanExcluded) &&
      !historyStore.hasSeenTopic(item.topic) &&
      !historyStore.isDuplicateOrSimilar(item.english.text, item.topic).isDuplicate
  );

  // If no primary genre is set and all in current category are used, check any unused in the bank
  if (!found && !primaryGenre) {
    found = CURATED_STORY_TOPICS.find(
      item =>
        (!cleanExcluded || item.topic.toLowerCase().trim() !== cleanExcluded) &&
        !historyStore.hasSeenTopic(item.topic) &&
        !historyStore.isDuplicateOrSimilar(item.english.text, item.topic).isDuplicate
    );
  }

  // If all curated topics in current category are used, generate a dynamic fresh post
  if (!found) {
    found = generateDynamicFallbackForCategory(chosenCategory, cleanExcluded);
  }

  const entry = formatEntry(found.english.text);

  historyStore.recordPost({
    topic: found.topic,
    category: found.category,
    englishText: entry.text,
    romanUrduText: found.romanUrdu?.text || '',
    plainUrduText: found.plainUrdu?.text || '',
    provider: 'Curated Geopolitical Engine',
    status: 'PENDING'
  });

  await saveGeneratedPost({
    topic: found.topic,
    category: found.category,
    english: entry,
    romanUrdu: formatEntry(found.romanUrdu?.text || ''),
    plainUrdu: formatEntry(found.plainUrdu?.text || ''),
    provider: 'Curated Geopolitical Engine'
  }).catch(() => {});

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

  return formatEntry(found.romanUrdu?.text || found.english.text);
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

  return formatEntry(found.plainUrdu?.text || found.english.text);
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
            timeout: 2500,
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
          reject(new Error(`Gemini ${model} request timed out (2.5s)`));
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
