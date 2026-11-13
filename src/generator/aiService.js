/**
 * X-BOT — Bold Geopolitical Analysis, Political Commentary & Social Media Engagement
 *
 * Core Focus:
 * - Bold, analytical, thought-provoking political and geopolitical commentary
 * - Uses real numbers, comparisons, irony, sarcasm, and uncomfortable questions
 * - Sounds like an independent commentator who makes readers stop, think, and reply
 *
 * Categories:
 * 1. Geopolitics & Global Power (India vs Pakistan, China vs USA, Middle East, Sanctions)
 * 2. Pakistan Politics & Economy (Spending, IMF loans, Defence vs Welfare, Dynasties)
 * 3. Social & Regional Issues (Balochistan, KPK, Sindh, Punjab, Unequal development)
 * 4. AI & Human Society (Job replacement, dependency, surveillance, data centres)
 * 5. Climate & Global Power (Flood injustice, global emissions, rich vs poor)
 * 6. Satirical Commentary (Sugar vs guns, promises vs reality, everyday irony)
 *
 * Standards:
 * - English Level: Simple Pakistani English (A1–A2)
 * - Target Length: 500–900 characters (max 1000), 5–8 sentences with paragraph breaks
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
   CURATED ANALYTICAL TOPIC BANK (500–900 CHARS, A1-A2 ENGLISH)
========================================================= */

export const CURATED_STORY_TOPICS = [
  // 1. Geopolitics: India vs Pakistan
  {
    topic: "India vs Pakistan: Weapons vs Welfare",
    category: 'GEOPOLITICS',
    english: {
      text: "India spends over 70 billion dollars on its military every year. Pakistan spends around 8 to 9 billion dollars. Yet both countries talk about winning the next war.\n\nMillions of people on both sides of the border still lack clean drinking water, proper hospitals, and decent schools. One country buys advanced fighter jets, while the other spends a huge part of its budget just to keep up.\n\nA country needs security, but it also needs healthy, educated citizens. What is the real point of winning an imaginary war when ordinary people are already losing their lives to poverty and disease?"
    },
    romanUrdu: {
      text: "India har saal foj par 70 arab dollar se zyada kharch karta hai, jabke Pakistan 8 se 9 arab dollar lagata hai. Lekin dono mulk agli jung jeetne ke daaway karte hain.\n\nBorder ke dono taraf karoron log saaf paani, acche aspatal aur taleem ke liye taras rahe hain. Ek mulk mehnge jangi jahaz khareedta hai, jabke dusra apna bara budget sirf muqabla karne par laga deta hai.\n\nFoj zaroori hai, lekin log bhi to zinda rehne chahiye. Aisi jung jeetne ka kya faida jahan aam shehri pehle hi ghurbat aur beemari se haar raha ho?"
    },
    plainUrdu: {
      text: "بھارت ہر سال فوج پر 70 ارب ڈالر سے زیادہ خرچ کرتا ہے، جبکہ پاکستان کا دفاعی بجٹ تقریباً 8 سے 9 ارب ڈالر ہے۔ اس کے باوجود دونوں ملک اگلی جنگ جیتنے کے دعوے کرتے ہیں۔\n\nسرحد کے دونوں طرف کروڑوں لوگ پینے کے صاف پانی، اچھے ہسپتالوں اور تعلیم کے لیے ترس رہے ہیں۔ ایک ملک مہنگے جنگی جہاز خریدتا ہے جبکہ دوسرا صرف برابری قائم رکھنے کے لیے وسائل جھونک دیتا ہے۔\n\nملک کو حفاظت ضرور چاہیے، مگر زندہ اور خوشحال شہری بھی چاہئیں۔ ایسی جنگ جیتنے کا کیا فائدہ جہاں عام انسان پہلے ہی غربت اور بیماری سے ہار رہا ہو؟"
    }
  },

  // 2. Satirical Commentary: Sugar vs Guns
  {
    topic: "Sugar vs Guns: The Hidden Danger",
    category: 'SATIRICAL_COMMENTARY',
    english: {
      text: "Everyone is terrified of a man carrying a loaded gun. But nobody gets scared of the three big spoons of white sugar in their daily cup of tea.\n\nA bullet can kill a person in one second. But too much sugar damages your heart, destroys your kidneys, and ruins your health slowly over twenty years. We panic over visible dangers that rarely touch us, yet we happily welcome the silent killers sitting right inside our kitchens.\n\nSo tell me honestly: what is actually more dangerous in your daily life — the gun outside your house, or the sugar inside your teacup?"
    },
    romanUrdu: {
      text: "Hathiyar uthaye banday se har koi darta hai. Lekin rozana chai ki pyali mein daali gayi teen chamach cheeni se kisi ko darr nahi lagta.\n\nGoli ek second mein jaan le sakti hai. Magar cheeni bees saal mein ahista ahista dil, gurday aur sehat tabah kar deti hai. Hum un khatraat se darte hain jo shayed kabhi na aaein, lekin jo khatra hamare kitchen mein baitha hai use maze se peetay hain.\n\nAb sach bataiye: aap ki zindagi ke liye zyada khatarnak kya hai — bahar khari bandook ya chai mein ghuli cheeni?"
    },
    plainUrdu: {
      text: "ہتھیار اٹھائے بندے سے ہر کوئی خوفزدہ ہو جاتا ہے۔ لیکن روزانہ چائے کی پیالی میں ڈالی جانے والی تین چمچ چینی سے کسی کو ڈر نہیں لگتا۔\n\nگولی ایک سیکنڈ میں جان لے سکتی ہے۔ مگر حد سے زیادہ چینی بیس سال میں خاموشی سے دل، گردے اور صحت برباد کر دیتی ہے۔ ہم ان خطرات پر شور مچاتے ہیں جو شاذ و نادر سامنے آتے ہیں، لیکن جو خاموش قاتل باورچی خانے میں بیٹھا ہے اسے خوشی سے پیتے ہیں۔\n\nاب سچ بتائیے: آپ کی روزمرہ زندگی کے لیے زیادہ خطرناک کیا ہے — گھر کے باہر کھڑی بندوق یا چائے میں گھلی چینی؟"
    }
  },

  // 3. Geopolitics: China vs USA
  {
    topic: "China vs USA: Business or Control?",
    category: 'GEOPOLITICS',
    english: {
      text: "America wants to remain the undisputed boss of the world. China wants to take that seat. Both countries talk endlessly about world peace, free trade, and friendship.\n\nIn reality, both only care about power. China spends hundreds of billions building roads, bridges, and deep-sea ports across Asia and Africa. America responds with trade bans and over 750 military bases across the planet. Smaller countries are trapped in the middle, forced to pick a side.\n\nAre these two superpowers really trying to help the developing world, or are they just fighting over who gets to own the market?"
    },
    romanUrdu: {
      text: "America duniya ka akela badshah rehna chahta hai. China uski kursi cheenna chahta hai. Dono aalmi aman, azaad tijarat aur dosti ki baatein karte hain.\n\nLekin haqeeqat mein dono ko sirf taqat chahiye. China Asia aur Africa mein arabon dollar ki sarkain aur bandargahain bana raha hai. America pabandiyan lagata hai aur duniya bhar mein 750 se zyada foji adday chalata hai. Chotay mulk darmiyan mein phas kar faisla nahi kar pa rahe.\n\nKya yeh superpowers ghareeb mulkon ki madad kar rahi hain, ya sirf is baat par larr rahi hain ke aalmi market par qabza kiska hoga?"
    },
    plainUrdu: {
      text: "امریکہ دنیا کا بلا شرکت غیرے سردار رہنا چاہتا ہے۔ چین یہ کرسی حاصل کرنے کی دوڑ میں ہے۔ دونوں ملک عالمی امن، آزاد تجارت اور دوستی کی لمبی لمبی باتیں کرتے ہیں۔\n\nمگر حقیقت یہ ہے کہ دونوں کو صرف طاقت اور غلبہ چاہیے۔ چین ایشیا اور افریقہ میں اربوں ڈالر سے سڑکیں اور بندرگاہیں بنا رہا ہے۔ امریکہ پابندیاں لگاتا ہے اور دنیا بھر میں 750 سے زیادہ فوجی اڈے چلاتا ہے۔ چھوٹے ممالک درمیان میں پھنس کر قیمت چکا رہے ہیں۔\n\nکیا یہ دونوں طاقتیں غریب ممالک کی مدد کر رہی ہیں، یا صرف اس بات پر دست و گریباں ہیں کہ دنیا کے وسائل پر قبضہ کس کا ہوگا؟"
    }
  },

  // 4. AI & Human Society
  {
    topic: "AI and Thinking: Are We Becoming Helpless?",
    category: 'AI_HUMAN_SOCIETY',
    english: {
      text: "Artificial intelligence can now write your office emails, pass university exams, and create complete computer software in seconds. It looks like magical progress.\n\nBut look at what is happening to the human mind. Students don't read books anymore because a bot writes their homework. Young professionals don't solve difficult problems because an algorithm gives them the answer. When you stop using your muscles, your body gets weak. When you stop using your brain, your thinking dies.\n\nTechnology was invented to make human beings stronger and freer. So why does it feel like AI is slowly turning us into helpless spectators?"
    },
    romanUrdu: {
      text: "AI ab aap ke emails likh sakti hai, exams pass kar sakti hai aur software bana sakti hai. Yeh dekhne mein kamaal lagta hai.\n\nLekin insani dimaag ka kya ho raha hai? Students kitabein nahi parhte kyunke bot homework kar deta hai. Log mushkil masail par sochna chor chukay hain kyunke computer foran jawab deta hai. Jab aap jism harkat nahi dete to kamzor ho jate hain, aur jab dimaag istemal nahi karte to aqal khatam ho jati hai.\n\nTechnology insaan ko taqatwar banane aayi thi. Phir aisa kyun lagta hai ke AI ahista ahista humein be-bas aur mohtaj bana rahi hai?"
    },
    plainUrdu: {
      text: "مصنوعی ذہانت اب آپ کی ای میلز لکھ سکتی ہے، یونیورسٹی کے امتحان پاس کر سکتی ہے اور منٹوں میں کمپیوٹر سافٹ ویئر بنا سکتی ہے۔ یہ بظاہر بڑا معجزہ لگتا ہے۔\n\nمگر انسانی ذہن کے ساتھ کیا ہو رہا ہے؟ طلبہ کتابیں نہیں پڑھتے کیونکہ چیٹ بوٹ ہوم ورک کر دیتا ہے۔ نوجوان مشکل مسائل پر غور نہیں کرتے کیونکہ کمپیوٹر فوری جواب فراہم کرتا ہے۔ اگر جسم حرکت نہ کرے تو کمزور ہو جاتا ہے، اور اگر دماغ استعمال نہ ہو تو سوچنے کی صلاحیت ختم ہو جاتی ہے۔\n\nٹیکنالوجی انسان کو طاقتور بنانے کے لیے بنی تھی۔ پھر ایسا کیوں محسوس ہوتا ہے کہ AI ہمیں آہستہ آہستہ محتاج بنا رہی ہے؟"
    }
  },

  // 5. Pakistan Politics & Economy: IMF Trap
  {
    topic: "Pakistan and the IMF: Borrowing to Pay Debts",
    category: 'PAKISTAN_POLITICS',
    english: {
      text: "Pakistan has knocked on the IMF's door more than twenty times. Every single government promises that this current IMF program will be the very last one.\n\nThen electricity tariffs jump, petrol prices break records, and heavy taxes are slapped on everyday food items. The new loan doesn't build modern factories or create jobs. Most of the borrowed money goes straight back out to pay interest on older loans that politicians took years ago.\n\nIf a family borrows money from a neighbour just to pay interest to the local shopkeeper, that family goes broke. How can a country of 240 million people become independent if its leaders keep doing the exact same thing?"
    },
    romanUrdu: {
      text: "Pakistan bees se zyada martaba IMF ke darwazay par dastak de chuka hai. Har nayi hukumat aakar kehti hai ke yeh hamara aakhri IMF program hoga.\n\nUske baad bijli ke bill aasmaan par pohanchte hain, petrol mehanga hota hai aur aam roti par tax lag jata hai. Naye qarzay se na factory lagti hai na rozgar milta hai, balkay purane qarzay ka sood adaa hota hai.\n\nAgar koi gharana dukan ka sood chukane ke liye hamsaye se qarza le, to woh barbaad ho jata hai. 24 karor awam ka mulk azaad kaise ho sakta hai agar hamare hukumran hamesha yahi karte rahein?"
    },
    plainUrdu: {
      text: "پاکستان بیس سے زائد بار آئی ایم ایف کے دروازے پر دستک دے چکا ہے۔ ہر نئی حکومت وعدہ کرتی ہے کہ یہ ہمارا آخری آئی ایم ایف پروگرام ہوگا۔\n\nپھر بجلی کے بل آسمان کو چھوتے ہیں، پیٹرول مہنگا ہوتا ہے اور عام خوراک پر بھاری ٹیکس لگا دیے جاتے ہیں۔ نئے قرضے سے نہ کارخانے لگتے ہیں اور نہ روزگار ملتا ہے، بلکہ سارا پیسہ پرانے قرضوں کا سود چکانے میں چلا جاتا ہے۔\n\nاگر کوئی خاندان پرانا سود ادا کرنے کے لیے ہمسائے سے نیا ادھار لے تو وہ دیوالیہ ہو جاتا ہے۔ چوبیس کروڑ عوام کا ملک معاشی طور پر خودمختار کیسے بنے گا اگر حکمران مسلسل یہی چکر چلاتے رہے؟"
    }
  },

  // 6. Social & Regional Issues: Balochistan & National Wealth
  {
    topic: "Balochistan: Rich Ground, Poor Citizens",
    category: 'SOCIAL_ETHNIC_ISSUES',
    english: {
      text: "Balochistan covers nearly half of Pakistan's entire land area. Its mountains are filled with gold, copper, and natural gas that has heated stoves in Lahore and Karachi for decades.\n\nYet walk into the towns of Balochistan today. You will find broken single-room clinics without doctors, dusty schools without teachers, and youth searching desperately for basic jobs. The natural wealth flows out through massive pipelines and big corporate contracts, while local communities are left with empty hands and heavy grievances.\n\nA federation is not just a line drawn on an atlas. It is built on trust, respect, and fair distribution. How can you demand national unity from people when you refuse to give them clean water from their own land?"
    },
    romanUrdu: {
      text: "Balochistan Pakistan ke lagbhag aadhay raqbay par phela hai. Iske paharon mein sona, tanba aur gas hai jo daheeyon se Lahore aur Karachi ke choolhay jala rahi hai.\n\nLekin Balochistan ke shehron mein ja kar dekhein. Wahan baghair doctor ke aspatal, baghair ustaad ke schools aur be-rozgar nojawan milenge. Qudrati daulat pipelines ke zariye nikal jati hai, aur maqami log khali haath reh jate hain.\n\nWifaq sirf naqshay par khenchi lakeer nahi hota. Yeh barabari aur insaaf se banta hai. Aap un logon se qoumi yakjehti ki umeed kaise rakh sakte hain jinhein apni zameen ka saaf paani tak nahi milta?"
    },
    plainUrdu: {
      text: "بلوچستان پاکستان کے تقریباً نصف رقبے پر محیط ہے۔ اس کے پہاڑوں میں سونا، تانبا اور قدرتی گیس ہے جو دہائیوں سے لاہور اور کراچی کے چولہے جلا رہی ہے۔\n\nمگر کبھی بلوچستان کے قصبوں میں جا کر دیکھیں۔ وہاں بغیر ڈاکٹر کے کلینک، بغیر استاد کے اسکول اور بے روزگار نوجوان دکھائی دیں گے۔ قدرتی وسائل پائپ لائنوں کے ذریعے نکل جاتے ہیں جبکہ مقامی آبادی خالی ہاتھ رہ جاتی ہے۔\n\nوفاق محض نقشے پر کھینچی گئی لکیر نہیں ہوتا۔ یہ انصاف، برابری اور اعتماد سے بنتا ہے۔ آپ ان لوگوں سے قومی یکجہتی کا تقاضا کیسے کر سکتے ہیں جنہیں اپنی ہی زمین سے پینے کا صاف پانی تک نصیب نہیں؟"
    }
  },

  // 7. Climate & Global Power: The Flood Injustice
  {
    topic: "Climate Injustice: Who Pollutes and Who Drowns?",
    category: 'CLIMATE_GLOBAL_POWER',
    english: {
      text: "Pakistan produces less than one percent of total global greenhouse emissions. Yet when the monsoon rains turn violent, one-third of the country goes entirely underwater.\n\nRich Western industrial nations built gigantic wealth by burning coal and oil for two hundred years. Today, when Pakistani farmers lose their crops, cattle, and mud houses to flash floods, international climate summits offer polite sympathy and tiny loans instead of real reparations.\n\nWealthy corporations fly in private jets to talk about saving the planet while poor village children sleep under open skies in Sindh and Balochistan. Is climate change really an environmental crisis, or is it just the world's most unequal economic crime?"
    },
    romanUrdu: {
      text: "Pakistan poori duniya ki aalmi aaloodgi mein ek percent se bhi kam hissa dalta hai. Lekin jab barish aati hai to mulk ka aik tihai hissa paani mein doob jata hai.\n\nAmeer Maghribi mumalik ne do sau saal tail aur koyla jala kar daulat kamayi. Magar jab hamare kisanon ki faslein aur ghar sailaab mein beh jate hain, to aalmi conferences mein sirf tasalliyan aur qarzay diye jate hain.\n\nBari companies ke malik private jets mein baith kar maholiyat par bhashan dete hain, jabke Sindh ke bachay khulay aasmaan talay sote hain. Kya yeh sirf mausam ki tabdeeli hai, ya dunya ka sab se bara na-insafi par mabni nizaam?"
    },
    plainUrdu: {
      text: "پاکستان دنیا کی مجموعی ماحولیاتی آلودگی میں ایک فیصد سے بھی کم کا ذمہ دار ہے۔ مگر جب مانسون بے قابو ہوتا ہے تو ملک کا ایک تہائی حصہ پانی میں ڈوب جاتا ہے۔\n\nامیر صنعتی ممالک نے دو سو سال کوئلہ اور تیل جلا کر بے پناہ دولت بنائی۔ لیکن جب ہمارے کسانوں کی فصلیں، مویشی اور کچے مکانات سیلاب کی نذر ہو جاتے ہیں، تو عالمی کانفرنسوں میں صرف ہمدردی کے بیانات اور نئے قرضے ملتے ہیں۔\n\nبڑی کمپنیوں کے مالکان نجی طیاروں میں بیٹھ کر ماحول بچانے کی باتیں کرتے ہیں جبکہ سندھ اور بلوچستان کے بچے کھلے آسمان تلے رات گزارتے ہیں۔ کیا یہ محض موسمی تبدیلی ہے، یا تاریخ کا سب سے بڑا معاشی ظلم؟"
    }
  },

  // 8. AI & Tech: Energy and Water Grids
  {
    topic: "AI Data Centres: Power for Bots vs Power for People",
    category: 'AI_HUMAN_SOCIETY',
    english: {
      text: "Every time you ask an artificial intelligence tool to write an essay or generate an image, powerful supercomputers consume electricity and clean cooling water.\n\nGlobal technology giants are building massive data centres that use as much electricity as entire medium-sized cities. At the very same time, millions of ordinary families in developing countries suffer ten to twelve hours of power cuts every single hot summer day.\n\nClean water and electric power are basic human necessities. When tech monopolies buy up renewable energy grids just to train faster chatbots, we have to ask ourselves: who is this modern technological revolution actually serving?"
    },
    romanUrdu: {
      text: "Jab bhi aap AI se koi sawaal poochtay hain ya tasweer banwate hain, to baray supercomputers bijli aur saaf thanda paani peetay hain.\n\nGlobal tech companies aisi data centres bana rahi hain jo poore poore shehron ke barabar bijli khati hain. Doosri taraf garmion mein ghareeb mulkon ke log barah barah ghantay load shedding bardasht karte hain.\n\nBijli aur paani insani zaroorat hain. Jab barri companies chatbots chalane ke liye bijli ke grid khareed leti hain, to sawaal yeh hai ke yeh nayi taraqqi aakhir kis ke faiday ke liye hai?"
    },
    plainUrdu: {
      text: "جب بھی آپ مصنوعی ذہانت سے کوئی سوال پوچھتے ہیں یا تصویر بنواتے ہیں، تو بڑے ڈیٹا سینٹرز بے پناہ بجلی اور ٹھنڈا پانی استعمال کرتے ہیں۔\n\nعالمی ٹیکنالوجی کمپنیاں ایسے ڈیٹا سینٹرز بنا رہی ہیں جو پورے شہروں جتنی بجلی خرچ کر دیتے ہیں۔ دوسری طرف ترقی پذیر ممالک میں غریب خاندان شدید گرمیوں میں بارہ بارہ گھنٹے بجلی کی بندش جھیلتے ہیں۔\n\nپانی اور بجلی بنیادی انسانی ضرورت ہیں۔ جب بڑی کارپوریشنز چیٹ بوٹس کی ٹریننگ کے لیے توانائی کے ذخائر خرید لیتی ہیں، تو سوچنے کی بات یہ ہے کہ یہ جدید انقلاب آخر کس کی خدمت کر رہا ہے؟"
    }
  }
];

let categoryRotationIndex = 0;
let storyCounter = 0;

const MIN_CHARACTERS = 450;
const MAX_CHARACTERS = 950;
const ABSOLUTE_MAX_CHARACTERS = 1000;

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
    throw new Error(`AI post exceeds limit (${entry.charCount} chars, max ${ABSOLUTE_MAX_CHARACTERS})`);
  }

  return {
    topic: typeof res.topic === 'string' && res.topic.trim() ? res.topic.trim() : chosenTopic,
    category: typeof res.category === 'string' && res.category.trim() ? res.category.trim() : chosenCategory,
    english: entry
  };
}

/* =========================================================
   MASTER ANALYTICAL AI PROMPT (BOLD POLITICAL COMMENTARY)
========================================================= */

function createEnglishPrompt(chosenTopic, usedTopics, targetCategory = null) {
  const avoidListStr =
    usedTopics.length > 0
      ? usedTopics.slice(0, 30).join('; ')
      : 'None';

  const categoryName = targetCategory?.name || 'Geopolitics & Political Commentary';
  const categoryKeywords = targetCategory?.keywords?.join(', ') || 'Global power, Pakistan politics, economy, AI, society';

  return `You are an independent, sharp, and fearless Pakistani political commentator and social media analyst.
You write bold, intelligent, and highly engaging posts that make readers stop, think, disagree, discuss, and comment.

TOPIC: "${chosenTopic}"
CATEGORY: ${categoryName}
THEMES TO DRAW FROM: ${categoryKeywords}

============================================================
1. LANGUAGE RULES — SIMPLE PAKISTANI ENGLISH (A1–A2)
============================================================
- Write in simple, natural English that ordinary Pakistani social media users easily understand.
- Write how an educated Pakistani explains real politics to a friend or ordinary people.
- Short, direct sentences. Common English words. Natural expressions.
- Simple comparisons and strong, confident observations.
- NEVER use academic, university-style, or confusing English.
- Avoid difficult vocabulary (do not write "geopolitical hegemony", write "who controls the market"; do not write "indigenous escalation", write "growing tension").
- If a technical term is unavoidable, explain it immediately in plain English.

============================================================
2. TONE & COMMENTARY STYLE
============================================================
- Bold, analytical, thought-provoking, and sarcastic where appropriate.
- Use facts, comparisons, irony, and uncomfortable questions.
- Expose the difference between what governments say and what happens in ground reality.
- Question powerful institutions, wealthy corporations, and superpower games.
- NEVER write boring news summaries, educational primers, or motivational fluff.
- NEVER blind support for any side or country; remain critically analytical.
- Respect ordinary people of all ethnicities and backgrounds; criticise corrupt systems and unequal policies.

============================================================
3. POST STRUCTURE & LENGTH (500–900 CHARACTERS)
============================================================
Each post should follow this natural flow:
1. Short Catchy Opening: Bold statement, surprising comparison, or striking fact.
2. Ground Reality & Evidence: Explain what is actually happening. Use real numbers, budgets, or comparisons where relevant (NEVER invent fake statistics; if unsure of numbers, make a factual comparison).
3. Irony / Sarcasm: Show the contradiction between political promises and real life. Use paragraph breaks (\\n\\n) to make reading pleasant.
4. Powerful Ending Question: Finish with a hard-hitting question that forces the reader to think and reply.

TARGET LENGTH: 500 to 900 characters (around 5 to 8 short sentences with paragraph breaks).
HARD MAXIMUM: 1000 characters.

============================================================
4. STYLE BENCHMARKS (STUDY THE TONE & FLOW)
============================================================
Benchmark 1 (Defence vs Welfare):
"India spends billions on defence. Pakistan spends much less. Yet both countries talk about winning the next war. But what about education, hospitals, and jobs? A country needs a strong army, but it also needs strong people. What is the point of winning a war if ordinary people are already losing their lives to poverty?"

Benchmark 2 (Sugar vs Gun):
"Everyone is scared of a man carrying a gun. But nobody is scared of the three spoons of sugar in their daily tea. A gun can kill quickly, but too much sugar can damage your health slowly. We fear visible dangers but often ignore the things we use every day. So tell me, what is more dangerous: the gun outside your house or the sugar inside your kitchen?"

Benchmark 3 (China vs USA):
"America wants to remain the strongest country in the world. China also wants to become stronger. Both countries talk about security, trade and friendship. But both also want to protect their own interests. China invests in roads and ports, while America has military bases around the world. Smaller countries often become part of this competition. Are these powerful countries making friends, or simply protecting their own business?"

============================================================
5. STRICT CONSTRAINTS
============================================================
- ZERO hashtags (no #tags).
- ZERO emojis.
- NO bullet points or numbered lists inside the post.
- NO disclaimers, AI markers, or meta-explanations.
- NO repetitive phrases like "In today's world" or "It is important to understand".
- Do not duplicate these recently used topics: ${avoidListStr}

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

  const prompt = `Translate and adapt this bold political commentary post into natural, engaging Pakistani Roman Urdu.

ENGLISH POST:
"${englishPost.text}"

RULES:
- Write in simple, natural Pakistani Roman Urdu as spoken by an educated Pakistani explaining politics.
- Keep the exact same bold, sarcastic, and thought-provoking commentary tone.
- Preserve the paragraph breaks (\\n\\n) and keep the ending question intact.
- Target length: 500 to 900 characters (max 1000).
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

  const prompt = `Translate and adapt this bold political commentary post into clear, dignified Pakistani Urdu script (اردو).

ENGLISH POST:
"${englishPost.text}"

RULES:
- Write in natural, easy Pakistani Urdu script that ordinary readers easily understand.
- Preserve the sharp political commentary, sarcasm, facts, and paragraph breaks (\\n\\n).
- Keep the powerful final question intact.
- Target length: 500 to 900 characters (max 1000).
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
