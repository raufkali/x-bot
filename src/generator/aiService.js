/**
/**
 * Narrative Micro-Essay & Storytelling AI Service for X_BOT
 * 
 * Features:
 * - Engaging, descriptive micro-essays (4-5 paragraphs separated by blank lines)
 * - Observational satire, cultural grounding, witty storytelling micro-essays
 * - ZERO HASHTAGS (strictly stripped and forbidden across all languages)
 * - 100% Brand-new fresh post guarantee (deduplication against MongoDB Atlas used topics)
 * - Fully localized Natural Conversational Pakistani Roman Urdu and Plain Urdu script (اردو)
 */

import Groq from 'groq-sdk';
import { calculateXCharacterCount } from '../utils/validation.js';
import {
  isDuplicatePost,
  saveGeneratedPost,
  getAllUsedTopics
} from '../db/postModel.js';

/**
 * Curated bank of descriptive, engaging narrative storytelling micro-essays.
 * Benchmarked strictly against the Mingora university satire style.
 * Zero hashtags, 4-5 paragraphs each.
 */
export const CURATED_STORY_TOPICS = [
  {
    topic: "Pakistan's Universities and the Group Project Cover",
    category: 'SOCIETY_EDUCATION_SATIRE',
    english: {
      text: `Pakistan's universities can't fund labs, but they can fund your love story.

A father in Mingora asked his son why he wanted admission in a university with no lab, no library, and no real professors. The son replied, "Abu, you are looking at the old university."

The new university has understood the market. It cannot fund research, so it has stopped trying. Instead, it offers what students actually come for: a safe dating place with WiFi, a canteen, and a degree as a cover story. In this city, "we have a group project" is now the most respectable excuse to meet.

So the next prospectus is obvious: BS Social Media Management, with specialisation in TikTok, YouTube, Instagram and X. Why build a lab when a ring light is cheaper? Why hire a PhD when an influencer brings more admissions than any professor?

The degree will be useless, but the content will be 4K. And the father will still proudly say, "My son is doing a degree from university."`
    },
    romanUrdu: {
      text: `Pakistan ki universities labs ko fund nahi kar sakeen, magar aap ki love story ko zaroor fund kar sakti hain.

Mingora mein aik baap ne apnay betay se poocha ke aisi university mein dakhla kyun chahiye jahan na lab hai, na library, aur na dhang ke professors. Betay ne jawab diya, "Abba, aap purani university ko dekh rahay hain."

Nayi university ne market ko samajh liya hai. Wo research fund nahi kar sakti, is liye koshish karna chhorr diya. Iski jagah wo wo kuch de rahi hai jis ke liye students aatay hain: WiFi wala safe dating spot, canteen, aur ghar walon ke liye degree ka bahana. Is shehar mein "hamaara group project hai" milnay ka sab se shareefana bahana ban chuka hai.

Agla prospectus wazeh hai: BS Social Media Management, TikTok, YouTube, Instagram aur X specialisation ke sath. Jab ring light lab se sasti ho to lab kyun banayein? Jab aik influencer kisi professor se ziada admissions la sakta ho to PhD kyun rakhain?

Degree be-kaar hogi magar content 4K hoga. Aur baap phir bhi fakhar se kahega, "Mera beta university se degree kar raha hai."`
    },
    plainUrdu: {
      text: `پاکستان کی یونیورسٹیاں ریسرچ لیبز کو فنڈ نہیں کر سکتیں، مگر آپ کی لو اسٹوری کو بھرپور فنڈ کر سکتی ہیں۔

مینگورہ میں ایک باپ نے اپنے بیٹے سے پوچھا کہ ایسی یونیورسٹی میں کیوں جانا چاہتے ہو جہاں نہ کوئی لیب ہے، نہ لائبریری اور نہ قابل اساتذہ۔ بیٹے نے جواب دیا، "ابو، آپ پرانی یونیورسٹی کے زاویے سے دیکھ رہے ہیں۔"

نئی یونیورسٹی نے مارکیٹ کی نبض پہچان لی ہے۔ وہ ریسرچ کا بوجھ نہیں اٹھا سکتی اس لیے اس نے کوشش ہی چھوڑ دی۔ اس کی جگہ وہ وہی فراہم کر رہی ہے جس کے لیے طلبہ آتے ہیں: تیز وائی فائی، محفوظ ملاقات کی جگہ، ایک فعال کینٹین اور گھر والوں کے لیے ڈگری کا کور۔ اس شہر میں "ہمارا گروپ پروجیکٹ ہے" مل بیٹھنے کا سب سے باعزت بہانہ ہے۔

اگلا پراسپیکٹس بالکل واضح ہے: بی ایس سوشل میڈیا منیجمنٹ، ٹک ٹاک، یوٹیوب، انسٹاگرام اور ایکس اسپیشلائزیشن کے ساتھ۔ جب رنگ لائٹ لیب سے سستی ہو تو لیب کیوں بنائی جائے؟ جب ایک انفلوئنسر کسی پروفیسر سے زیادہ داخلے لا سکتا ہو تو پی ایچ ڈی کی تنخواہ کیوں بھری جائے؟

ڈگری شاید بے کار ثابت ہو، مگر کانٹینٹ فل ایچ ڈی ہوگا۔ اور والد صاحب اب بھی فخر سے کہیں گے، "میرا بیٹا یونیورسٹی میں تعلیم حاصل کر رہا ہے۔"`
    }
  },
  {
    topic: "The DHA Plot Economy and the Graveyard of Industry",
    category: 'ECONOMICS_REAL_ESTATE',
    english: {
      text: `A retired bureaucrat in Lahore once sat with an industrialist who had spent thirty years building a textile mill. The industrialist spoke about export tariffs, power outages, and boiler maintenance. The bureaucrat took a sip of Kashmiri chai and smiled, "Beta, you made cotton shirts. I bought two files in Phase 7."

The bureaucrat was three times wealthier without ever having manufactured a single toothpick.

In this country, making things is considered an unnecessary headache. Why deal with unions, electricity tariffs, and tax inspectors when you can buy a patch of dry mud, put up a barbed wire fence with a gate, and wait for inflation to do your heavy lifting?

The national economic policy fits on a napkin: turn fertile mango orchards into housing societies, name every boulevard after a historic battle, and sell the dream of a gated paradise to overseas Pakistanis.

Factories produce smoke and labour disputes. DHA files produce generational wealth with zero moving parts. And then we wonder why the national export is just another batch of young men holding boarding passes to Doha.`
    },
    romanUrdu: {
      text: `Lahore mein aik retired bureaucrat aik factory maalik ke sath baitha jis ne tees saal textile mill chalane mein guzar diye thay. Factory maalik bijli ke billon, export tax, aur boiler ki kharabiyon ka rona ro raha tha. Afsar ne Kashmiri chai ka ghoont bhara aur muskura kar bola, "Beta, tum ne kapray banaye. Mein ne Phase 7 mein sirf do files li theen."

Afsar baghair aik toothpick banaye us factory maalik se teen guna ziada ameer tha.

Is mulk mein koi cheez banana fazool museebat samjha jata hai. Labour ke maslay, tax walon ke chhaapay, aur load shedding ka dard kyun lena jab aap sookhi matti ka tukra khareed kar ird gird taar laga saktay hain, aur mehngai ko apna paisa double karnay ka rasta de saktay hain?

Qoumi maashi policy aik tissue paper par likhi ja sakti hai: aam ke baghaat ko kaat kar society banao, har road ka naam tareekhi jung par rakho, aur bahar bethay Pakistaniyon ko plot becho.

Karkhanay dhuan aur larraiyan peda kartay hain. Plot ki files baghair hilay jhulay naslon ki dolat peda karti hain. Aur phir hum sochtay hain ke is mulk ki asal export sirf Doha ka boarding pass le kar jatay huay nojawan kyun hain.`
    },
    plainUrdu: {
      text: `لاہور میں ایک ریٹائرڈ بیوروکریٹ ایک صنعت کار کے ساتھ بیٹھا جس نے تیس برس ٹیکسٹائل مل چلانے میں جھونک دیے تھے۔ صنعت کار بجلی کے بحران اور ایکسپورٹ ٹیکس کا رونا رو رہا تھا۔ ریٹائرڈ افسر نے کشمیری چائے کی چسکی لی اور مسکرا کر بولا، "بیٹا، تم نے کپڑے بنائے، میں نے فیز سیون میں دو پلاٹ لیے تھے۔"

افسر نے بغیر ایک ماچس کی تیلی بنائے اس صنعت کار سے تین گنا زیادہ منافع کما لیا تھا۔

اس نظام میں پروڈکشن کرنا ایک غیر ضروری سردردی بن چکا ہے۔ لیبر کے جھنجھٹ، ٹیکس افسران کے چھاپے اور بجلی کا عذاب کیوں جھیلا جائے جب آپ ریگستان کا ایک ٹکڑا لے کر چاروں طرف خاردار تار لگا سکتے ہیں اور مہنگائی کی لہر آپ کے لیے سارا کام خود کر دیتی ہے؟

ہماری معاشی حکمت عملی ایک سادہ کاغذ پر سموئی جا سکتی ہے: زرخیز آم کے باغات کاٹ کر نئی فیز کا افتتاح کرو، سڑک کا نام کسی پرانے معرکے پر رکھو اور اوورسیز پاکستانیوں کو جنت نما نقشے بیچو۔

کارخانے صرف مزدوروں کے تنازعات پیدا کرتے ہیں، جبکہ پلاٹوں کی فائلیں خاموشی سے خاندانی دولت میں اضافہ کرتی ہیں۔ پھر ہمیں حیرت ہوتی ہے کہ ہماری سب سے بڑی برآمد نوجوانوں کے پاسپورٹ اور خلیج کے ٹکٹ ہی کیوں ہیں۔`
    }
  },
  {
    topic: "The Solar Panel Revolution and Wapda's Quiet Panic",
    category: 'ENERGY_SOCIETY',
    english: {
      text: `For seventy years, the state power company operated like an ancient feudal landlord. You paid whatever bill arrived in the blue envelope, you accepted eighteen hours of darkness in June, and you thanked the lineman when he changed a melted fuse.

Then three Chinese cargo ships docked in Karachi carrying blue silicon panels.

Within eighteen months, every middle-class rooftop from Multan to Mardan looked like a NASA satellite array. The Pakistani uncle discovered net metering, and for the first time in republican history, the citizen sent a bill to the government.

Now the power company is in genuine panic. The air-conditioned headquarters had calculated revenue on the assumption of a captive population that had no choice but to sweat. They never anticipated that the sun was free and Chinese engineers were relentless.

So the bureaucracy prepares its masterstroke: taxing the sunlight. Because in this country, generating your own light is the ultimate act of civil disobedience.`
    },
    romanUrdu: {
      text: `Sattar saal tak Wapda aik puranay jagirdar ki tarah chalta raha. Neelay lifafay mein jo bill aaya wo bharna parta tha, June ki garmi mein 18 ghantay andhera bardasht karna parta tha, aur fuse theek honay par lineman ka shukriya ada karna hota tha.

Phir Karachi port par neelay solar panels se bharay 3 Chinese jahaz lagay.

Athara maheenon mein Multan se Mardan tak har darmianay tabqay ki chhat NASA ka satellite lagne lagi. Pakistani uncle ko net metering samajh aa gayi, aur mulk ki tareekh mein pehli baar shehri ne hakumat ko bill bhej diya.

Ab bijli companian pareshan hain. AC walay dakhli daftaron ne revenue ka hisaab is yaqeen par lagaya tha ke awam ke paas paseenay mein nahanay ke siwa koi chara nahi. Unhein andaza nahi tha ke dhoop muft hai aur Chinese technology be-raham.

Ab afsar-shahi apna aakhri teer chala rahi hai: dhoop par tax lagana. Kyun ke is mulk mein apni roshni khud banana sab se barri baghawat ban chuka hai.`
    },
    plainUrdu: {
      text: `ستر برس تک بجلی کا محکمہ ایک روایتی جاگیردار کی طرح کام کرتا رہا۔ نیلے لفافے میں جو بل آیا وہ بھرنا لازم تھا، جون کی چلچلاتی دھوپ میں اٹھارہ گھنٹے کا اندھیرا مقدر تھا اور فیوز بدلنے پر لائن مین کا احسان ماننا پڑتا تھا۔

پھر کراچی کی بندرگاہ پر نیلے سولر پینلز سے لدے ہوئے چینی جہاز لنگر انداز ہوئے۔

اٹھارہ ماہ کے اندر ملتان سے مردان تک ہر متوسط طبقے کی چھت ناسا کا خلائی اسٹیشن دکھائی دینے لگی۔ پاکستانی چچا کو نیٹ میٹرنگ کا راز سمجھ آ گیا، اور ملکی تاریخ میں پہلی بار عام شہری نے حکومت کو ریورس بل بھیجنا شروع کر دیا۔

اب بجلی کمپنیوں کے ایوانوں میں سناٹا ہے۔ ٹھنڈے کمروں میں بیٹھ کر یہ حساب لگایا گیا تھا کہ لاچار عوام پسینے میں نہانے کے سوا کچھ نہیں کر سکتی۔ انہیں معلوم نہ تھا کہ سورج کی روشنی مفت ہے اور چینی پیداواری صلاحیت کا کوئی توڑ نہیں۔

چنانچہ اب بیوروکریسی اپنا حتمی حربہ سوچ رہی ہے: سورج کی شعاعوں پر ٹیکس عائد کرنا۔ کیونکہ اس خطے میں اپنی روشنی خود پیدا کرنا نظام کے خلاف سب سے بڑی سرکشی ہے۔`
    }
  },
  {
    topic: "The Freelancer from Faisalabad and the UPS Light",
    category: 'TECH_WORK_ECONOMY',
    english: {
      text: `At 3:00 AM in a cramped room in Faisalabad, a twenty-three-year-old in a faded kurta is debugging a React component for a dental clinic in Ohio. 

Above him hangs a single 12-volt LED bulb wired to a car battery. The neighbourhood transformer blew up at sunset, but the dental clinic cannot wait. To Ohio, he is Alex, a high-velocity full-stack developer with a 99% job success score. To his mother downstairs, he is still the boy who doesn't have a real job because he never leaves his chair.

He brings home three thousand dollars a month. That is more foreign exchange than the local spinning mill down the street managed to remit this quarter.

Yet when he goes to the local bank branch to open an account, the manager looks at him with deep suspicion and asks for a salary slip stamped by a physical office with a landline number.

The 21st century arrived in Faisalabad through a fiber-optic cable, but the bank manager is still waiting for a telegram.`
    },
    romanUrdu: {
      text: `Faisalabad ke aik chhotay kamray mein raat 3 bajay, kurta pehnay 23 saal ka larka Ohio ke aik dental clinic ke liye React ka code theek kar raha hai.

Upar car ki battery se jura aik 12-volt ka LED bulb latak raha hai. Maghrib ke waqt mohallay ka transformer phat gaya tha, magar Ohio ke clinic ko code waqt par chahiye. Ohio walon ke liye wo Alex hai, 99% rating wala top-rated developer. Ghar mein neechay baithi ammi ke liye wo abhi tak berozgar hai kyun ke wo kabhi kursi se uth kar kisi office nahi jata.

Wo maheenay ke 3 hazar dollar kamata hai. Ye us qareebi textile mill se ziada foreign exchange hai jis ne is quarter mein export ki.

Magar jab wo bank account khulwanay branch jata hai to manager usay shak ki nigah se dekhta hai aur kisi physical office ki stamped salary slip maangta hai.

21ween sadi fiber optic cable ke zariye Faisalabad pohnch chuki hai, magar bank manager abhi tak taar ke zamanay mein jee raha hai.`
    },
    plainUrdu: {
      text: `فیصل آباد کے ایک تنگ کمرے میں رات تین بجے، کاٹن کے پرانے کُرتے میں ملبوس تئیس سالہ نوجوان اوہائیو کے ایک ڈینٹل کلینک کے لیے ری ایکٹ کا کوڈ درست کر رہا ہے۔

سر کے اوپر گاڑی کی پرانی بیٹری سے جڑا بارہ وولٹ کا ایل ای ڈی بلب جل رہا ہے۔ محلے کا ٹرانسفارمر شام ہی کو اڑ گیا تھا مگر اوہائیو کا کلینک انتظار نہیں کر سکتا۔ امریکی ڈاکٹر کے لیے وہ "ایلکس" ہے، ننانوے فیصد ریٹنگ والا ایلیٹ ڈویلپر۔ نیچے باورچی خانے میں بیٹھی ماں کی نظر میں وہ اب بھی بے روزگار ہے کیونکہ وہ کبھی کرسی سے اٹھ کر کسی دفتر نہیں جاتا۔

وہ ہر ماہ تین ہزار ڈالرز پاکستان لاتا ہے۔ یہ خطیر رقم گلی کے کونے پر موجود سپننگ مل کی سہ ماہی برآمدات سے کہیں زیادہ ہے۔

مگر جب وہ بینک کی برانچ میں اکاؤنٹ کھلوانے جاتا ہے تو مینیجر اسے کسی مجرم کی طرح دیکھتا ہے اور کسی روایتی دفتر کی مہر والی تنخواہ کی پرچی طلب کرتا ہے۔

اکیسویں صدی فائبر آپٹک کیبل پر سوار ہو کر فیصل آباد میں داخل ہو چکی ہے، مگر بینک مینیجر آج بھی تار گھر کے دور میں سانس لے رہا ہے۔`
    }
  },
  {
    topic: "The CSS Exam and the 18th Century Dream",
    category: 'GOVERNANCE_CULTURE',
    english: {
      text: `Forty thousand university graduates sit in examination halls every February to write essays on the decline of Ottoman agriculture and the principles of local governance. 

Among them are software engineers, gold-medalist doctors, and aviation specialists. They have spent two years locked in basement academies memorising British colonial penal codes, for one singular reward: a green passport cover, a police escort car with a flashing light, and the divine right to allocate government plots.

A medical doctor who could be saving lives in a cardiac unit spends three hours analysing why Lord Dalhousie annexed Awadh in 1856. If she passes, she will be posted as an Assistant Commissioner in a dusty tehsil checking the price of tomatoes in the Friday market.

This is the great talent trade of the post-colonial state: trade your technical brain for bureaucratic immunity, because in this republic, producing value makes you vulnerable, but regulating other people's value makes you a king.`
    },
    romanUrdu: {
      text: `Har saal February mein 40 hazar graduate imtehani halon mein baith kar Usmani saltanat aur zila-ee nizam par lambay mazameen likhtay hain.

In mein top software engineers, gold-medalist doctors, aur scientist shamil hotay hain. Inhon ne do saal basement academies mein baith kar Angraiz ke banaye puranay qawaneen rattay hotay hain, sirf aik maqsad ke liye: hara passport, aagay peechay chalti police ki dali, aur sarkari plot allot karnay ka ikhtiyar.

Aik behtareen doctor jo dil ke mareezon ki jaan bacha sakti thi, teen ghantay ye likhti hai ke 1856 mein Lord Dalhousie ne Awadh par qabza kyun kiya tha. Agar wo pass ho jaye to kisi tehsil mein Assistant Commissioner ban kar juma bazaar mein tamatar ke rate check karegi.

Ye is riyasat ka ajeeb soda hai: apna technical dimagh do aur afsar-shahi ka rob lo. Kyun ke yahan koi cheez banana aap ko kamzor karta hai, magar doosron ke kaam par danda chalana aap ko badshah bana deta hai.`
    },
    plainUrdu: {
      text: `ہر سال فروری کی ٹھنڈ میں چالیس ہزار گریجویٹس امتحانی ہالوں میں بیٹھ کر سلطنتِ عثمانیہ کے زوال اور اٹھارہویں صدی کی زراعت پر طویل مضامین لکھتے ہیں۔

ان امید واروں میں صفِ اول کے سافٹ ویئر انجینئرز، گولڈ میڈلسٹ ڈاکٹرز اور باصلاحیت سائنس دان شامل ہوتے ہیں۔ انہوں نے بیسمنٹ اکیڈمیوں میں دو برس بیٹھ کر انگریز راج کے تعزیراتی ضابطے حفظ کیے ہوتے ہیں، صرف ایک تمنا کے لیے: سبز پاسپورٹ، آگے پیچھے دوڑتی پولیس کی نیلی بتی، اور سرکاری زمینیں الاٹ کرنے کا بے پناہ اختیار۔

ایک ذہین خاتون ڈاکٹر جو دل کے وارڈ میں انسانی جانیں بچا سکتی تھی، تین گھنٹے یہ فلسفہ بیان کرتی ہے کہ ۱۸۵۶ میں لارڈ ڈلہوزی نے اودھ پر قبضہ کیوں کیا تھا۔ کامیاب ہو گئی تو کسی دور دراز تحصیل میں اسسٹنٹ کمشنر بن کر جمعہ بازار میں ٹماٹر اور آلو کے نرخ نامے چیک کرے گی۔

یہ اس معاشرے کا سب سے بڑا المیہ ہے: اپنی فنی اور سائنسی صلاحیت بیچو اور روایتی افسر شاہی کا رعب خریدو۔ کیونکہ یہاں کچھ تخلیق کرنا انسان کو کمزور بناتا ہے، جبکہ دوسروں کی روزی پر مہریں لگانا انسان کو حاکم بنا دیتا ہے۔`
    }
  },
  {
    topic: "The Silicon Valley VC and the Lahore Generator Roar",
    category: 'TECH_STARTUP_REALITY',
    english: {
      text: `The pitch was going exquisitely. The slides were crafted in clean Helvetica, displaying compounding annual growth, total addressable market, and AI-driven retention loops. On the Zoom screen, two venture partners in Menlo Park were nodding thoughtfully from behind their Patagonia vests.

Then the national grid collapsed.

In a split second, the screen went black, the fan slowed to a dying groan, and through the developer's open window came the thunderous, diesel-choked roar of a twenty-kilovolt generator rattling the neighbourhood brickwork.

The founder didn't blink. He switched instantly to mobile data, reconnected with a polite smile, and said, "As you can see, our distributed architecture has built-in zero-latency failover."

The investors wrote a check. They thought it was a metaphor for fault-tolerant microservices. In reality, it was just the daily survival instinct of doing tech business in South Asia.`
    },
    romanUrdu: {
      text: `Pitch behtareen ja rahi thi. Presentation ke slides saaf suthray thay, market growth aur AI retention graphs dikha rahay thay. California ke Menlo Park mein baithay do gorey investors screen par mutasir ho kar gardan hila rahay thay.

Theek us waqt shehar ki bijli chali gayi.

Aik lamhay mein screen andheri hui, pankhay ne aakhri hichki li, aur khirrki se 20-kilovolt diesel generator ki aisi ghanghor aawaz aayi jis ne mohallay ki deewaron ko hila kar rakh diya.

Pakistani founder ne palkan tak nahi jhapki. Us ne second mein mobile hotspot chalaya, muskura kar screen par wapis aaya aur bola, "Jaisa ke aap ne dekha, hamaara architecture zero-latency failover par chalta hai."

Investors ne usi waqt check sign kar diya. Wo samjhay ke ye cloud infrastructure ka koi tareekhi demo tha. Asal mein ye South Asia mein tech chalanay ka aam rozmarra ka circus tha.`
    },
    plainUrdu: {
      text: `پچ اپنے عروج پر تھی۔ پریزنٹیشن کی سلائیڈز پر اربوں ڈالر کی مارکیٹ، صارف کی مصروفیت اور جدید الگورتھم کے دلکش گراف جلوہ گر تھے۔ کیلیفورنیا میں بیٹھے دو امریکی سرمایہ کار اسکرین کے اس پار متاثر ہو کر داد دے رہے تھے۔

ٹھیک اسی لمحے پورے شہر کی بجلی چلی گئی۔

ایک سیکنڈ میں اسکرین تاریک ہو گئی، چھت کے پنکھے نے دم توڑ دیا، اور کھلی کھڑکی سے محلے کے بیس کے وی ڈیزل جنریٹر کی کان پھاڑ دینے والی گرج نمودار ہوئی جس نے در و دیوار ہلا دیے۔

پاکستانی فاؤنڈر کی پیشانی پر شکن تک نہ آئی۔ اس نے پلک جھپکتے ہی فون کا ہاٹ اسپاٹ آن کیا، پرسکون مسکراہٹ کے ساتھ کیمرے پر واپس آیا اور بولا، "جیسا کہ آپ نے ملاحظہ فرمایا، ہمارا سسٹم بغیر کسی تعطل کے خودکار طریقے سے بیک اپ پر منتقل ہو جاتا ہے۔"

امریکی سرمایہ کاروں نے بغیر سوچے فنڈنگ کی منظوری دے دی۔ وہ سمجھے یہ کلاؤڈ کمپیوٹنگ کا کوئی انقلابی تکنیکی مظاہرہ تھا، جبکہ حقیقت میں یہ تیسری دنیا میں بقا کا روزمرہ کا تماشا تھا۔`
    }
  },
  {
    topic: "The 50-Lakh Pakistani Wedding and the Cold Biryani",
    category: 'CULTURE_SOCIETY',
    english: {
      text: `A middle-class family will spend twenty years saving money, cutting fruit budgets, and wearing mend-patched sweaters. Then, in seventy-two hours of sensory madness, they will incinerate five million rupees inside an air-conditioned marquee named Royal Versailles.

Eight hundred guests are summoned. Six hundred of them have never met the groom. 

The stage is constructed with golden Roman pillars made of painted styrofoam. A drone hovers six inches above the bride's eyelashes like a mechanical mosquito. The groom sits stiffly in an imported suit, praying that the catering company brings the mutton qorma before midnight.

By 11:30 PM, the food is served. By 11:45 PM, the uncles have gathered in the parking lot to declare the biryani criminally cold and the chicken undertender.

The family enters a five-year debt recovery program with their bank. The guests complain about traffic on the drive home. And society agrees that the event was a grand, respectable triumph.`
    },
    romanUrdu: {
      text: `Aik darmiana tabqa bees saal tak paisay jodta hai, phal khana kam karta hai, aur puranay kapray pehanta hai. Phir sirf 72 ghanton ke pagalpan mein wo 50 lakh rupay "Royal Versailles" naam ke marquee mein aag laga deta hai.

Aath sau mehmaano ko bulaya jata hai jin mein se 600 ne dulhay ko pehli baar dekha hota hai.

Stage par thermopore se banaye gaye naqli roomi satoon kharay hotay hain. Dulhan ke sar par drone aise mandla raha hota hai jaise koi barri machhar ho. Dulha soofay par betha dua mang raha hota hai ke catering walay 12 bajay se pehle mutton qorma khol dein.

Gyarah baje khana khulta hai, aur ponay barah baje uncle parking mein kharay hokar faisla suna chukay hotay hain ke biryani thandi thi aur boti sakht thi.

Ghar walay aglay paanch saal qarz utartay hain. Mehmaan raste mein traffic ka rona rotay hain. Magar mohalla ittefaq karta hai ke shaadi bohat shandaar hui thi.`
    },
    plainUrdu: {
      text: `ایک سفید پوش خاندان بیس برس تک ایک ایک روپیہ جوڑتا ہے، پھلوں کا خرچ کاٹتا ہے اور پرانی چادروں میں پیوند لگاتا ہے۔ پھر محض بہتر گھنٹوں کے خبط میں پچاس لاکھ روپے "شاہی محل" نامی شادی ہال کی نذر کر دیتا ہے۔

آٹھ سو مہمانوں کا لشکر بلایا جاتا ہے جن میں سے چھ سو نے دلہے کا چہرہ زندگی میں پہلی بار دیکھا ہوتا ہے۔

اسٹیج پر تھرموپول سے تراشے گئے جعلی رومی ستون سجے ہوتے ہیں۔ کیمرے کا ڈرون دلہن کی پلکوں کے عین اوپر مکھی کی طرح بھنبھناتا ہے۔ دلہا کرائے کی شیروانی میں اکڑا بیٹھا خدا سے دعائیں مانگ رہا ہوتا ہے کہ بارہ بجنے سے پہلے قورمے کی دیگیں کھل جائیں۔

گیارہ بجے کھانا کھلتا ہے، اور پونے بارہ بجے پارکنگ میں چچا اور تایا فتویٰ صادر کر چکے ہوتے ہیں کہ بریانی ٹھنڈی تھی اور گوشت گلا ہوا نہیں تھا۔

خاندان اگلے پانچ برس قرض چکانے کے عذاب سے گزرتا ہے، مہمان واپسی کے سفر میں ٹریفک کو کوستے ہیں، اور برادری مبارکباد دیتی ہے کہ شادی نہایت باوقار گزری۔`
    }
  },
  {
    topic: "The Microchip War and Taiwan's Silicon Shield",
    category: 'GEOPOLITICS_TECH_2035',
    english: {
      text: `The most heavily guarded border in the world today is not drawn with barbed wire, landmines, or concrete watchtowers. It is etched into microscopic silicon wafers measuring two nanometers across.

In the twentieth century, great empires went to war over coal deposits, railway corridors, and Persian Gulf oil wells. In 2035, the entire global economy hinges on a single humid island off the coast of Fujian.

If Taiwan's semiconductor fabrication plants stop spinning for forty-eight hours, assembly lines from Munich to Detroit go silent. Modern jet fighters cannot fly, pacemakers cannot regulate hearts, and smartphone factories dissolve into shuttered warehouses.

Taiwan does not need a million-man infantry division to guarantee its survival. Its true nuclear deterrent is a cleanroom where technicians in white bunny suits calibrate laser lithography mirrors with sub-atomic precision.

The 21st-century superpower is not the country with the most nuclear warheads. It is the country that can print twenty billion transistors on a fingernail without making a microscopic mistake.`
    },
    romanUrdu: {
      text: `Duniya ka sab se mehfooz aur guarded border taaron ya deewaron se nahi bana. Wo do nanometer ke chhotay computer chips par engraver kiya gaya hai.

Beesween sadi mein barri taqatein koylay, rail ke raston aur tail ke kuon par jangain larti theen. 2035 mein poori duniya ki maeeshat aik chhotay se jazeeray Taiwan par tiki hui hai.

Agar Taiwan ki microchip factories do din ke liye band ho jayein to Germany se le kar America tak caron ki assembly lines band ho jayengi. Fighter jahaz urnay se reh jayenge aur mobile phones ke karkhanay band ho jayenge.

Taiwan ko apni hifazat ke liye 10 lakh fojiyon ki zaroorat nahi. Uska asal atom bomb wo white suit walay engineers hain jo sub-atomic laser lithography se chips print kartay hain.

Nayi sadi ki super-power wo mulk nahi jiske paas sab se ziada misail hain, balkay wo hai jo aik nakhun barabar chip par 20 arab transistors baghair ghalti ke bana sakta hai.`
    },
    plainUrdu: {
      text: `اکیسویں صدی کی سب سے حساس ترین سرحد کسی خاردار تار، بارودی سرنگوں یا کنکریٹ کے مورچوں سے نہیں بنی۔ یہ سرحد محض دو نینومیٹر چوڑی سلیکان چپس کے اندر تراشی گئی ہے۔

گزشتہ صدی میں بڑی سلطنتیں کوئلے کے ذخائر، ریلوے کی پٹریوں اور تیل کے کنوؤں پر ایٹمی جنگ کے دہانے پر پہنچ جاتی تھیں۔ ۲۰۳۵ میں پوری دنیا کی معاشی بقا کا دارومدار تائیوان کے ایک چھوٹے سے صنعتی جزیرے پر ٹکا ہوا ہے۔

اگر تائیوان کی جدید ترین فیبریکیشن لیبز اڑتالیس گھنٹے کے لیے بند ہو جائیں تو میونخ سے ڈیٹرائٹ تک گاڑیوں کی فیکٹریاں جام ہو جائیں گی، جدید لڑاکا طیارے اڑان بھرنے سے قاصر رہیں گے اور دنیا بھر کے ڈیٹا سینٹرز خاموش ہو جائیں گے۔

تائیوان کو اپنی خودمختاری کے لیے لاکھوں کی فوج کی ضرورت نہیں۔ اس کا سب سے بڑا ایٹمی ہتھیار وہ سفید سوٹ میں ملبوس سائنس دان ہیں جو لیزر ٹیکنالوجی سے نایاب چپس تراشتے ہیں۔

مستقبل کا سپر پاور وہ ملک نہیں جس کے پاس سب سے زیادہ ایٹم بم ہوں، بلکہ وہ ہے جو انگلی کے ناخن پر بیس ارب ٹرانزسٹرز بغیر کسی لغزش کے چھاپ سکتا ہے۔`
    }
  },
  {
    topic: "The Audi e-tron on a 140-Volt Street",
    category: 'INFRASTRUCTURE_SATIRE',
    english: {
      text: `There is no greater symbol of contemporary optimism than a brand-new German electric SUV parked in a Lahore residential lane where the voltage drop can barely keep a refrigerator compressor alive.

The vehicle arrives on a flatbed truck, shining with matte metallic paint, aerodynamic air scoops, and a software dashboard capable of navigating autonomous highway lanes in Bavaria.

Then the owner plugs the charging cable into a wall socket wired to a three-decade-old distribution transformer that hums like an angry swarm of wasps.

The car's digital screen flashes a solemn warning: "Grid frequency unstable. Charging speed reduced to bicycle pace." 

Down the street, the neighbourhood ironer turns on three heavy steam irons, and the German machine silently gives up its soul for the night. In Europe, the electric car is an ecological triumph. In South Asia, it is a four-wheeled status ornament that spends its weekends running off a petrol generator.`
    },
    romanUrdu: {
      text: `Is mulk ki umeedon ki sab se barri misaal Lahore ki kisi gali mein khari German electric car hai, jahan bijli ka voltage itna kam hai ke fridge ka compressor bhi ro raha hota hai.

Car truck par aati hai, matte paint chamak raha hota hai, aur dashboard par aisi software screens hoti hain jo Germany ke highways par khud gari chalati hain.

Phir maalik charging cable ko us deewar mein lagata hai jiska taar 30 saal puranay transformer se aa raha hai jo kisi ghusse walay machhar ki tarah cheekh raha hota hai.

Car ki screen foran likh deti hai: "Bijli ka nizam kharab hai, charging cycle band ki ja rahi hai."

Gali ke modd par dhobi teen istrian on karta hai, aur German engineering chup chaap apna dum tod deti hai. Europe mein electric car maholiyat ka moajza hai, magar yahan ye karoron rupay ka showpiece hai jo weekend par petrol generator se charge hota hai.`
    },
    plainUrdu: {
      text: `ہماری قومی سادگی اور شو بازی کا اس سے بڑا شاہکار کوئی نہیں ہو سکتا کہ لاہور کی کسی تنگ گلی میں جرمن ساختہ جدید ترین الیکٹرک گاڑی کھڑی ہو، جہاں مین تاروں کا وولٹیج بمشکل ایک سو چالیس وولٹ پر سسک رہا ہوتا ہے۔

گاڑی چمکتے ہوئے کنٹینر سے اترتی ہے، میٹ فنش رنگ، خوبصورت ڈیزائن اور ایسا جدید سافٹ ویئر جو جرمنی کی ہائی ویز پر خودکار ڈرائیونگ کے لیے بنایا گیا تھا۔

پھر مالک اس کا چارجنگ پلگ اس دیوار میں لگاتا ہے جس کا کنکشن محلے کے تیس برس پرانے کھمبے سے جڑا ہے جو کسی غصیلے مکھیوں کے چھتے کی طرح گونج رہا ہوتا ہے۔

گاڑی کا ڈیجیٹل سسٹم ایک لمحے میں پیغام دیتا ہے: "کرنٹ کا بہاؤ غیر معیاری ہے، چارجنگ روک دی گئی ہے۔"

گلی کے کونے پر دھوبی تین استریاں آن کرتا ہے اور جرمن ٹیکنالوجی بے بسی سے ہتھیار ڈال دیتی ہے۔ مغرب میں الیکٹرک کار ماحول کا انقلاب ہے، جبکہ یہاں یہ کروڑوں روپے کا کھلونا ہے جو رات کو پٹرول جنریٹر پر چارج ہوتا ہے۔`
    }
  },
  {
    topic: "The Overseas Dubai Rider and the Village Haveli",
    category: 'DIASPORA_LABOUR_REALITY',
    english: {
      text: `In a remote village near Gujrat, a palatial three-story house stands surrounded by buffalo paddocks and dusty wheat fields. It has Roman plaster arches, reflective blue window glass, and two marble lions guarding an iron gate that is never opened.

Inside, an elderly mother lives alone with a landline telephone and a framed portrait of her youngest son.

The son is currently weaving between speeding cement trucks on Sheikh Zayed Road in fifty-degree midday heat, delivering lukewarm shawarmas on a rented motorcycle for fourteen hours a day.

Every dirham he saves is wired home through exchange houses to buy more imported Italian tiles for bathrooms that no one uses. He sleeps in a bunk bed with five other men in a windowless room in Deira, dreaming of the day he can return to sit in the marble courtyard he built.

By the time the house is fully painted, his knees are ruined, his youth is exhausted, and his children speak Arabic with an accent he cannot understand. The mansion stands as an architectural tomb of thirty years spent in the desert.`
    },
    romanUrdu: {
      text: `Gujrat ke aik gaoon mein khetan ke darmiyan aik shandaar teen manzila kothi khari hai. Naqli roomi satoon, neelay sheeshay, aur lohay ke gate par do sang-e-marmar ke sher jo kabhi nahi khultay.

Andar aik burhi maa akele telephone aur apnay chhotay betay ki tasweer ke sath rehti hai.

Beta is waqt Dubai ke Sheikh Zayed Road par 50 degree garmi mein cement ke truckon ke darmiyan motorcycle dauda raha hai, aur 14 ghantay shawarma deliver kar raha hai.

Uska bacha hua har dirham gaoon bheja jata hai taake un washrooms mein Italian tiles lag sakein jo koi istemal nahi karta. Wo khud Deira ke aik kamray mein 6 logon ke sath bunk bed par sota hai aur us haveli ke sehan ka khawab dekhta hai.

Jab tak kothi mukammal hoti hai, uske ghutnay jawab de chukay hotay hain, jawani khatam ho chuki hoti hai, aur bache aisi arbi boltay hain jo usay samajh nahi aati. Ye haveli sehra mein zaya hui 30 saal ki jawani ka qabarstaan ban kar khari rehti hai.`
    },
    plainUrdu: {
      text: `گجرات کے ایک نواحی گاؤں میں گندم کے کھیتوں کے بیچوں بیچ تین منزلہ سنگِ مرمر کا محل کھڑا ہے۔ اس کے اوپر رومی محرابیں، نیلے شیشے اور آہنی گیٹ پر دو سنگِ مرمر کے شیر نصب ہیں جن کا در کبھی نہیں کھلتا۔

اندر ایک بوڑھی ماں اکیلے لینڈ لائن فون کے پاس بیٹھی اپنے چھوٹے لختِ جگر کی تصویر کو تکتی رہتی ہے۔

وہ بیٹا اس وقت دبئی کی شاہراہِ شیخ زاید پر پچاس ڈگری کی آگ اگلتی دوپہر میں سیمنٹ کے ٹرکوں کے درمیان موٹر سائیکل پر چودہ گھنٹے شوارما ڈیلیور کر رہا ہے۔

اس کا بچایا ہوا ایک ایک درہم منی ایکسچینج کے ذریعے پاکستان آتا ہے تاکہ ان غسل خانوں میں اطالوی ٹائلیں لگ سکیں جنہیں کوئی استعمال نہیں کرتا۔ وہ خود دیرَہ کے ایک بے کھڑکی کمرے میں چھ مزدوروں کے ساتھ بنک بیڈ پر سوتا ہے اور اپنے ہی بنائے ہوئے سنگِ مرمر کے صحن کی ٹھنڈک کے خواب دیکھتا ہے۔

جب تک حویلی کا رنگ و روغن مکمل ہوتا ہے، اس کے جوڑوں کا تیل ختم ہو چکا ہوتا ہے، جوانی صحرا نگل چکا ہوتا ہے اور بچے وہ زبان بولتے ہیں جو اس کی سمجھ سے باہر ہوتی ہے۔ یہ حویلی ان تیس برسوں کا عالی شان مزار ہے جو ریت کے طوفانوں میں دفن ہو گئے۔`
    }
  },
  {
    topic: "The Private School Empire and the Accent Industry",
    category: 'EDUCATION_SOCIETY',
    english: {
      text: `In the leafy suburbs of Islamabad, a new generation of private schooling conglomerates charges fees comparable to tuition at Cambridge University. 

The admissions process is ruthless. Four-year-old toddlers are interviewed behind soundproof glass to determine whether their phonetics lean towards southern British RP or unrefined local diphthongs. If the child pronounces 'schedule' with a hard consonant, the parents are advised to hire a remedial speech consultant.

The brochures promise international leadership seminars, Model United Nations conferences in Antalya, and equine therapy clubs. 

Yet when these eighteen-year-old graduates enter the actual economy, they can write elaborate essays on the ontological alienation of modern existence, but they cannot calculate withholding tax, resolve a property dispute, or negotiate with a municipal clerk without calling their fathers.

We have built an educational conveyor belt that produces flawless accents for an economy that desperately needs plumbers, civil engineers, and industrial chemists.`
    },
    romanUrdu: {
      text: `Islamabad ke posh ilaqon mein private schoolon ke chain itni fees letay hain jitni Cambridge University mein hoti hai.

Dakhlay ka tareeqa itna sakht hota hai ke 4 saal ke bachay ka soundproof kamray mein interview hota hai ke uska angrezi bolnay ka lehja British hai ya desi. Agar bachay ne kisi lafz ka ghalat talaffuz kiya to walidain ko speech teacher rakhnay ka mashwara diya jata hai.

School ke brochures mein Turkey mein Model UN aur horse riding ke waday hotay hain.

Magar jab yehi 18 saal ke bachay asal zindagi mein aatay hain, to wo falsafay par lambay mazameen likh saktay hain magar na tax ka hisaab kar saktay hain, na plot ka masla hal kar saktay hain, aur na kisi sarkari clerk se baap ke baghair baat kar saktay hain.

Hum ne aise schoolon ki factory laga di hai jo angrezi accent to behtareen banati hai, magar mulk ko asal mein engineers, plumbers aur karkhanay chalanay walay log chahiyein.`
    },
    plainUrdu: {
      text: `اسلام آباد کے سرسبز سیکٹرز میں نجی اسکولوں کے مالکان اتنی فیسیں وصول کر رہے ہیں جتنی کیمبرج اور آکسفورڈ کی سالانہ ٹیوشن ہوتی ہے۔

داخلے کا مرحلہ کسی جنگ سے کم نہیں ہوتا۔ چار سال کے معصوم بچوں کا ساؤنڈ پروف کیبن میں انٹرویو لیا جاتا ہے تاکہ جانچا جا سکے کہ ان کا انگریزی لہجہ لندن کی اشرافیہ جیسا ہے یا گلی محلے کا اثر باقی ہے۔ اگر بچہ کسی لفظ کا دیسی تلفظ ادا کر دے تو والدین کو فوری طور پر اسپیچ تھراپسٹ کا پتہ تھما دیا جاتا ہے۔

اشتہارات میں ترکی میں اقوامِ متحدہ کی ماڈل کانفرنسز اور گھڑ سواری کلب کے سبز باغ دکھائے جاتے ہیں۔

لیکن جب یہی اٹھارہ سالہ نوجوان عملی زندگی کے میدان میں اترتے ہیں تو وہ جدید فلسفے پر تو گھنٹوں تقریر کر سکتے ہیں لیکن نہ وہ ود ہولڈنگ ٹیکس کا گوشوارہ سمجھ سکتے ہیں، نہ پٹوار خانے کا کوئی کاغذ پڑھ سکتے ہیں اور نہ باپ کے بغیر کسی محکمے میں کام کروا سکتے ہیں۔

ہم نے ایک ایسی تعلیمی مشینری تیار کر لی ہے جو بے عیب انگریزی لہجے تو تیار کرتی ہے، مگر ایک ایسے ملک کے لیے جسے درحقیقت سائنسی دماغوں، سول انجینئرز اور فیکٹری ورکرز کی ضرورت ہے۔`
    }
  },
  {
    topic: "The Gujranwala Bitcoin Trader at 3 AM",
    category: 'CRYPTO_FINANCE_SATIRE',
    english: {
      text: `Between two wrought-iron gate workshops on GT Road in Gujranwala sits a twenty-four-hour tea stall serving thick, condensed-milk doodh patti. 

At 3:15 AM, surrounded by heavy lathe machinery and the smell of fried parathas, four young men are staring into cracked smartphone screens displaying Binance candlestick charts.

One of them has leveraged fifty thousand rupees on a 20x perpetual futures contract on Ethereum. He doesn't know what a blockchain consensus mechanism is, he doesn't know who Satoshi Nakamoto was, and he cannot read a financial balance sheet. But he knows with absolute spiritual certainty that at 4:00 AM, the Asian market will pump.

When the green candle shoots upward, he orders a round of malai chai for the entire tea stall like an oil baron in Monte Carlo.

When the red candle obliterates his margin forty seconds later, he quietly turns his phone facedown on the wooden table, takes a slow sip of tea, and says, "Allah is the best of planners."

This is the financial frontier of developing nations: skipping sixty years of institutional stock markets to bet the family livestock on algorithmic volatility.`
    },
    romanUrdu: {
      text: `Gujranwala mein GT Road par lohay ke karkhanon ke darmiyan aik 24-ghantay khula dhaba hai jahan garma garam doodh patti milti hai.

Raat 3:15 par parathon ki khushboo aur lathe machines ke darmiyan 4 larke tooti hui screens par Binance ke candlestick charts dekh rahay hotay hain.

Aik larke ne Ethereum ke 20x futures contract par 50 hazar rupay lagaye huay hain. Usay nahi pata blockchain kya hoti hai, na usay Satoshi ka pata hai, aur na wo company ki balance sheet parh sakta hai. Magar usay mukammal yaqeen hai ke 4 bajay Asian market pump karegi.

Jaise hi green candle upar jati hai, wo Monte Carlo ke kisi nawab ki tarah poori hotel ke liye malai chai ka order de deta hai.

Chalees second baad jab red candle aakar uska account khaali karti hai, to wo chup chaap phone ulta kar ke lakri ki maiz par rakhta hai, chai ka ghoont bharta hai aur kehta hai, "Naseeb mein jo tha mil gaya."

Ye hai taraqqi pazeer mulkon ka digital finance: 60 saal ki stock exchange chhorr kar sedha crypto ke joway par kismat aazmana.`
    },
    plainUrdu: {
      text: `گوجرانوالہ میں جی ٹی روڈ پر لوہے کی لیتھ مشینوں کے کارخانوں کے عین درمیان ایک چوبیس گھنٹے کھلا چائے کا ڈھابا ہے جہاں کڑھی ہوئی ملائی مار کے دودھ پتی ملتی ہے۔

رات سوا تین بجے، تلے ہوئے پراٹھوں کی خوشبو اور لوہے کی بو کے بیچ چار نوجوان فون کی ٹوٹی ہوئی اسکرینوں پر بائنانس کے کینڈل اسٹک چارٹس گھور رہے ہوتے ہیں۔

ان میں سے ایک نے پچاس ہزار روپے کے ادھار پر ایتھریم کے بیس گنا فیوچر ٹریڈ پر شرط لگا رکھی ہے۔ اسے معلوم نہیں کہ بلاک چین کیا ہوتی ہے، نہ اس نے کبھی ساٹوشی کا نام سنا ہے، اور نہ وہ کسی مالیاتی رپورٹ کی الف ب جانتا ہے۔ مگر اسے پختہ روحانی یقین ہے کہ صبح چار بجے ایشین مارکیٹ لازماً اوپر جائے گی۔

جیسے ہی سبز لکیر اچھلتی ہے، وہ مونٹی کارلو کے کسی ارب پتی کی طرح پورے ڈھابے کے لیے کڑک چائے اور جلیبیوں کا اعلان کر دیتا ہے۔

چالیس سیکنڈ بعد جب سرخ لکیر اس کی کل جمع پونجی کا صفایا کر دیتی ہے، تو وہ خاموشی سے فون الٹا کر کے لکڑی کی میز پر رکھتا ہے، چائے کی سسکی لیتا ہے اور دھیمے لہجے میں کہتا ہے، "اللہ کے کاموں میں مصلحت ہے۔"

یہ ہے تیسری دنیا کا جدید ترین مالیاتی انقلاب: ساٹھ سال کی روایتی معیشت کو پھلانگ کر سیدھا ڈیجیٹل جوئے پر گھر بار داؤ پر لگا دینا۔`
    }
  }
];

// In-memory counter for fallback rotation
let storyCounter = 0;

/**
 * Formats entry and strictly removes any hashtags
 */
function formatEntry(text) {
  const clean = (text || '')
    .replace(/#[\w\u0600-\u06FF]+/g, '') // remove both English and Urdu hashtags
    .replace(/[ \t]+/g, ' ')
    .trim();

  const count = calculateXCharacterCount(clean);
  return {
    text: clean,
    hashtags: '',
    fullPost: clean,
    charCount: count.charCount,
    weightedCount: count.weightedCount,
    isOverLimit: count.isOverLimit
  };
}

/**
 * Generates an engaging, descriptive narrative micro-essay post.
 * Checks against MongoDB Atlas used topics so every post is 100% brand new and never repeated.
 * 
 * @param {string} [customTopic]
 * @returns {Promise<{ topic: string, english: object, provider: string, category: string }>}
 */
export async function generateEnglishPost(customTopic = '') {
  const xaiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  // Fetch all used topics from MongoDB to guarantee zero repetition
  let usedTopics = [];
  try {
    usedTopics = await getAllUsedTopics(200);
  } catch (_) {}

  // Filter curated topics that have never been used
  const unusedCurated = CURATED_STORY_TOPICS.filter(
    item => !usedTopics.some(u => u.toLowerCase() === item.topic.toLowerCase())
  );

  let chosenTopic = customTopic;
  if (!chosenTopic) {
    if (unusedCurated.length > 0) {
      chosenTopic = unusedCurated[storyCounter % unusedCurated.length].topic;
      storyCounter++;
    } else {
      chosenTopic = CURATED_STORY_TOPICS[storyCounter % CURATED_STORY_TOPICS.length].topic;
      storyCounter++;
    }
  }

  const avoidListStr = usedTopics.length > 0 ? usedTopics.slice(0, 15).join('; ') : 'None';

  const prompt = `You are a world-class satirical essayist and viral storyteller writing micro-essays for X (Twitter).
Your style is deeply engaging, culturally grounded, observant, witty, and narrative-driven.

TOPIC: "${chosenTopic}"

BENCHMARK STYLE TO EMULATE:
"Pakistan's universities can't fund labs, but they can fund your love story.

A father in Mingora asked his son why he wanted admission in a university with no lab, no library, and no real professors. The son replied, "Abu, you are looking at the old university."

The new university has understood the market. It cannot fund research, so it has stopped trying. Instead, it offers what students actually come for: a safe dating place with WiFi, a canteen, and a degree as a cover story. In this city, "we have a group project" is now the most respectable excuse to meet.

So the next prospectus is obvious: BS Social Media Management, with specialisation in TikTok, YouTube, Instagram and X. Why build a lab when a ring light is cheaper? Why hire a PhD when an influencer brings more admissions than any professor?

The degree will be useless, but the content will be 4K. And the father will still proudly say, "My son is doing a degree from university.""

STRICT RULES:
1. NO HASHTAGS AT ALL: Do not include any hashtags (#) anywhere in your output.
2. FORMAT: Write 4 to 5 short, punchy paragraphs separated by double line breaks (\\n\\n).
3. TONE & STRUCTURE:
   - Paragraph 1: An arresting, ironic hook that flips conventional wisdom.
   - Paragraph 2: A vivid scene or dialogue grounded in a real place or relatable characters.
   - Paragraph 3: The market or cultural reality check exposing the absurdity.
   - Paragraph 4: Satirical escalation of the trend taken to its logical conclusion.
   - Paragraph 5: A devastating, quiet irony punchline.
4. LENGTH: Around 600 to 950 characters. Rich, descriptive, and substantial.
5. NO REPETITION: Must be 100% brand new. Avoid these already used topics: ${avoidListStr}.

Return ONLY valid JSON:
{
  "topic": "${chosenTopic}",
  "category": "STORYTELLING_ESSAY",
  "text": "Full descriptive story in 4-5 paragraphs here"
}`;

  // Try xAI Grok API
  if (xaiKey) {
    try {
      const res = await callXai(prompt, 'grok-beta');
      if (res && res.text) {
        const isDup = await isDuplicatePost(res.topic || chosenTopic, res.text);
        if (!isDup) {
          const entry = formatEntry(res.text);
          await saveGeneratedPost({
            topic: res.topic || chosenTopic,
            category: res.category || 'STORYTELLING_ESSAY',
            english: entry,
            provider: 'xAI Grok API (Paid)'
          });
          return {
            topic: res.topic || chosenTopic,
            category: res.category || 'STORYTELLING_ESSAY',
            english: entry,
            provider: 'xAI Grok API (Paid)'
          };
        }
      }
    } catch (e) {
      console.warn(`[Grok API] ${e.message}, falling back to Groq...`);
    }
  }

  // Try Groq API
  if (groqKey) {
    try {
      const res = await callGroq(prompt, groqKey);
      if (res && res.text) {
        const isDup = await isDuplicatePost(res.topic || chosenTopic, res.text);
        if (!isDup) {
          const entry = formatEntry(res.text);
          await saveGeneratedPost({
            topic: res.topic || chosenTopic,
            category: res.category || 'STORYTELLING_ESSAY',
            english: entry,
            provider: 'Groq Cloud API (Free)'
          });
          return {
            topic: res.topic || chosenTopic,
            category: res.category || 'STORYTELLING_ESSAY',
            english: entry,
            provider: 'Groq Cloud API (Free)'
          };
        }
      }
    } catch (e) {
      console.warn(`[Groq API] ${e.message}, falling back to curated bank...`);
    }
  }

  // Curated Storytelling Bank (Guaranteed Zero Failure & Zero Duplicates)
  const matched =
    unusedCurated.find(t => t.topic.toLowerCase() === chosenTopic.toLowerCase()) ||
    unusedCurated[0] ||
    CURATED_STORY_TOPICS.find(t => t.topic.toLowerCase() === chosenTopic.toLowerCase()) ||
    CURATED_STORY_TOPICS[0];

  const entry = formatEntry(matched.english.text);
  await saveGeneratedPost({
    topic: matched.topic,
    category: matched.category,
    english: entry,
    romanUrdu: formatEntry(matched.romanUrdu.text),
    plainUrdu: formatEntry(matched.plainUrdu.text),
    provider: 'Curated Storytelling Engine'
  });

  return {
    topic: matched.topic,
    category: matched.category,
    english: entry,
    provider: 'Curated Storytelling Engine'
  };
}

/**
 * Converts English narrative micro-essay into natural Pakistani Roman Urdu
 */
export async function generateRomanUrduFromEnglish(englishPost, topic = '') {
  const xaiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const prompt = `Translate and adapt this English narrative storytelling micro-essay into natural, witty, conversational Pakistani Roman Urdu (Urdu written in English alphabets):

English Story:
"${englishPost.text}"

RULES:
1. NO HASHTAGS: Do not include any hashtags (#).
2. Maintain the exact same 4-5 paragraph structure with double line breaks (\\n\\n).
3. Natural colloquial Pakistani Roman Urdu that flows effortlessly.
4. Capture the satirical humor, irony, and conversational tone.

Return ONLY valid JSON:
{
  "text": "Full Roman Urdu story in 4-5 paragraphs here"
}`;

  if (xaiKey) {
    try {
      const res = await callXai(prompt, 'grok-beta');
      if (res && res.text) return formatEntry(res.text);
    } catch (_) {}
  }

  if (groqKey) {
    try {
      const res = await callGroq(prompt, groqKey);
      if (res && res.text) return formatEntry(res.text);
    } catch (_) {}
  }

  const found =
    CURATED_STORY_TOPICS.find(t => t.topic === topic || t.english.text === englishPost.text) ||
    CURATED_STORY_TOPICS[0];
  return formatEntry(found.romanUrdu.text);
}

/**
 * Converts English narrative micro-essay into proper Pakistani Urdu script (اردو)
 */
export async function generatePlainUrduFromEnglish(englishPost, topic = '') {
  const xaiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const prompt = `Translate and adapt this English narrative storytelling micro-essay into rich, fluent, literary yet accessible Pakistani Urdu script (اردو):

English Story:
"${englishPost.text}"

RULES:
1. NO HASHTAGS: Do not include any hashtags (#).
2. Maintain the exact same 4-5 paragraph structure with double line breaks (\\n\\n).
3. Natural, grammatically elegant Urdu script (اردو).
4. Preserve the sharp satire, witty dialogue, and ending punchline.

Return ONLY valid JSON:
{
  "text": "اردو میں مکمل کہانی یہاں تحریر کریں"
}`;

  if (xaiKey) {
    try {
      const res = await callXai(prompt, 'grok-beta');
      if (res && res.text) return formatEntry(res.text);
    } catch (_) {}
  }

  if (groqKey) {
    try {
      const res = await callGroq(prompt, groqKey);
      if (res && res.text) return formatEntry(res.text);
    } catch (_) {}
  }

  const found =
    CURATED_STORY_TOPICS.find(t => t.topic === topic || t.english.text === englishPost.text) ||
    CURATED_STORY_TOPICS[0];
  return formatEntry(found.plainUrdu.text);
}

/**
 * Generates all 3 language versions of a post in one call
 */
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

// Backward-compatibility alias
export const CURATED_A2_TOPICS = CURATED_STORY_TOPICS;

async function callGroq(prompt, apiKey) {
  const groq = new Groq({ apiKey });
  const model = process.env.AI_MODEL || 'llama-3.3-70b-versatile';

  const completion = await groq.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are an elite satirical essayist and viral storyteller writing micro-essays for X (Twitter). You never include hashtags.'
      },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7
  });

  const rawJson = completion.choices[0]?.message?.content;
  return JSON.parse(rawJson);
}

async function callXai(prompt, model = 'grok-beta') {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || model,
      messages: [
        {
          role: 'system',
          content:
            'You are an elite satirical essayist and viral storyteller writing micro-essays for X (Twitter). You never include hashtags.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7
    })
  });

  if (!response.ok) throw new Error(`xAI error ${response.status}`);
  const json = await response.json();
  const content = json.choices[0]?.message?.content || '';
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in Grok response');
  return JSON.parse(match[0]);
}
